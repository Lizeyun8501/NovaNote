use rusqlite::{params, Connection};
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::{LazyLock, Mutex};
use regex::Regex;

use crate::{VaultError, VaultConfig, NoteMeta, YDocHolder, SyncEngine, VectorSearchResult, NoteStore, GraphData, GraphNode, GraphEdge, CrdtStore, SearchHit, TantivyIndex};
use crate::file_watcher::{FileWatcher, FileWatcherConfig, FileChangeEvent};

// Static regex patterns — compiled once, no runtime unwrap panics
static RE_INLINE_TAGS: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?m)(?<!^)(?<!\w)#(\w[\w/-]*)").unwrap());
static RE_WIKILINKS: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"\[\[([^\]]+)\]\]").unwrap());
static RE_EMBED_HASH: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^(#{1,6}\s+.+?)\s+[a-f0-9]{32}$").unwrap());

pub struct Vault {
    pub root_path: PathBuf,
    pub config: VaultConfig,
    conn: Mutex<Connection>,
    ydoc_holder: YDocHolder,
    pub sync_engine: SyncEngine,
    crdt_store: CrdtStore,
    file_watcher: Mutex<Option<FileWatcher>>,
    event_rx: Mutex<Option<tokio::sync::mpsc::Receiver<FileChangeEvent>>>,
    tantivy_index: Mutex<Option<TantivyIndex>>,
}

impl Vault {
    /// Create a new vault at the given directory path
    pub fn create(root: &Path) -> Result<Self, VaultError> {
        let vault_dir = root.join(".vault");
        let config_path = vault_dir.join("config.json");

        if config_path.exists() {
            return Err(VaultError::AlreadyVault);
        }

        fs::create_dir_all(root)?;
        fs::create_dir_all(&vault_dir)?;

        let config = VaultConfig {
            id: uuid::Uuid::new_v4().to_string(),
            name: root
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_else(|| "Untitled".to_string()),
            created_at: chrono::Utc::now().to_rfc3339(),
            encryption_key_encrypted: None,
            settings: Default::default(),
        };

        let config_json = serde_json::to_string_pretty(&config)?;
        fs::write(&config_path, config_json)?;

        let db_path = vault_dir.join("index.db");
        let conn = Connection::open(&db_path)?;
        conn.execute_batch("PRAGMA journal_mode=WAL;")?;
        Self::init_db(&conn)?;

        let crdt_path = vault_dir.join("crdt.db");
        let crdt_store = CrdtStore::open(&crdt_path)?;

        let tantivy_path = vault_dir.join("tantivy_idx");
        let tantivy_index = TantivyIndex::open(&tantivy_path).ok();

        Ok(Vault {
            root_path: root.to_path_buf(),
            config,
            conn: Mutex::new(conn),
            ydoc_holder: YDocHolder::new(),
            sync_engine: SyncEngine::default(),
            crdt_store,
            file_watcher: Mutex::new(None),
            event_rx: Mutex::new(None),
            tantivy_index: Mutex::new(tantivy_index),
        })
    }

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

        let crdt_path = root.join(".vault").join("crdt.db");
        let crdt_store = CrdtStore::open(&crdt_path)?;

        let tantivy_path = root.join(".vault").join("tantivy_idx");
        let tantivy_index = TantivyIndex::open(&tantivy_path).ok();

        Ok(Vault {
            root_path: root.to_path_buf(),
            config,
            conn: Mutex::new(conn),
            ydoc_holder: YDocHolder::new(),
            sync_engine: SyncEngine::default(),
            crdt_store,
            file_watcher: Mutex::new(None),
            event_rx: Mutex::new(None),
            tantivy_index: Mutex::new(tantivy_index),
        })
    }

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

    pub fn full_scan(&self) -> Result<Vec<NoteMeta>, VaultError> {
        let mut results = Vec::new();
        for entry in walkdir::WalkDir::new(&self.root_path).into_iter().filter_map(|e| e.ok()) {
            let path = entry.path();
            if path.components().any(|c| c.as_os_str().to_string_lossy().starts_with('.')) {
                continue;
            }
            if path.extension().map(|e| e == "md").unwrap_or(false) {
                match self.index_file(path) {
                    Ok(meta) => results.push(meta),
                    Err(e) => eprintln!("Warning: failed to index {}: {}", path.display(), e),
                }
            }
        }
        {
            let conn = self.conn.lock().map_err(|e| VaultError::Other(e.to_string()))?;
            conn.execute_batch("INSERT INTO notes_fts(notes_fts) VALUES ('rebuild');")?;
        }
        Ok(results)
    }

    pub fn index_file(&self, path: &Path) -> Result<NoteMeta, VaultError> {
        let relative_path = path
            .strip_prefix(&self.root_path)
            .map_err(|e| VaultError::Other(format!("Failed to get relative path: {}", e)))?
            .to_string_lossy()
            .to_string();
        let content = fs::read_to_string(path)?;
        self.ydoc_holder.init_from_markdown(&relative_path, &content);
        let (title, mut tags) = Self::parse_frontmatter(&content);
        let inline_tags = Self::extract_inline_tags(&content);
        for tag in inline_tags {
            if !tags.contains(&tag) { tags.push(tag); }
        }
        let metadata = fs::metadata(path)?;
        let modified = metadata.modified().ok()
            .map(|t| chrono::DateTime::<chrono::Utc>::from(t).to_rfc3339())
            .unwrap_or_else(|| chrono::Utc::now().to_rfc3339());
        let id = uuid::Uuid::new_v4().to_string();
        let created_at = chrono::Utc::now().to_rfc3339();
        let tags_json = serde_json::to_string(&tags)?;
        let conn = self.conn.lock().map_err(|e| VaultError::Other(e.to_string()))?;
        conn.execute(
            "INSERT INTO notes (id, title, relative_path, tags, content, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
             ON CONFLICT(relative_path) DO UPDATE SET
                title = excluded.title, tags = excluded.tags, content = excluded.content, updated_at = excluded.updated_at",
            params![id, title, relative_path, tags_json, content, created_at, modified],
        )?;
        let actual_id: String = conn.query_row(
            "SELECT id FROM notes WHERE relative_path = ?1",
            params![relative_path], |row| row.get(0),
        ).unwrap_or(id.clone());
        conn.execute("DELETE FROM links WHERE source_path = ?1", params![relative_path])?;
        let wikilinks = Self::extract_wikilinks(&content);
        for (target_path, link_text, target_heading, target_block_id) in &wikilinks {
            conn.execute(
                "INSERT INTO links (source_path, target_path, link_text, target_heading, target_block_id) VALUES (?1, ?2, ?3, ?4, ?5)",
                params![relative_path, target_path, link_text, target_heading, target_block_id],
            )?;
        }
        // Update tags: delete old associations, insert new
        conn.execute("DELETE FROM note_tags WHERE note_id = ?1", params![actual_id])?;
        for tag in &tags {
            conn.execute("INSERT OR IGNORE INTO tags (name) VALUES (?1)", params![tag])?;
            conn.execute("INSERT INTO note_tags (note_id, tag_name) VALUES (?1, ?2)", params![actual_id, tag])?;
        }

        // Also index in Tantivy if available
        if let Ok(mut tantivy_guard) = self.tantivy_index.lock() {
            if let Some(ref mut tantivy) = *tantivy_guard {
                let _ = tantivy.add_document(&relative_path, &title, &content, &tags);
                let _ = tantivy.commit();
            }
        }

        Ok(NoteMeta {
            id: actual_id, title, relative_path, tags, created_at, updated_at: modified,
        })
    }

    pub fn remove_file(&self, relative_path: &str) -> Result<(), VaultError> {
        let conn = self.conn.lock().map_err(|e| VaultError::Other(e.to_string()))?;
        conn.execute("DELETE FROM notes WHERE relative_path = ?1", params![relative_path])?;
        self.ydoc_holder.remove(relative_path);

        // Also delete from Tantivy if available
        if let Ok(mut tantivy_guard) = self.tantivy_index.lock() {
            if let Some(ref mut tantivy) = *tantivy_guard {
                let _ = tantivy.delete_document(relative_path);
                let _ = tantivy.commit();
            }
        }

        Ok(())
    }

    pub fn ydoc_holder(&self) -> &YDocHolder { &self.ydoc_holder }

    pub fn ydoc_to_markdown(&self, note_id: &str) -> Option<String> {
        self.ydoc_holder.to_markdown(note_id)
    }

    pub fn watch_start(&self) -> Result<(), VaultError> {
        let mut watcher_guard = self.file_watcher.lock().map_err(|e| VaultError::Other(e.to_string()))?;
        if watcher_guard.is_some() {
            return Ok(()); // Already watching
        }

        let config = FileWatcherConfig::new(self.root_path.clone());
        let mut watcher = FileWatcher::new(config)?;

        let (tx, rx) = tokio::sync::mpsc::channel(256);
        watcher.start(tx)?;

        *watcher_guard = Some(watcher);

        let mut rx_guard = self.event_rx.lock().map_err(|e| VaultError::Other(e.to_string()))?;
        *rx_guard = Some(rx);

        Ok(())
    }

    pub fn watch_stop(&self) -> Result<(), VaultError> {
        let mut watcher_guard = self.file_watcher.lock().map_err(|e| VaultError::Other(e.to_string()))?;
        if let Some(ref mut watcher) = *watcher_guard {
            watcher.stop()?;
        }
        *watcher_guard = None;

        let mut rx_guard = self.event_rx.lock().map_err(|e| VaultError::Other(e.to_string()))?;
        *rx_guard = None;

        Ok(())
    }

    pub fn watch_events(&self) -> Option<tokio::sync::mpsc::Receiver<FileChangeEvent>> {
        let mut rx_guard = self.event_rx.lock().ok()?;
        rx_guard.take()
    }

    pub fn watch_poll_events(&self) -> Result<Vec<FileChangeEvent>, VaultError> {
        let mut rx_guard = self.event_rx.lock().map_err(|e| VaultError::Other(e.to_string()))?;
        let rx = match rx_guard.as_mut() {
            Some(rx) => rx,
            None => return Ok(Vec::new()),
        };

        let mut events = Vec::new();
        while let Ok(event) = rx.try_recv() {
            events.push(event);
        }
        Ok(events)
    }

    pub fn search(&self, query: &str) -> Result<Vec<NoteMeta>, VaultError> {
        let conn = self.conn.lock().map_err(|e| VaultError::Other(e.to_string()))?;
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
        let mut results = Vec::new();
        for row in rows { results.push(row?); }
        Ok(results)
    }

    pub fn search_regex(&self, pattern: &str) -> Result<Vec<NoteMeta>, VaultError> {
        let re = regex::Regex::new(pattern)
            .map_err(|e| VaultError::Other(format!("Invalid regex: {}", e)))?;
        let conn = self.conn.lock().map_err(|e| VaultError::Other(e.to_string()))?;
        let sql = "SELECT id, title, relative_path, tags, created_at, updated_at FROM notes";
        let mut stmt = conn.prepare(sql).map_err(VaultError::Sqlite)?;
        let notes = stmt.query_map([], |row| {
            Ok(NoteMeta {
                id: row.get(0)?, title: row.get(1)?, relative_path: row.get(2)?,
                tags: serde_json::from_str(&row.get::<_, String>(3)?).unwrap_or_default(),
                created_at: row.get(4)?, updated_at: row.get(5)?,
            })
        }).map_err(VaultError::Sqlite)?
        .filter_map(|r| r.ok())
        .filter(|note| re.is_match(&note.title) || {
            conn.query_row("SELECT content FROM notes WHERE id = ?1", [&note.id], |row| row.get::<_, String>(0))
                .map(|c| re.is_match(&c)).unwrap_or(false)
        })
        .collect();
        Ok(notes)
    }

    /// Advanced search using Tantivy query syntax (e.g., `title:foo AND content:bar`).
    /// Falls back to FTS5 if Tantivy is not available.
    pub fn search_advanced(&self, query: &str, limit: usize) -> Result<Vec<SearchHit>, VaultError> {
        // Try Tantivy first
        if let Ok(tantivy_guard) = self.tantivy_index.lock() {
            if let Some(ref tantivy) = *tantivy_guard {
                return tantivy.search(query, limit);
            }
        }

        // Fallback: use FTS5 and convert results to SearchHit
        let conn = self.conn.lock().map_err(|e| VaultError::Other(e.to_string()))?;
        let sanitized = query.replace('"', "\"\"");
        let fts_query = format!("\"{}\"", sanitized);
        let sql = "SELECT n.relative_path, n.title, fts.rank
                   FROM notes n INNER JOIN notes_fts fts ON n.rowid = fts.rowid
                   WHERE notes_fts MATCH ?1 ORDER BY rank LIMIT ?";
        let mut stmt = conn.prepare(sql)?;
        let rows = stmt.query_map(params![fts_query, limit as i64], |row| {
            Ok(SearchHit {
                path: row.get(0)?,
                title: row.get(1)?,
                score: row.get::<_, f32>(2)?,
            })
        })?;
        let mut results = Vec::new();
        for row in rows { results.push(row?); }
        Ok(results)
    }

    /// Store an embedding vector for a note
    pub fn store_embedding(&self, relative_path: &str, embedding: &[f32], model: &str) -> Result<(), VaultError> {
        let conn = self.conn.lock().map_err(|e| VaultError::Other(e.to_string()))?;
        let embedding_blob = crate::vector_search::serialize_embedding(embedding);
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

    /// Perform semantic search using stored embeddings and cosine similarity.
    /// `query_embedding` is the embedding vector of the search query (generated externally).
    /// Uses SQL-based vector search with custom cosine_similarity function (sqlite-vec style).
    pub fn semantic_search_with_embedding(&self, query_embedding: &[f32]) -> Result<Vec<VectorSearchResult>, VaultError> {
        let conn = self.conn.lock().map_err(|e| VaultError::Other(e.to_string()))?;

        // Try SQL-based vector search first (sqlite-vec style with custom function)
        if let Ok(results) = crate::vector_search::vector_search_sql(&conn, "embeddings_vec", query_embedding, 20) {
            if !results.is_empty() {
                return Ok(results);
            }
        }

        // Fallback: use the existing embeddings table with Rust-side cosine similarity
        crate::vector_search::register_cosine_similarity_fn(&conn)?;

        let query_blob = crate::vector_search::serialize_embedding(query_embedding);
        let sql = "SELECT e.relative_path, cosine_similarity(e.embedding, ?1) AS score, n.title
                   FROM embeddings e
                   LEFT JOIN notes n ON e.relative_path = n.relative_path
                   WHERE cosine_similarity(e.embedding, ?1) > 0.3
                   ORDER BY score DESC
                   LIMIT 20";
        let mut stmt = conn.prepare(sql)?;
        let rows = stmt.query_map(params![query_blob], |row| {
            let path: String = row.get(0)?;
            let similarity: f32 = row.get(1)?;
            let title: Option<String> = row.get(2)?;
            Ok(VectorSearchResult {
                relative_path: path,
                title: title.unwrap_or_default(),
                similarity,
            })
        })?;

        let mut results = Vec::new();
        for row in rows {
            results.push(row?);
        }
        Ok(results)
    }

    /// Check if semantic search is available (has indexed embeddings)
    pub fn has_embeddings(&self) -> Result<bool, VaultError> {
        let conn = self.conn.lock().map_err(|e| VaultError::Other(e.to_string()))?;
        let count: i64 = conn.query_row("SELECT COUNT(*) FROM embeddings", [], |row| row.get(0))?;
        Ok(count > 0)
    }

    /// Get count of indexed embeddings
    pub fn embedding_count(&self) -> Result<i64, VaultError> {
        let conn = self.conn.lock().map_err(|e| VaultError::Other(e.to_string()))?;
        let count: i64 = conn.query_row("SELECT COUNT(*) FROM embeddings", [], |row| row.get(0))?;
        Ok(count)
    }

    /// Perform a RAG (Retrieval-Augmented Generation) query against the vault.
    /// Generates an embedding for the query, finds similar notes, then uses
    /// the LLM to generate an answer grounded in the retrieved note content.
    pub async fn rag_search(
        &self,
        query: &str,
        config: &crate::rag::RagConfig,
    ) -> Result<crate::rag::RagAnswer, VaultError> {
        // 1. Generate embedding for the query
        let embedding = crate::vector_search::generate_embedding(
            &config.ollama_config.base_url,
            &config.ollama_config.model,
            query,
        )
        .await
        .map_err(VaultError::Other)?;

        // 2. Search for similar notes using the query embedding
        let search_results = self.semantic_search_with_embedding(&embedding)?;

        // 3. Load content of the top-K matching notes
        let mut note_contents: Vec<(String, String, f32)> = Vec::new();
        for result in search_results.iter().take(config.top_k) {
            match self.read_note(&result.relative_path) {
                Ok(content) => {
                    note_contents.push((result.relative_path.clone(), content, result.similarity));
                }
                Err(_) => continue,
            }
        }

        // 4. Call rag_query with the results
        let answer = crate::rag::rag_query(config, query, note_contents)
            .await
            .map_err(VaultError::Other)?;

        Ok(answer)
    }

    pub fn list_notes(&self) -> Result<Vec<NoteMeta>, VaultError> {
        let conn = self.conn.lock().map_err(|e| VaultError::Other(e.to_string()))?;
        let mut stmt = conn.prepare(
            "SELECT id, title, relative_path, tags, created_at, updated_at FROM notes ORDER BY updated_at DESC")?;
        let rows = stmt.query_map([], |row| {
            Ok(NoteMeta {
                id: row.get(0)?, title: row.get(1)?, relative_path: row.get(2)?,
                tags: serde_json::from_str(&row.get::<_, String>(3)?).unwrap_or_default(),
                created_at: row.get(4)?, updated_at: row.get(5)?,
            })
        })?;
        let mut results = Vec::new();
        for row in rows { results.push(row?); }
        Ok(results)
    }

    pub fn get_backlinks(&self, relative_path: &str) -> Result<Vec<NoteMeta>, VaultError> {
        let conn = self.conn.lock().map_err(|e| VaultError::Other(e.to_string()))?;
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
        let mut results = Vec::new();
        for row in rows { results.push(row?); }
        Ok(results)
    }

    pub fn get_backlinks_with_blocks(&self, relative_path: &str) -> Result<Vec<(NoteMeta, String, String)>, VaultError> {
        let conn = self.conn.lock().map_err(|e| VaultError::Other(e.to_string()))?;
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
        let mut results = Vec::new();
        for row in rows { results.push(row?); }
        Ok(results)
    }

    pub fn list_tags(&self) -> Result<Vec<(String, i32)>, VaultError> {
        let conn = self.conn.lock().map_err(|e| VaultError::Other(e.to_string()))?;
        let sql = "SELECT t.name, COUNT(nt.note_id) as count FROM tags t
                   LEFT JOIN note_tags nt ON t.name = nt.tag_name GROUP BY t.name ORDER BY count DESC, t.name ASC";
        let mut stmt = conn.prepare(sql)?;
        let rows = stmt.query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, i32>(1)?)))?;
        let mut results = Vec::new();
        for row in rows { results.push(row?); }
        Ok(results)
    }

    pub fn get_notes_by_tag(&self, tag: &str) -> Result<Vec<NoteMeta>, VaultError> {
        let conn = self.conn.lock().map_err(|e| VaultError::Other(e.to_string()))?;
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
        let mut results = Vec::new();
        for row in rows { results.push(row?); }
        Ok(results)
    }

    pub fn list_templates(&self) -> Result<Vec<String>, VaultError> {
        let templates_dir = self.root_path.join(".vault").join("templates");
        if !templates_dir.exists() { fs::create_dir_all(&templates_dir)?; return Ok(vec![]); }
        let mut templates = Vec::new();
        for entry in fs::read_dir(&templates_dir)? {
            let entry = entry?;
            if entry.path().extension().map_or(false, |e| e == "md") {
                if let Some(name) = entry.path().file_stem().and_then(|n| n.to_str()) {
                    templates.push(name.to_string());
                }
            }
        }
        Ok(templates)
    }

    pub fn get_template_content(&self, name: &str) -> Result<String, VaultError> {
        let path = self.root_path.join(".vault").join("templates").join(format!("{}.md", name));
        fs::read_to_string(&path).map_err(VaultError::Io)
    }

    pub fn save_as_template(&self, name: &str, content: &str) -> Result<(), VaultError> {
        let templates_dir = self.root_path.join(".vault").join("templates");
        if !templates_dir.exists() { fs::create_dir_all(&templates_dir)?; }
        fs::write(templates_dir.join(format!("{}.md", name)), content).map_err(VaultError::Io)
    }

    pub fn delete_template(&self, name: &str) -> Result<(), VaultError> {
        let path = self.root_path.join(".vault").join("templates").join(format!("{}.md", name));
        if path.exists() {
            fs::remove_file(&path).map_err(VaultError::Io)
        } else {
            Err(VaultError::Other(format!("Template '{}' not found", name)))
        }
    }

    pub fn import_from_obsidian(&self, source_dir: &Path) -> Result<Vec<NoteMeta>, VaultError> {
        for entry in walkdir::WalkDir::new(source_dir) {
            let entry = entry.map_err(|e: walkdir::Error| VaultError::Other(e.to_string()))?;
            if entry.path().extension().map_or(false, |e| e == "md") {
                let relative = entry.path().strip_prefix(source_dir).map_err(|e| VaultError::Other(e.to_string()))?;
                let dest = self.root_path.join(relative);
                if let Some(parent) = dest.parent() { fs::create_dir_all(parent)?; }
                fs::copy(entry.path(), &dest)?;
            }
        }
        self.full_scan()
    }

    pub fn import_from_notion(&self, source_path: &Path) -> Result<Vec<NoteMeta>, VaultError> {
        for entry in walkdir::WalkDir::new(source_path) {
            let entry = entry.map_err(|e: walkdir::Error| VaultError::Other(e.to_string()))?;
            if entry.path().extension().map_or(false, |e| e == "md") {
                let content = fs::read_to_string(entry.path())?;
                let title = content.lines().find(|l| l.starts_with("# "))
                    .map(|l| l.trim_start_matches("# ").trim())
                    .unwrap_or_else(|| entry.path().file_stem().and_then(|s| s.to_str()).unwrap_or("Untitled")).to_string();
                let cleaned = clean_notion_markdown(&content);
                let dest = self.root_path.join(format!("{}.md", sanitize_filename(&title)));
                fs::write(&dest, cleaned)?;
            }
        }
        self.full_scan()
    }

    pub fn import_from_joplin(&self, jex_path: &Path) -> Result<Vec<NoteMeta>, VaultError> {
        let file = fs::File::open(jex_path)?;
        let mut archive = tar::Archive::new(file);
        for entry in archive.entries().map_err(VaultError::Io)? {
            let mut entry = entry.map_err(VaultError::Io)?;
            let mut content = String::new();
            entry.read_to_string(&mut content).map_err(VaultError::Io)?;
            if let Ok(note_data) = serde_json::from_str::<serde_json::Value>(&content) {
                let title = note_data["title"].as_str().unwrap_or("Untitled");
                let body = note_data["body"].as_str().unwrap_or("");
                let dest = self.root_path.join(format!("{}.md", sanitize_filename(title)));
                fs::write(&dest, format!("---\ntitle: {}\n---\n\n{}", title, body))?;
            }
        }
        self.full_scan()
    }

    pub fn export_note_as_html(&self, relative_path: &str, output_path: &str) -> Result<(), VaultError> {
        let content = fs::read_to_string(self.root_path.join(relative_path))?;
        let mut html_output = String::new();
        let parser = pulldown_cmark::Parser::new(&content);
        pulldown_cmark::html::push_html(&mut html_output, parser);
        let full_html = format!(r#"<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>{}</title>
<style>
body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 800px; margin: 0 auto; padding: 2rem; line-height: 1.6; color: #1a1a2e; }}
h1, h2, h3 {{ margin-top: 1.5em; }}
code {{ background: #f4f4f5; padding: 2px 6px; border-radius: 3px; font-size: 0.9em; }}
pre {{ background: #f4f4f5; padding: 1rem; border-radius: 6px; overflow-x: auto; }}
blockquote {{ border-left: 3px solid #6366f1; margin: 1em 0; padding: 0.5em 1em; color: #6b7280; }}
a {{ color: #6366f1; }}
</style></head><body>{}</body></html>"#, relative_path, html_output);
        fs::write(output_path, full_html).map_err(VaultError::Io)
    }

    pub fn get_all_links(&self) -> Result<Vec<(String, String)>, VaultError> {
        let conn = self.conn.lock().map_err(|e| VaultError::Other(e.to_string()))?;
        let sql = "SELECT source_path, target_path FROM links";
        let mut stmt = conn.prepare(sql).map_err(VaultError::Sqlite)?;
        let rows = stmt.query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)))
            .map_err(VaultError::Sqlite)?;
        let result: Vec<(String, String)> = rows.filter_map(|r| r.ok()).collect();
        Ok(result)
    }

    pub fn read_note(&self, path: &str) -> Result<String, VaultError> {
        let full_path = self.root_path.join(path);
        fs::read_to_string(&full_path).map_err(VaultError::Io)
    }

    pub fn write_note(&self, path: &str, content: &str) -> Result<(), VaultError> {
        let full_path = self.root_path.join(path);
        if let Some(parent) = full_path.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::write(&full_path, content)?;
        self.index_file(&full_path)?;
        Ok(())
    }

    pub fn delete_note(&self, path: &str) -> Result<(), VaultError> {
        let full_path = self.root_path.join(path);
        if full_path.exists() {
            fs::remove_file(&full_path)?;
        }
        self.remove_file(path)
    }

    pub fn rename_note(&self, old_path: &str, new_path: &str) -> Result<(), VaultError> {
        let old_full = self.root_path.join(old_path);
        let new_full = self.root_path.join(new_path);
        if !old_full.exists() {
            return Err(VaultError::Other(format!("Note not found: {}", old_path)));
        }
        if let Some(parent) = new_full.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::rename(&old_full, &new_full)?;
        self.remove_file(old_path)?;
        self.index_file(&new_full)?;
        Ok(())
    }

    pub fn get_graph_data(&self) -> Result<GraphData, VaultError> {
        let notes = self.list_notes()?;
        let links = self.get_all_links()?;
        let nodes: Vec<GraphNode> = notes.into_iter().map(|n| GraphNode {
            id: n.id,
            title: n.title,
            path: n.relative_path,
        }).collect();
        let edges: Vec<GraphEdge> = links.into_iter().map(|(source, target)| GraphEdge {
            source,
            target,
        }).collect();
        Ok(GraphData { nodes, edges })
    }

    /// Execute a read-only SQL query against the vault database.
    /// Returns results as JSON arrays for flexibility.
    /// Only SELECT statements are allowed for safety.
    pub fn query_sql(&self, sql: &str) -> Result<Vec<serde_json::Value>, VaultError> {
        // Safety check: only allow SELECT statements
        let trimmed = sql.trim().to_uppercase();
        if !trimmed.starts_with("SELECT") {
            return Err(VaultError::Other("Only SELECT queries are allowed".to_string()));
        }
        // Block dangerous keywords
        let dangerous = ["DROP", "DELETE", "INSERT", "UPDATE", "ALTER", "CREATE", "ATTACH", "PRAGMA"];
        for keyword in &dangerous {
            if trimmed.contains(keyword) {
                return Err(VaultError::Other(format!("Keyword '{}' is not allowed in queries", keyword)));
            }
        }

        let conn = self.conn.lock().map_err(|e| VaultError::Other(e.to_string()))?;
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
                        let text = String::from_utf8_lossy(s).to_string();
                        serde_json::json!(text)
                    }
                    Ok(rusqlite::types::ValueRef::Blob(_)) => serde_json::json!("[blob]"),
                    Err(_) => serde_json::Value::Null,
                };
                map.insert(name.clone(), value);
            }
            Ok(serde_json::Value::Object(map))
        })?;

        let mut results = Vec::new();
        for row in rows {
            results.push(row?);
        }
        Ok(results)
    }

    pub fn is_vault(path: &Path) -> bool {
        path.join(".vault").join("config.json").exists()
    }

    fn parse_frontmatter(content: &str) -> (String, Vec<String>) {
        let mut title = String::new();
        let mut tags = Vec::new();
        let trimmed = content.trim_start();
        if !trimmed.starts_with("---") {
            return (Self::extract_first_heading(content), Vec::new());
        }
        let after_first = &trimmed[3..];
        if let Some(end) = after_first.find("\n---") {
            let frontmatter = &after_first[..end];
            for line in frontmatter.lines() {
                let line = line.trim();
                if line.is_empty() { continue; }
                if let Some(colon_pos) = line.find(':') {
                    let key = line[..colon_pos].trim().to_lowercase();
                    let value = line[colon_pos + 1..].trim();
                    match key.as_str() {
                        "title" => { title = value.to_string(); }
                        "tags" => { tags = parse_tags_value(value); }
                        _ => {}
                    }
                }
            }
        }
        if title.is_empty() { title = Self::extract_first_heading(content); }
        (title, tags)
    }

    fn extract_first_heading(content: &str) -> String {
        for line in content.lines() {
            let trimmed = line.trim();
            if trimmed.starts_with("# ") { return trimmed[2..].trim().to_string(); }
        }
        "Untitled".to_string()
    }

    fn extract_inline_tags(content: &str) -> Vec<String> {
        let mut tags = Vec::new();
        for cap in RE_INLINE_TAGS.captures_iter(content) {
            let tag = cap[1].to_string();
            if !tags.contains(&tag) { tags.push(tag); }
        }
        tags
    }

    fn extract_wikilinks(content: &str) -> Vec<(String, String, String, String)> {
        RE_WIKILINKS.captures_iter(content).filter_map(|cap| {
            let inner = cap.get(1)?.as_str();
            // Check for ^block-id first (can appear directly after note name or after #heading)
            // e.g. [[Note^block-123]] or [[Note#heading^block-123]]
            let (target, heading, block_id) = if let Some(pos) = inner.find('#') {
                let target_part = &inner[..pos];
                let fragment = &inner[pos + 1..];
                // Distinguish block IDs (^id) from headings
                if let Some(caret_pos) = fragment.find('^') {
                    let heading_part = &fragment[..caret_pos];
                    let block = &fragment[caret_pos + 1..];
                    (target_part, heading_part.to_string(), block.to_string())
                } else {
                    (target_part, fragment.to_string(), String::new())
                }
            } else if let Some(pos) = inner.find('^') {
                // ^block-id directly after note name: [[Note^block-123]]
                let target_part = &inner[..pos];
                let block = &inner[pos + 1..];
                (target_part, String::new(), block.to_string())
            } else {
                (inner, String::new(), String::new())
            };
            let target_path = if target.ends_with(".md") { target.to_string() } else { format!("{}.md", target) };
            Some((target_path, target.to_string(), heading, block_id))
        }).collect()
    }
}

fn parse_tags_value(value: &str) -> Vec<String> {
    let value = value.trim();
    if value.starts_with('[') && value.ends_with(']') {
        let inner = &value[1..value.len() - 1];
        return inner.split(',').map(|s| s.trim().trim_matches('"').trim_matches('\'').to_string())
            .filter(|s| !s.is_empty()).collect();
    }
    value.split(',').map(|s| s.trim().to_string()).filter(|s| !s.is_empty()).collect()
}

fn clean_notion_markdown(content: &str) -> String {
    content.lines().map(|line| {
        if let Some(caps) = RE_EMBED_HASH.captures(line) {
            caps.get(1).map(|m| m.as_str()).unwrap_or(line).to_string()
        } else { line.to_string() }
    }).collect::<Vec<_>>().join("\n")
}

fn sanitize_filename(name: &str) -> String {
    name.chars().map(|c| if c.is_alphanumeric() || c == '-' || c == '_' || c == ' ' { c } else { '_' })
        .collect::<String>().trim().to_string()
}

impl NoteStore for Vault {
    fn get_note_content(&self, path: &str) -> Result<String, VaultError> {
        self.read_note(path)
    }

    fn save_note(&self, path: &str, content: &str) -> Result<(), VaultError> {
        self.write_note(path, content)
    }

    fn delete_note(&self, path: &str) -> Result<(), VaultError> {
        self.delete_note(path)
    }

    fn rename_note(&self, old_path: &str, new_path: &str) -> Result<(), VaultError> {
        self.rename_note(old_path, new_path)
    }

    fn list_notes(&self) -> Result<Vec<NoteMeta>, VaultError> {
        self.list_notes()
    }

    fn search(&self, query: &str) -> Result<Vec<NoteMeta>, VaultError> {
        self.search(query)
    }

    fn get_backlinks(&self, path: &str) -> Result<Vec<NoteMeta>, VaultError> {
        self.get_backlinks(path)
    }

    fn list_tags(&self) -> Result<Vec<String>, VaultError> {
        self.list_tags().map(|tags| tags.into_iter().map(|(name, _count)| name).collect())
    }

    fn get_notes_by_tag(&self, tag: &str) -> Result<Vec<NoteMeta>, VaultError> {
        self.get_notes_by_tag(tag)
    }

    fn get_graph_data(&self) -> Result<GraphData, VaultError> {
        self.get_graph_data()
    }
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

    #[test]
    fn test_extract_wikilinks() {
        let content = "This links to [[My Note]] and [[Another Note#Section]].";
        let links = Vault::extract_wikilinks(content);
        assert_eq!(links.len(), 2);
        assert_eq!(links[0], ("My Note.md".to_string(), "My Note".to_string(), String::new(), String::new()));
        assert_eq!(links[1], ("Another Note.md".to_string(), "Another Note".to_string(), "Section".to_string(), String::new()));
    }

    #[test]
    fn test_extract_wikilinks_with_block_id() {
        let content = "Link to [[Note^block-123]] and [[Other#heading]] and [[Third^abc]].";
        let links = Vault::extract_wikilinks(content);
        assert_eq!(links.len(), 3);
        assert_eq!(links[0], ("Note.md".to_string(), "Note".to_string(), String::new(), "block-123".to_string()));
        assert_eq!(links[1], ("Other.md".to_string(), "Other".to_string(), "heading".to_string(), String::new()));
        assert_eq!(links[2], ("Third.md".to_string(), "Third".to_string(), String::new(), "abc".to_string()));
    }

    #[test]
    fn test_extract_wikilinks_with_extension() {
        let content = "Link to [[notes.md]].";
        let links = Vault::extract_wikilinks(content);
        assert_eq!(links.len(), 1);
        assert_eq!(links[0].0, "notes.md");
    }
}