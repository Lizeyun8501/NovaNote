//! Vector search module - Embedding-based semantic search using Ollama
//! Generates embeddings via Ollama API and performs cosine similarity search
//! Also provides SQL-based vector search using custom rusqlite functions
//! (sqlite-vec style approach with brute-force cosine similarity in SQL)

use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};

use crate::VaultError;

/// Configuration for vector search
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VectorSearchConfig {
    pub embedding_model: String,
    pub max_results: usize,
}

impl Default for VectorSearchConfig {
    fn default() -> Self {
        Self {
            embedding_model: "nomic-embed-text".to_string(),
            max_results: 20,
        }
    }
}

/// A vector search result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VectorSearchResult {
    pub relative_path: String,
    pub title: String,
    pub similarity: f32,
}

/// Ollama embedding request
#[derive(Debug, Serialize)]
struct OllamaEmbedRequest {
    model: String,
    prompt: String,
}

/// Ollama embedding response
#[derive(Debug, Deserialize)]
struct OllamaEmbedResponse {
    embedding: Vec<f32>,
}

/// Generate an embedding vector for the given text using Ollama API
pub async fn generate_embedding(
    base_url: &str,
    model: &str,
    text: &str,
) -> Result<Vec<f32>, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(60))
        .build()
        .map_err(|e| e.to_string())?;

    // Truncate text to reasonable length for embedding
    let truncated: String = text.chars().take(3000).collect();

    let request = OllamaEmbedRequest {
        model: model.to_string(),
        prompt: truncated,
    };

    let url = format!("{}/api/embeddings", base_url);
    let resp = client
        .post(&url)
        .json(&request)
        .send()
        .await
        .map_err(|e| format!("Failed to connect to Ollama: {}. Is Ollama running?", e))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("Ollama embedding API error ({}): {}", status, body));
    }

    let result: OllamaEmbedResponse = resp.json().await.map_err(|e| e.to_string())?;
    Ok(result.embedding)
}

/// Serialize a vector of f32 to bytes for storage
pub fn serialize_embedding(embedding: &[f32]) -> Vec<u8> {
    let bytes: Vec<u8> = embedding
        .iter()
        .flat_map(|f| f.to_le_bytes())
        .collect();
    bytes
}

/// Deserialize bytes back to a vector of f32
pub fn deserialize_embedding(bytes: &[u8]) -> Vec<f32> {
    bytes
        .chunks_exact(4)
        .map(|chunk| {
            let arr: [u8; 4] = chunk.try_into().unwrap();
            f32::from_le_bytes(arr)
        })
        .collect()
}

/// Compute cosine similarity between two vectors
pub fn cosine_similarity(a: &[f32], b: &[f32]) -> f32 {
    if a.len() != b.len() || a.is_empty() {
        return 0.0;
    }

    let dot_product: f32 = a.iter().zip(b.iter()).map(|(x, y)| x * y).sum();
    let norm_a: f32 = a.iter().map(|x| x * x).sum::<f32>().sqrt();
    let norm_b: f32 = b.iter().map(|x| x * x).sum::<f32>().sqrt();

    if norm_a == 0.0 || norm_b == 0.0 {
        return 0.0;
    }

    dot_product / (norm_a * norm_b)
}

// ============================================================
// SQL-based vector search (sqlite-vec style)
// Uses custom rusqlite functions for cosine similarity in SQL
// ============================================================

/// Register the `cosine_similarity` custom SQL function on a connection.
/// This allows SQL queries like:
///   SELECT *, cosine_similarity(embedding, ?1) AS score FROM vec_table ORDER BY score DESC
pub fn register_cosine_similarity_fn(conn: &Connection) -> Result<(), VaultError> {
    conn.create_scalar_function(
        "cosine_similarity",
        2,
        rusqlite::functions::FunctionFlags::SQLITE_DETERMINISTIC,
        |ctx: &rusqlite::functions::Context| {
            let blob_a: Vec<u8> = ctx.get(0)?;
            let blob_b: Vec<u8> = ctx.get(1)?;
            let a = deserialize_embedding(&blob_a);
            let b = deserialize_embedding(&blob_b);
            Ok(cosine_similarity(&a, &b))
        },
    )?;
    Ok(())
}

/// Create a vector storage table for embeddings using a flat BLOB column approach.
/// This mimics sqlite-vec's `vec0` virtual table pattern but uses standard SQL tables
/// with a custom cosine_similarity function for brute-force search.
///
/// Table schema:
/// - note_id TEXT PRIMARY KEY
/// - embedding BLOB NOT NULL
pub fn create_vector_table(
    conn: &Connection,
    table_name: &str,
    dim: usize,
) -> Result<(), VaultError> {
    let sql = format!(
        "CREATE TABLE IF NOT EXISTS {table} (
            note_id TEXT PRIMARY KEY,
            embedding BLOB NOT NULL,
            dim INTEGER NOT NULL DEFAULT {dim}
        )",
        table = table_name,
        dim = dim,
    );
    conn.execute_batch(&sql)?;

    // Register the cosine similarity function if not already registered
    register_cosine_similarity_fn(conn)?;

    Ok(())
}

/// Store an embedding vector in a vector table
pub fn store_embedding_sql(
    conn: &Connection,
    table: &str,
    note_id: &str,
    embedding: &[f32],
) -> Result<(), VaultError> {
    let blob = serialize_embedding(embedding);
    let dim = embedding.len() as i64;
    let sql = format!(
        "INSERT INTO {table} (note_id, embedding, dim)
         VALUES (?1, ?2, ?3)
         ON CONFLICT(note_id) DO UPDATE SET
            embedding = excluded.embedding, dim = excluded.dim",
        table = table,
    );
    conn.execute(&sql, params![note_id, blob, dim])?;
    Ok(())
}

/// Perform vector similarity search using SQL with the custom cosine_similarity function.
/// Returns results sorted by similarity descending, limited to `limit` results.
pub fn vector_search_sql(
    conn: &Connection,
    table: &str,
    query_embedding: &[f32],
    limit: usize,
) -> Result<Vec<VectorSearchResult>, VaultError> {
    // Ensure the cosine_similarity function is registered
    register_cosine_similarity_fn(conn)?;

    let query_blob = serialize_embedding(query_embedding);
    let sql = format!(
        "SELECT v.note_id, cosine_similarity(v.embedding, ?1) AS score
         FROM {table} v
         WHERE cosine_similarity(v.embedding, ?1) > 0.3
         ORDER BY score DESC
         LIMIT ?2",
        table = table,
    );
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(params![query_blob, limit as i64], |row| {
        let path: String = row.get(0)?;
        let similarity: f32 = row.get(1)?;
        Ok((path, similarity))
    })?;

    let mut results = Vec::new();
    for row in rows {
        if let Ok((relative_path, similarity)) = row {
            // Try to get the title from the notes table
            let title: String = conn
                .query_row(
                    "SELECT title FROM notes WHERE relative_path = ?1",
                    params![relative_path],
                    |row| row.get(0),
                )
                .unwrap_or_default();
            results.push(VectorSearchResult {
                relative_path,
                title,
                similarity,
            });
        }
    }

    Ok(results)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_embedding_serialization_roundtrip() {
        let original = vec![1.0, 2.0, 3.0, -1.0, 0.5];
        let bytes = serialize_embedding(&original);
        let recovered = deserialize_embedding(&bytes);
        assert_eq!(original, recovered);
    }

    #[test]
    fn test_cosine_similarity_identical() {
        let v = vec![1.0, 2.0, 3.0];
        let sim = cosine_similarity(&v, &v);
        assert!((sim - 1.0).abs() < 0.001);
    }

    #[test]
    fn test_cosine_similarity_orthogonal() {
        let a = vec![1.0, 0.0, 0.0];
        let b = vec![0.0, 1.0, 0.0];
        let sim = cosine_similarity(&a, &b);
        assert!((sim - 0.0).abs() < 0.001);
    }

    #[test]
    fn test_cosine_similarity_opposite() {
        let a = vec![1.0, 1.0];
        let b = vec![-1.0, -1.0];
        let sim = cosine_similarity(&a, &b);
        assert!((sim + 1.0).abs() < 0.001);
    }

    #[test]
    fn test_deserialize_embedding_empty() {
        let recovered = deserialize_embedding(&[]);
        assert!(recovered.is_empty());
    }
}