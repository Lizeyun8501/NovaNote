//! Vector search module - Embedding-based semantic search using Ollama
//! Generates embeddings via Ollama API and performs cosine similarity search

use serde::{Deserialize, Serialize};

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