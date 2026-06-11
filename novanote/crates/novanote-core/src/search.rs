use std::sync::{Mutex, Arc};
use rusqlite::{params, Connection};
use crate::{VaultError, SearchHit, NoteMeta, GraphData, GraphNode, GraphEdge};
use crate::tantivy_search::TantivyIndex;

/// Extracted search functionality from the Vault god object.
/// Encapsulates full-text search (FTS5), regex search, SQL queries,
/// vector search, graph building, and RAG.
pub struct VaultSearch {
    conn: Arc<Mutex<Connection>>,
    tantivy_index: Arc<Mutex<Option<TantivyIndex>>>,
}

impl VaultSearch {
    pub fn new(conn: Arc<Mutex<Connection>>, tantivy_index: Arc<Mutex<Option<TantivyIndex>>>) -> Self {
        Self { conn, tantivy_index }
    }

    /// Index a single document in Tantivy (best-effort, errors are silently ignored).
    pub fn index_document(&self, path: &str, title: &str, content: &str, tags: &[String]) {
        if let Ok(mut guard) = self.tantivy_index.lock() {
            if let Some(ref mut tantivy) = *guard {
                let _ = tantivy.add_document(path, title, content, tags);
                let _ = tantivy.commit();
            }
        }
    }

    /// Remove a document from Tantivy (best-effort, errors are silently ignored).
    pub fn remove_document(&self, path: &str) {
        if let Ok(mut guard) = self.tantivy_index.lock() {
            if let Some(ref mut tantivy) = *guard {
                let _ = tantivy.delete_document(path);
                let _ = tantivy.commit();
            }
        }
    }

    /// Sync all notes from SQLite to Tantivy index.
    pub fn sync_index_to_tantivy(&self) -> Result<(), VaultError> {
        let conn = self.conn.lock().map_err(|e| VaultError::Other(e.to_string()))?;
        let mut stmt = conn.prepare(
            "SELECT relative_path, title, content, tags FROM notes"
        ).map_err(|e| VaultError::Other(e.to_string()))?;

        let notes: Vec<(String, String, String, String)> = stmt.query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
            ))
        }).map_err(|e| VaultError::Other(e.to_string()))?
        .filter_map(|r| r.ok())
        .collect();

        if let Ok(mut guard) = self.tantivy_index.lock() {
            if let Some(ref mut tantivy) = *guard {
                if let Ok(writer) = tantivy.create_writer() {
                    let mut idx_writer = writer;
                    for (path, title, content, tags_str) in &notes {
                        let tags: Vec<String> = serde_json::from_str(tags_str).unwrap_or_default();
                        let _ = tantivy.add_document(path, title, content, &tags);
                    }
                    let _ = idx_writer.commit();
                }
            }
        }
        Ok(())
    }

    /// Full-text search with ranking (FTS5).
    pub fn search(&self, query: &str) -> Result<Vec<SearchHit>, VaultError> {
        let conn = self.conn.lock().map_err(|e| VaultError::Other(e.to_string()))?;
        let mut stmt = conn.prepare(
            "SELECT relative_path, title, snippet(notes_fts, 2, '<mark>', '</mark>', '...', 32)
             FROM notes_fts WHERE notes_fts MATCH ?1 ORDER BY rank
             LIMIT 100"
        ).map_err(|e| VaultError::Other(e.to_string()))?;

        let hits = stmt.query_map(params![query], |row| {
            Ok(SearchHit {
                relative_path: row.get(0)?,
                title: row.get::<_, String>(1).unwrap_or_default(),
                snippet: row.get::<_, String>(2).unwrap_or_default(),
                score: 0.0,
            })
        }).map_err(|e| VaultError::Other(e.to_string()))?
        .filter_map(|r| r.ok())
        .collect();

        Ok(hits)
    }

    /// Full-text search with Tantivy.
    pub fn tantivy_search(&self, query: &str) -> Result<Vec<SearchHit>, String> {
        let guard = self.tantivy_index.lock().map_err(|e| e.to_string())?;
        match guard.as_ref() {
            Some(index) => index.search(query),
            None => Err("Tantivy index not available".to_string()),
        }
    }

    /// Regex search over all notes.
    pub fn search_regex(&self, pattern: &str) -> Result<Vec<SearchHit>, VaultError> {
        let re = regex::Regex::new(pattern)
            .map_err(|e| VaultError::Other(format!("Invalid regex: {e}")))?;

        let conn = self.conn.lock().map_err(|e| VaultError::Other(e.to_string()))?;
        let mut stmt = conn.prepare(
            "SELECT id, title, relative_path FROM notes ORDER BY title"
        ).map_err(|e| VaultError::Other(e.to_string()))?;

        let notes: Vec<(String, String, String)> = stmt.query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
            ))
        }).map_err(|e| VaultError::Other(e.to_string()))?
        .filter_map(|r| r.ok())
        .collect();

        let mut hits = Vec::new();
        for (id, title, relative_path) in &notes {
            if re.is_match(title) {
                hits.push(SearchHit {
                    relative_path: relative_path.clone(),
                    title: title.clone(),
                    snippet: title.clone(),
                    score: 1.0,
                });
            } else {
                let content_matches = conn.query_row(
                    "SELECT content FROM notes WHERE id = ?1",
                    [id],
                    |row| {
                        let c: String = row.get(0)?;
                        Ok(re.is_match(&c))
                    }
                ).unwrap_or(false);
                if content_matches {
                    hits.push(SearchHit {
                        relative_path: relative_path.clone(),
                        title: title.clone(),
                        snippet: "Content match".to_string(),
                        score: 0.8,
                    });
                }
            }
        }

        // Batch content queries instead of N+1
        Ok(hits)
    }

    /// Batch-reactive regex search - uses single query to avoid N+1.
    pub fn search_regex_batch(&self, pattern: &str) -> Result<Vec<SearchHit>, VaultError> {
        let re = regex::Regex::new(pattern)
            .map_err(|e| VaultError::Other(format!("Invalid regex: {e}")))?;

        let conn = self.conn.lock().map_err(|e| VaultError::Other(e.to_string()))?;

        // Fetch title + content in a single query to avoid N+1
        let mut stmt = conn.prepare(
            "SELECT relative_path, title, content FROM notes"
        ).map_err(|e| VaultError::Other(e.to_string()))?;

        let hits: Vec<SearchHit> = stmt.query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
            ))
        }).map_err(|e| VaultError::Other(e.to_string()))?
        .filter_map(|r| r.ok())
        .filter_map(|(path, title, content)| {
            if re.is_match(&title) {
                Some(SearchHit {
                    relative_path: path,
                    title: title.clone(),
                    snippet: title,
                    score: 1.0,
                })
            } else if re.is_match(&content) {
                Some(SearchHit {
                    relative_path: path,
                    title,
                    snippet: "Content match".to_string(),
                    score: 0.8,
                })
            } else {
                None
            }
        })
        .collect();

        Ok(hits)
    }

    /// Execute a SQL query against the vault database.
    pub fn search_sql(&self, sql: &str) -> Result<Vec<serde_json::Value>, VaultError> {
        let trimmed = sql.trim().to_uppercase();
        if !trimmed.starts_with("SELECT") && !trimmed.starts_with("PRAGMA") {
            return Err(VaultError::Other(
                "Only SELECT and PRAGMA queries are allowed".to_string()
            ));
        }

        let conn = self.conn.lock().map_err(|e| VaultError::Other(e.to_string()))?;
        let mut stmt = conn.prepare(sql)
            .map_err(|e| VaultError::Other(e.to_string()))?;

        let columns: Vec<String> = stmt.column_names().iter()
            .map(|c| c.to_string())
            .collect();

        let rows: Vec<Vec<rusqlite::types::Value>> = stmt.query_map([], |row| {
            let mut values = Vec::new();
            for i in 0..columns.len() {
                let val: rusqlite::types::Value = row.get_unwrap(i);
                values.push(val);
            }
            Ok(values)
        }).map_err(|e| VaultError::Other(e.to_string()))?
        .filter_map(|r| r.ok())
        .collect();

        let results: Vec<serde_json::Value> = rows.iter().map(|row| {
            let mut obj = serde_json::Map::new();
            for (i, col) in columns.iter().enumerate() {
                let val: serde_json::Value = match &row[i] {
                    rusqlite::types::Value::Null => serde_json::Value::Null,
                    rusqlite::types::Value::Integer(n) => serde_json::Value::Number((*n).into()),
                    rusqlite::types::Value::Real(f) => {
                        serde_json::json!(f)
                    }
                    rusqlite::types::Value::Text(s) => serde_json::Value::String(s.clone()),
                    rusqlite::types::Value::Blob(b) => {
                        serde_json::Value::String(format!("<blob: {} bytes>", b.len()))
                    }
                };
                obj.insert(col.clone(), val);
            }
            serde_json::Value::Object(obj)
        }).collect();

        Ok(results)
    }

    /// Build the knowledge graph from note backlinks and tags.
    pub fn build_graph(&self) -> Result<GraphData, VaultError> {
        let conn = self.conn.lock().map_err(|e| VaultError::Other(e.to_string()))?;

        let mut nodes = Vec::new();
        let mut edges = Vec::new();
        let mut node_ids = std::collections::HashSet::new();

        // Get all notes
        let mut stmt = conn.prepare(
            "SELECT relative_path, title, tags FROM notes"
        ).map_err(|e| VaultError::Other(e.to_string()))?;

        let notes: Vec<(String, String, String)> = stmt.query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
            ))
        }).map_err(|e| VaultError::Other(e.to_string()))?
        .filter_map(|r| r.ok())
        .collect();

        for (path, title, tags_str) in &notes {
            if node_ids.insert(path.clone()) {
                nodes.push(GraphNode {
                    id: path.clone(),
                    label: title.clone(),
                    group: "note".to_string(),
                    weight: 1,
                });
            }
            // Parse tags and add tag nodes
            if let Ok(tags) = serde_json::from_str::<Vec<String>>(tags_str) {
                for tag in &tags {
                    let tag_id = format!("tag:{}", tag);
                    if node_ids.insert(tag_id.clone()) {
                        nodes.push(GraphNode {
                            id: tag_id.clone(),
                            label: tag.clone(),
                            group: "tag".to_string(),
                            weight: 1,
                        });
                    }
                    edges.push(GraphEdge {
                        source: path.clone(),
                        target: tag_id,
                        label: "tagged".to_string(),
                    });
                }
            }
        }

        // Get backlinks
        let mut link_stmt = conn.prepare(
            "SELECT source_path, target_path FROM backlinks"
        ).map_err(|e| VaultError::Other(e.to_string()))?;

        let links: Vec<(String, String)> = link_stmt.query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        }).map_err(|e| VaultError::Other(e.to_string()))?
        .filter_map(|r| r.ok())
        .collect();

        for (source, target) in &links {
            edges.push(GraphEdge {
                source: source.clone(),
                target: target.clone(),
                label: "links".to_string(),
            });
        }

        Ok(GraphData { nodes, edges })
    }

    /// List all notes metadata from the index.
    pub fn list_notes(&self) -> Result<Vec<NoteMeta>, VaultError> {
        let conn = self.conn.lock().map_err(|e| VaultError::Other(e.to_string()))?;
        let mut stmt = conn.prepare(
            "SELECT id, relative_path, title, tags, created_at, updated_at FROM notes ORDER BY relative_path"
        ).map_err(|e| VaultError::Other(e.to_string()))?;

        let notes = stmt.query_map([], |row| {
            Ok(NoteMeta {
                id: row.get(0)?,
                relative_path: row.get(1)?,
                title: row.get::<_, String>(2).unwrap_or_default(),
                tags: row.get::<_, String>(3).unwrap_or_else(|_| "[]".into()),
                created_at: row.get::<_, String>(4).unwrap_or_default(),
                updated_at: row.get::<_, String>(5).unwrap_or_default(),
            })
        }).map_err(|e| VaultError::Other(e.to_string()))?
        .filter_map(|r| r.ok())
        .collect();

        Ok(notes)
    }
}