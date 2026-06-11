use rusqlite::{params, Connection};
use std::path::Path;
use tokio::sync::Mutex;

use crate::{VaultError, NoteMeta, GraphData, GraphNode, GraphEdge};

/// Helper: acquire the `tokio::sync::Mutex` lock in a sync context.
fn block_lock<T>(mutex: &Mutex<T>) -> tokio::sync::MutexGuard<'_, T> {
    tokio::runtime::Handle::current().block_on(mutex.lock())
}

/// Database operations for a vault.
/// Owns the SQLite connection and provides all CRUD + index operations.
pub struct VaultDb {
    conn: Mutex<Connection>,
}

impl VaultDb {
    pub fn open(db_path: &Path) -> Result<Self, VaultError> {
        let conn = Connection::open(db_path)?;
        conn.execute_batch("PRAGMA journal_mode=WAL;")?;
        Self::init_schema(&conn)?;
        Ok(VaultDb {
            conn: Mutex::new(conn),
        })
    }

    /// Access the raw `Connection` guard. Use sparingly — prefer the methods on `VaultDb`.
    /// The caller must ensure the lock is not held across `.await` points.
    pub fn conn(&self) -> tokio::sync::MutexGuard<'_, Connection> {
        block_lock(&self.conn)
    }

    fn init_schema(conn: &Connection) -> Result<(), VaultError> {
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
            CREATE TABLE IF NOT EXISTS tags (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE
            );
            CREATE TABLE IF NOT EXISTS note_tags (
                note_id TEXT NOT NULL,
                tag_name TEXT NOT NULL,
                PRIMARY KEY (note_id, tag_name),
                FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS idx_note_tags_tag ON note_tags(tag_name);
            CREATE TABLE IF NOT EXISTS links (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                source_path TEXT NOT NULL,
                target_path TEXT NOT NULL,
                link_text TEXT NOT NULL,
                target_heading TEXT DEFAULT '',
                target_block_id TEXT DEFAULT '',
                FOREIGN KEY (source_path) REFERENCES notes(relative_path) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS idx_links_source ON links(source_path);
            CREATE INDEX IF NOT EXISTS idx_links_target ON links(target_path);
            CREATE TABLE IF NOT EXISTS embeddings (
                relative_path TEXT PRIMARY KEY,
                embedding BLOB NOT NULL,
                generated_at TEXT NOT NULL,
                model TEXT NOT NULL,
                FOREIGN KEY (relative_path) REFERENCES notes(relative_path) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS idx_embeddings_path ON embeddings(relative_path);
            ",
        )?;
        Ok(())
    }

    // ── Note CRUD ──────────────────────────────────────────────────────

    /// Insert or update a note's metadata + content in the index.
    pub fn upsert_note(&self, id: &str, title: &str, relative_path: &str, tags_json: &str, content: &str, created_at: &str, updated_at: &str) -> Result<(), VaultError> {
        let conn = block_lock(&self.conn);
        conn.execute(
            "INSERT INTO notes (id, title, relative_path, tags, content, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
             ON CONFLICT(relative_path) DO UPDATE SET
                title = excluded.title, tags = excluded.tags, content = excluded.content, updated_at = excluded.updated_at",
            params![id, title, relative_path, tags_json, content, created_at, updated_at],
        )?;
        Ok(())
    }

    /// Get the actual id for a relative_path (may differ from the id passed to upsert).
    pub fn get_id_by_path(&self, relative_path: &str) -> Result<String, VaultError> {
        let conn = block_lock(&self.conn);
        conn.query_row(
            "SELECT id FROM notes WHERE relative_path = ?1",
            params![relative_path],
            |row| row.get(0),
        ).map_err(VaultError::Sqlite)
    }

    /// Delete a note from the index.
    pub fn delete_note(&self, relative_path: &str) -> Result<(), VaultError> {
        let conn = block_lock(&self.conn);
        conn.execute("DELETE FROM notes WHERE relative_path = ?1", params![relative_path])?;
        Ok(())
    }

    /// Rebuild the FTS index.
    pub fn rebuild_fts(&self) -> Result<(), VaultError> {
        let conn = block_lock(&self.conn);
        conn.execute_batch("INSERT INTO notes_fts(notes_fts) VALUES ('rebuild');")?;
        Ok(())
    }

    // ── Links ──────────────────────────────────────────────────────────

    /// Replace all links for a source path with the given set.
    pub fn replace_links(
        &self,
        source_path: &str,
        links: &[(String, String, String, String)],
    ) -> Result<(), VaultError> {
        let conn = block_lock(&self.conn);
        conn.execute("DELETE FROM links WHERE source_path = ?1", params![source_path])?;
        for (target_path, link_text, target_heading, target_block_id) in links {
            conn.execute(
                "INSERT INTO links (source_path, target_path, link_text, target_heading, target_block_id) VALUES (?1, ?2, ?3, ?4, ?5)",
                params![source_path, target_path, link_text, target_heading, target_block_id],
            )?;
        }
        Ok(())
    }

    /// Get all links as (source, target) pairs.
    pub fn get_all_links(&self) -> Result<Vec<(String, String)>, VaultError> {
        let conn = block_lock(&self.conn);
        let sql = "SELECT source_path, target_path FROM links";
        let mut stmt = conn.prepare(sql).map_err(VaultError::Sqlite)?;
        let rows = stmt.query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)))
            .map_err(VaultError::Sqlite)?;
        Ok(rows.filter_map(|r| r.ok()).collect())
    }

    // ── Tags ───────────────────────────────────────────────────────────

    /// Update tag associations for a note.
    pub fn update_tags(&self, note_id: &str, tags: &[String]) -> Result<(), VaultError> {
        let conn = block_lock(&self.conn);
        conn.execute("DELETE FROM note_tags WHERE note_id = ?1", params![note_id])?;
        for tag in tags {
            conn.execute("INSERT OR IGNORE INTO tags (name) VALUES (?1)", params![tag])?;
            conn.execute(
                "INSERT INTO note_tags (note_id, tag_name) VALUES (?1, ?2)",
                params![note_id, tag],
            )?;
        }
        Ok(())
    }

    /// List all tags with note counts.
    pub fn list_tags(&self) -> Result<Vec<(String, i32)>, VaultError> {
        let conn = block_lock(&self.conn);
        let sql = "SELECT t.name, COUNT(nt.note_id) as count FROM tags t
                   LEFT JOIN note_tags nt ON t.name = nt.tag_name GROUP BY t.name ORDER BY count DESC, t.name ASC";
        let mut stmt = conn.prepare(sql)?;
        let rows = stmt.query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, i32>(1)?)))?;
        Ok(rows.filter_map(|r| r.ok()).collect())
    }

    /// Get notes by tag.
    pub fn get_notes_by_tag(&self, tag: &str) -> Result<Vec<NoteMeta>, VaultError> {
        let conn = block_lock(&self.conn);
        let sql = "SELECT n.id, n.title, n.relative_path, n.tags, n.created_at, n.updated_at
                   FROM notes n INNER JOIN note_tags nt ON n.id = nt.note_id
                   WHERE nt.tag_name = ?1 ORDER BY n.updated_at DESC";
        let mut stmt = conn.prepare(sql)?;
        let rows = stmt.query_map(params![tag], |row| {
            Ok(NoteMeta {
                id: row.get(0)?, title: row.get(1)?, relative_path: row.get(2)?,
                tags: serde_json::from_str(&row.get::<_, String>(3)?).unwrap_or_default(),
                created_at: row.get(4)?, updated_at: row.get(5)?,
            })
        })?;
        Ok(rows.filter_map(|r| r.ok()).collect())
    }

    // ── List / Backlinks / Graph ───────────────────────────────────────

    /// List all notes ordered by most recently updated.
    pub fn list_notes(&self) -> Result<Vec<NoteMeta>, VaultError> {
        let conn = block_lock(&self.conn);
        let mut stmt = conn.prepare(
            "SELECT id, title, relative_path, tags, created_at, updated_at FROM notes ORDER BY updated_at DESC")?;
        let rows = stmt.query_map([], |row| {
            Ok(NoteMeta {
                id: row.get(0)?, title: row.get(1)?, relative_path: row.get(2)?,
                tags: serde_json::from_str(&row.get::<_, String>(3)?).unwrap_or_default(),
                created_at: row.get(4)?, updated_at: row.get(5)?,
            })
        })?;
        Ok(rows.filter_map(|r| r.ok()).collect())
    }

    /// Get backlinks pointing to a note.
    pub fn get_backlinks(&self, relative_path: &str) -> Result<Vec<NoteMeta>, VaultError> {
        let conn = block_lock(&self.conn);
        let sql = "SELECT n.id, n.title, n.relative_path, n.tags, n.created_at, n.updated_at
                   FROM notes n INNER JOIN links l ON n.relative_path = l.source_path
                   WHERE l.target_path = ?1 ORDER BY n.updated_at DESC";
        let mut stmt = conn.prepare(sql)?;
        let rows = stmt.query_map(params![relative_path], |row| {
            Ok(NoteMeta {
                id: row.get(0)?, title: row.get(1)?, relative_path: row.get(2)?,
                tags: serde_json::from_str(&row.get::<_, String>(3)?).unwrap_or_default(),
                created_at: row.get(4)?, updated_at: row.get(5)?,
            })
        })?;
        Ok(rows.filter_map(|r| r.ok()).collect())
    }

    /// Get backlinks with heading/block info.
    pub fn get_backlinks_with_blocks(&self, relative_path: &str) -> Result<Vec<(NoteMeta, String, String)>, VaultError> {
        let conn = block_lock(&self.conn);
        let sql = "SELECT n.id, n.title, n.relative_path, n.tags, n.created_at, n.updated_at,
                          l.target_heading, l.target_block_id
                   FROM notes n INNER JOIN links l ON n.relative_path = l.source_path
                   WHERE l.target_path = ?1 ORDER BY n.updated_at DESC";
        let mut stmt = conn.prepare(sql)?;
        let rows = stmt.query_map(params![relative_path], |row| {
            Ok((
                NoteMeta {
                    id: row.get(0)?, title: row.get(1)?, relative_path: row.get(2)?,
                    tags: serde_json::from_str(&row.get::<_, String>(3)?).unwrap_or_default(),
                    created_at: row.get(4)?, updated_at: row.get(5)?,
                },
                row.get::<_, String>(6)?,
                row.get::<_, String>(7)?,
            ))
        })?;
        Ok(rows.filter_map(|r| r.ok()).collect())
    }

    /// Build graph data from notes + links.
    pub fn get_graph_data(&self, notes: &[NoteMeta]) -> Result<GraphData, VaultError> {
        let links = self.get_all_links()?;
        let nodes: Vec<GraphNode> = notes.iter().map(|n| GraphNode {
            id: n.id.clone(),
            title: n.title.clone(),
            path: n.relative_path.clone(),
        }).collect();
        let edges: Vec<GraphEdge> = links.into_iter().map(|(source, target)| GraphEdge {
            source,
            target,
        }).collect();
        Ok(GraphData { nodes, edges })
    }

    // ── Embeddings ─────────────────────────────────────────────────────

    pub fn store_embedding(&self, relative_path: &str, embedding_blob: &[u8], model: &str) -> Result<(), VaultError> {
        let conn = block_lock(&self.conn);
        let now = chrono::Utc::now().to_rfc3339();
        conn.execute(
            "INSERT INTO embeddings (relative_path, embedding, generated_at, model)
             VALUES (?1, ?2, ?3, ?4)
             ON CONFLICT(relative_path) DO UPDATE SET
                embedding = excluded.embedding, generated_at = excluded.generated_at, model = excluded.model",
            rusqlite::params![relative_path, embedding_blob, now, model],
        )?;
        Ok(())
    }

    pub fn has_embeddings(&self) -> Result<bool, VaultError> {
        let conn = block_lock(&self.conn);
        let count: i64 = conn.query_row("SELECT COUNT(*) FROM embeddings", [], |row| row.get(0))?;
        Ok(count > 0)
    }

    pub fn embedding_count(&self) -> Result<i64, VaultError> {
        let conn = block_lock(&self.conn);
        conn.query_row("SELECT COUNT(*) FROM embeddings", [], |row| row.get(0))
            .map_err(VaultError::Sqlite)
    }

    // ── SQL Query (read-only) ──────────────────────────────────────────

    /// Execute a read-only SQL query, returning JSON rows.
    pub fn query_sql(&self, sql: &str) -> Result<Vec<serde_json::Value>, VaultError> {
        // Safety check: only allow SELECT
        let trimmed = sql.trim().to_uppercase();
        if !trimmed.starts_with("SELECT") {
            return Err(VaultError::Other("Only SELECT queries are allowed".to_string()));
        }
        let dangerous = ["DROP", "DELETE", "INSERT", "UPDATE", "ALTER", "CREATE", "ATTACH", "PRAGMA"];
        for keyword in &dangerous {
            if trimmed.contains(keyword) {
                return Err(VaultError::Other(format!("Keyword '{}' is not allowed in queries", keyword)));
            }
        }

        let conn = block_lock(&self.conn);
        let mut stmt = conn.prepare(sql)?;

        let column_count = stmt.column_count();
        let column_names: Vec<String> = (0..column_count)
            .map(|i| stmt.column_name(i).map(|s| s.to_string()).map_err(VaultError::Sqlite))
            .collect::<Result<Vec<String>, VaultError>>()?;

        let rows = stmt.query_map([], |row| {
            let mut map: serde_json::Map<String, serde_json::Value> = serde_json::Map::with_capacity(column_count);
            for (i, name) in column_names.iter().enumerate() {
                let value: serde_json::Value = match row.get_ref(i) {
                    Ok(rusqlite::types::ValueRef::Null) => serde_json::Value::Null,
                    Ok(rusqlite::types::ValueRef::Integer(n)) => serde_json::json!(n),
                    Ok(rusqlite::types::ValueRef::Real(f)) => serde_json::json!(f),
                    Ok(rusqlite::types::ValueRef::Text(s)) => {
                        serde_json::json!(String::from_utf8_lossy(s).to_string())
                    }
                    Ok(rusqlite::types::ValueRef::Blob(_)) => serde_json::json!("[blob]"),
                    Err(_) => serde_json::Value::Null,
                };
                map.insert(name.clone(), value);
            }
            Ok(serde_json::Value::Object(map))
        })?;

        Ok(rows.filter_map(|r| r.ok()).collect())
    }

    // ── FTS5 basic search ──────────────────────────────────────────────

    /// FTS5 full-text search.
    pub fn search_fts(&self, query: &str) -> Result<Vec<NoteMeta>, VaultError> {
        let conn = block_lock(&self.conn);
        let sanitized = query.replace('"', "\"\"");
        let fts_query = format!("\"{}\"", sanitized);
        let sql = "SELECT n.id, n.title, n.relative_path, n.tags, n.created_at, n.updated_at
                   FROM notes n INNER JOIN notes_fts fts ON n.rowid = fts.rowid
                   WHERE notes_fts MATCH ?1 ORDER BY rank LIMIT 50";
        let mut stmt = conn.prepare(sql)?;
        let rows = stmt.query_map(params![fts_query], |row| {
            Ok(NoteMeta {
                id: row.get(0)?, title: row.get(1)?, relative_path: row.get(2)?,
                tags: serde_json::from_str(&row.get::<_, String>(3)?).unwrap_or_default(),
                created_at: row.get(4)?, updated_at: row.get(5)?,
            })
        })?;
        Ok(rows.filter_map(|r| r.ok()).collect())
    }

    /// Regex search: load all notes with content in one query, filter in Rust.
    pub fn search_regex(&self, pattern: &str) -> Result<Vec<NoteMeta>, VaultError> {
        let re = regex::Regex::new(pattern)
            .map_err(|e| VaultError::Other(format!("Invalid regex: {}", e)))?;
        let conn = block_lock(&self.conn);
        // Load title AND content in a single query to avoid N+1 per-row queries
        let sql = "SELECT id, title, relative_path, tags, content, created_at, updated_at FROM notes";
        let mut stmt = conn.prepare(sql).map_err(VaultError::Sqlite)?;
        let mut results = Vec::new();
        let rows = stmt.query_map([], |row| {
            Ok((
                NoteMeta {
                    id: row.get(0)?, title: row.get(1)?, relative_path: row.get(2)?,
                    tags: serde_json::from_str(&row.get::<_, String>(3)?).unwrap_or_default(),
                    created_at: row.get(5)?, updated_at: row.get(6)?,
                },
                row.get::<_, String>(4)?, // content
            ))
        }).map_err(VaultError::Sqlite)?;
        for row in rows {
            let (note, content) = row.map_err(VaultError::Sqlite)?;
            if re.is_match(&note.title) || re.is_match(&content) {
                results.push(note);
            }
        }
        Ok(results)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn temp_db() -> (VaultDb, PathBuf) {
        let dir = std::env::temp_dir().join(format!("novanote_vault_db_test_{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let db_path = dir.join("index.db");
        let db = VaultDb::open(&db_path).unwrap();
        (db, dir)
    }

    #[test]
    fn test_crud_cycle() {
        let (db, _dir) = temp_db();
        db.upsert_note("id1", "Test Note", "test.md", "[]", "hello world", "2024-01-01", "2024-01-02").unwrap();
        let notes = db.list_notes().unwrap();
        assert_eq!(notes.len(), 1);
        assert_eq!(notes[0].title, "Test Note");

        db.delete_note("test.md").unwrap();
        assert!(db.list_notes().unwrap().is_empty());
    }

    #[test]
    fn test_tag_operations() {
        let (db, _dir) = temp_db();
        db.upsert_note("id1", "Note A", "a.md", "[]", "content", "2024-01-01", "2024-01-01").unwrap();
        db.update_tags("id1", &["rust".to_string(), "dev".to_string()]).unwrap();

        let tags = db.list_tags().unwrap();
        assert_eq!(tags.len(), 2);

        let notes = db.get_notes_by_tag("rust").unwrap();
        assert_eq!(notes.len(), 1);
    }

    #[test]
    fn test_search_regex() {
        let (db, _dir) = temp_db();
        db.upsert_note("id1", "Rust Guide", "rust.md", "[]", "Learning Rust programming", "2024-01-01", "2024-01-01").unwrap();
        db.upsert_note("id2", "Python Notes", "python.md", "[]", "Python for data science", "2024-01-02", "2024-01-02").unwrap();

        let results = db.search_regex("rust").unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].title, "Rust Guide");
    }
}