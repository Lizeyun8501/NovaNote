use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use notify::{Event, EventKind, RecursiveMode, Watcher};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum VaultError {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("SQLite error: {0}")]
    Sqlite(#[from] rusqlite::Error),
    #[error("Serde error: {0}")]
    Serde(#[from] serde_json::Error),
    #[error("Already a vault")]
    AlreadyVault,
    #[error("Not a vault")]
    NotVault,
    #[error("{0}")]
    Other(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VaultConfig {
    pub id: String,
    pub name: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NoteMeta {
    pub id: String,
    pub title: String,
    pub relative_path: String,
    pub tags: Vec<String>,
    pub created_at: String,
    pub updated_at: String,
}

pub fn add(left: u64, right: u64) -> u64 {
    left + right
}

pub struct Vault {
    pub root_path: PathBuf,
    pub config: VaultConfig,
    conn: Mutex<Connection>,
}

impl Vault {
    /// Create a new vault at the given directory path
    pub fn create(root: &Path) -> Result<Self, VaultError> {
        let vault_dir = root.join(".vault");
        let config_path = vault_dir.join("config.json");

        if config_path.exists() {
            return Err(VaultError::AlreadyVault);
        }

        // Ensure root directory exists
        fs::create_dir_all(root)?;

        // Create .vault directory
        fs::create_dir_all(&vault_dir)?;

        // Create config
        let config = VaultConfig {
            id: uuid::Uuid::new_v4().to_string(),
            name: root
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_else(|| "Untitled".to_string()),
            created_at: chrono::Utc::now().to_rfc3339(),
        };

        let config_json = serde_json::to_string_pretty(&config)?;
        fs::write(&config_path, config_json)?;

        // Open or create the database
        let db_path = vault_dir.join("index.db");
        let conn = Connection::open(&db_path)?;

        // Enable WAL mode for better concurrent access
        conn.execute_batch("PRAGMA journal_mode=WAL;")?;

        Self::init_db(&conn)?;

        Ok(Vault {
            root_path: root.to_path_buf(),
            config,
            conn: Mutex::new(conn),
        })
    }

    /// Open an existing vault
    pub fn open(root: &Path) -> Result<Self, VaultError> {
        let config_path = root.join(".vault").join("config.json");

        if !config_path.exists() {
            return Err(VaultError::NotVault);
        }

        let config_json = fs::read_to_string(&config_path)?;
        let config: VaultConfig = serde_json::from_str(&config_json)?;

        let db_path = root.join(".vault").join("index.db");
        let conn = Connection::open(&db_path)?;
        conn.execute_batch("PRAGMA journal_mode=WAL;")?;

        Self::init_db(&conn)?;

        Ok(Vault {
            root_path: root.to_path_buf(),
            config,
            conn: Mutex::new(conn),
        })
    }

    /// Initialize SQLite schema (notes table, fts table, triggers)
    fn init_db(conn: &Connection) -> Result<(), VaultError> {
        conn.execute_batch(
            "
            CREATE TABLE IF NOT EXISTS notes (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                relative_path TEXT NOT NULL UNIQUE,
                tags TEXT DEFAULT '[]',
                content TEXT DEFAULT '',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
                title, content, content=notes, content_rowid=rowid
            );

            -- Triggers to keep FTS in sync
            CREATE TRIGGER IF NOT EXISTS notes_ai AFTER INSERT ON notes BEGIN
                INSERT INTO notes_fts(rowid, title, content) VALUES (new.rowid, new.title, new.content);
            END;

            CREATE TRIGGER IF NOT EXISTS notes_ad AFTER DELETE ON notes BEGIN
                INSERT INTO notes_fts(notes_fts, rowid, title, content) VALUES ('delete', old.rowid, old.title, old.content);
            END;

            CREATE TRIGGER IF NOT EXISTS notes_au AFTER UPDATE ON notes BEGIN
                INSERT INTO notes_fts(notes_fts, rowid, title, content) VALUES ('delete', old.rowid, old.title, old.content);
                INSERT INTO notes_fts(rowid, title, content) VALUES (new.rowid, new.title, new.content);
            END;
            ",
        )?;

        Ok(())
    }

    /// Scan all .md files and index them
    pub fn full_scan(&self) -> Result<Vec<NoteMeta>, VaultError> {
        let mut results = Vec::new();

        for entry in walkdir::WalkDir::new(&self.root_path)
            .into_iter()
            .filter_map(|e| e.ok())
        {
            let path = entry.path();

            // Skip .vault directory and any hidden files
            if path
                .components()
                .any(|c| c.as_os_str().to_string_lossy().starts_with('.'))
            {
                continue;
            }

            if path.extension().map(|e| e == "md").unwrap_or(false) {
                match self.index_file(path) {
                    Ok(meta) => results.push(meta),
                    Err(e) => eprintln!("Warning: failed to index {}: {}", path.display(), e),
                }
            }
        }

        // After bulk indexing, rebuild FTS for consistency
        {
            let conn = self.conn.lock().map_err(|e| VaultError::Other(e.to_string()))?;
            conn.execute_batch("INSERT INTO notes_fts(notes_fts) VALUES ('rebuild');")?;
        }

        Ok(results)
    }

    /// Index a single markdown file
    pub fn index_file(&self, path: &Path) -> Result<NoteMeta, VaultError> {
        // Compute relative path from root
        let relative_path = path
            .strip_prefix(&self.root_path)
            .map_err(|e| VaultError::Other(format!("Failed to get relative path: {}", e)))?
            .to_string_lossy()
            .to_string();

        let content = fs::read_to_string(path)?;

        let (title, tags) = Self::parse_frontmatter(&content);

        // Get file timestamps
        let metadata = fs::metadata(path)?;
        let modified = metadata
            .modified()
            .ok()
            .map(|t| {
                chrono::DateTime::<chrono::Utc>::from(t)
                    .to_rfc3339()
            })
            .unwrap_or_else(|| chrono::Utc::now().to_rfc3339());

        let id = uuid::Uuid::new_v4().to_string();
        let created_at = chrono::Utc::now().to_rfc3339();
        let tags_json = serde_json::to_string(&tags)?;

        let conn = self.conn.lock().map_err(|e| VaultError::Other(e.to_string()))?;

        conn.execute(
            "INSERT INTO notes (id, title, relative_path, tags, content, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
             ON CONFLICT(relative_path) DO UPDATE SET
                title = excluded.title,
                tags = excluded.tags,
                content = excluded.content,
                updated_at = excluded.updated_at",
            params![id, title, relative_path, tags_json, content, created_at, modified],
        )?;

        Ok(NoteMeta {
            id,
            title,
            relative_path,
            tags,
            created_at,
            updated_at: modified,
        })
    }

    /// Remove a file from the index
    pub fn remove_file(&self, relative_path: &str) -> Result<(), VaultError> {
        let conn = self.conn.lock().map_err(|e| VaultError::Other(e.to_string()))?;
        conn.execute(
            "DELETE FROM notes WHERE relative_path = ?1",
            params![relative_path],
        )?;
        Ok(())
    }

    /// Start watching the vault directory for file changes
    pub fn start_watcher(&self) -> Result<(), VaultError> {
        let (tx, rx) = std::sync::mpsc::channel();
        let mut watcher = notify::recommended_watcher(move |res: Result<Event, notify::Error>| {
            if let Ok(event) = res {
                tx.send(event).ok();
            }
        })
        .map_err(|e| VaultError::Other(e.to_string()))?;

        watcher
            .watch(&self.root_path, RecursiveMode::Recursive)
            .map_err(|e| VaultError::Other(e.to_string()))?;

        // Spawn a thread that processes events. The watcher must be kept alive.
        std::thread::spawn(move || {
            for event in rx {
                match event.kind {
                    EventKind::Create(_) | EventKind::Modify(_) => {
                        for path in &event.paths {
                            if path.extension().map_or(false, |e| e == "md") {
                                println!("File changed: {:?}", path);
                            }
                        }
                    }
                    EventKind::Remove(_) => {
                        println!("File removed: {:?}", event.paths);
                    }
                    _ => {}
                }
            }
            // watcher is dropped here when rx disconnects
            drop(watcher);
        });

        Ok(())
    }

    /// Full-text search using FTS5
    pub fn search(&self, query: &str) -> Result<Vec<NoteMeta>, VaultError> {
        let conn = self.conn.lock().map_err(|e| VaultError::Other(e.to_string()))?;

        // Escape FTS5 special characters if needed, and wrap in quotes for phrase search
        let sanitized = query.replace('"', "\"\"");
        let fts_query = format!("\"{}\"", sanitized);

        let sql = "SELECT n.id, n.title, n.relative_path, n.tags, n.created_at, n.updated_at
                   FROM notes n
                   INNER JOIN notes_fts fts ON n.rowid = fts.rowid
                   WHERE notes_fts MATCH ?1
                   ORDER BY rank
                   LIMIT 50";

        let mut stmt = conn.prepare(sql)?;
        let rows = stmt.query_map(params![fts_query], |row| {
            let tags_str: String = row.get(3)?;
            let tags: Vec<String> = serde_json::from_str(&tags_str).unwrap_or_default();

            Ok(NoteMeta {
                id: row.get(0)?,
                title: row.get(1)?,
                relative_path: row.get(2)?,
                tags,
                created_at: row.get(4)?,
                updated_at: row.get(5)?,
            })
        })?;

        let mut results = Vec::new();
        for row in rows {
            results.push(row?);
        }

        Ok(results)
    }

    /// Get all indexed notes
    pub fn list_notes(&self) -> Result<Vec<NoteMeta>, VaultError> {
        let conn = self.conn.lock().map_err(|e| VaultError::Other(e.to_string()))?;

        let mut stmt = conn.prepare(
            "SELECT id, title, relative_path, tags, created_at, updated_at FROM notes ORDER BY updated_at DESC",
        )?;

        let rows = stmt.query_map([], |row| {
            let tags_str: String = row.get(3)?;
            let tags: Vec<String> = serde_json::from_str(&tags_str).unwrap_or_default();

            Ok(NoteMeta {
                id: row.get(0)?,
                title: row.get(1)?,
                relative_path: row.get(2)?,
                tags,
                created_at: row.get(4)?,
                updated_at: row.get(5)?,
            })
        })?;

        let mut results = Vec::new();
        for row in rows {
            results.push(row?);
        }

        Ok(results)
    }

    /// Check if a path is a vault
    pub fn is_vault(path: &Path) -> bool {
        path.join(".vault").join("config.json").exists()
    }

    /// Parse YAML frontmatter from markdown content to extract title and tags
    fn parse_frontmatter(content: &str) -> (String, Vec<String>) {
        let mut title = String::new();
        let mut tags = Vec::new();

        let trimmed = content.trim_start();
        if !trimmed.starts_with("---") {
            // No frontmatter, try first heading as fallback
            return (
                Self::extract_first_heading(content),
                Vec::new(),
            );
        }

        // Find the frontmatter block between --- and ---
        let after_first = &trimmed[3..]; // skip first ---
        let end_marker = after_first.find("\n---");
        if let Some(end) = end_marker {
            let frontmatter = &after_first[..end];
            let _body = &content[(3 + end + 4)..];

            for line in frontmatter.lines() {
                let line = line.trim();

                if line.is_empty() {
                    continue;
                }

                // Parse "key: value" pairs
                if let Some(colon_pos) = line.find(':') {
                    let key = line[..colon_pos].trim().to_lowercase();
                    let value = line[colon_pos + 1..].trim();

                    match key.as_str() {
                        "title" => {
                            title = value.to_string();
                        }
                        "tags" => {
                            tags = parse_tags_value(value);
                        }
                        _ => {}
                    }
                }
            }
        }

        // Fallback to first heading if no title found
        if title.is_empty() {
            title = Self::extract_first_heading(content);
        }

        (title, tags)
    }

    fn extract_first_heading(content: &str) -> String {
        for line in content.lines() {
            let trimmed = line.trim();
            if trimmed.starts_with("# ") {
                return trimmed[2..].trim().to_string();
            }
        }

        // Fallback: use filename-style or "Untitled"
        "Untitled".to_string()
    }
}

/// Parse tags value from frontmatter.
/// Supports formats:
///   tags: [tag1, tag2]
///   tags: tag1, tag2
fn parse_tags_value(value: &str) -> Vec<String> {
    let value = value.trim();

    // Array format: [tag1, tag2]
    if value.starts_with('[') && value.ends_with(']') {
        let inner = &value[1..value.len() - 1];
        return inner
            .split(',')
            .map(|s| s.trim().trim_matches('"').trim_matches('\'').to_string())
            .filter(|s| !s.is_empty())
            .collect();
    }

    // Comma-separated format: tag1, tag2
    value
        .split(',')
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_frontmatter_with_title_and_tags() {
        let content = "---\ntitle: My Note\ntags: [rust, tauri]\n---\n\n# Hello\nContent here.";
        let (title, tags) = Vault::parse_frontmatter(content);
        assert_eq!(title, "My Note");
        assert_eq!(tags, vec!["rust", "tauri"]);
    }

    #[test]
    fn test_parse_frontmatter_comma_tags() {
        let content = "---\ntitle: Test\ntags: rust, tauri, notes\n---\n\nContent.";
        let (title, tags) = Vault::parse_frontmatter(content);
        assert_eq!(title, "Test");
        assert_eq!(tags, vec!["rust", "tauri", "notes"]);
    }

    #[test]
    fn test_parse_frontmatter_no_frontmatter() {
        let content = "# My Document\n\nSome content.";
        let (title, tags) = Vault::parse_frontmatter(content);
        assert_eq!(title, "My Document");
        assert!(tags.is_empty());
    }

    #[test]
    fn test_parse_frontmatter_no_title_fallback() {
        let content = "---\ntags: [dev]\n---\n\n# Fallback Title\n\nMore.";
        let (title, tags) = Vault::parse_frontmatter(content);
        assert_eq!(title, "Fallback Title");
        assert_eq!(tags, vec!["dev"]);
    }

    #[test]
    fn test_parse_frontmatter_empty() {
        let content = "";
        let (title, tags) = Vault::parse_frontmatter(content);
        assert_eq!(title, "Untitled");
        assert!(tags.is_empty());
    }

    #[test]
    fn test_is_vault() {
        let temp = std::env::temp_dir().join("novanote_test_vault");
        let _ = std::fs::remove_dir_all(&temp);
        std::fs::create_dir_all(temp.join(".vault")).unwrap();
        std::fs::write(temp.join(".vault").join("config.json"), "{}").unwrap();

        assert!(Vault::is_vault(&temp));

        let _ = std::fs::remove_dir_all(&temp);
    }

    #[test]
    fn test_parse_tags_value_array() {
        let result = parse_tags_value("[rust, tauri, notes]");
        assert_eq!(result, vec!["rust", "tauri", "notes"]);
    }

    #[test]
    fn test_parse_tags_value_comma() {
        let result = parse_tags_value("rust, tauri");
        assert_eq!(result, vec!["rust", "tauri"]);
    }
}