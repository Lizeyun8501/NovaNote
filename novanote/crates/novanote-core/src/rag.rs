//! RAG (Retrieval-Augmented Generation) module
//! Combines semantic search with LLM generation to answer questions based on personal notes

use serde::{Deserialize, Serialize};

use crate::ai::{call_ollama, OllamaConfig};

/// Configuration for RAG queries
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RagConfig {
    pub ollama_config: OllamaConfig,
    pub top_k: usize,
    pub max_context_chars: usize,
}

impl Default for RagConfig {
    fn default() -> Self {
        Self {
            ollama_config: OllamaConfig::default(),
            top_k: 5,
            max_context_chars: 4000,
        }
    }
}

/// A source citation for a RAG answer
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RagSource {
    pub note_path: String,
    pub relevance_score: f32,
    pub snippet: String,
}

/// RAG answer with source citations
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RagAnswer {
    pub answer: String,
    pub sources: Vec<RagSource>,
    pub model: String,
}

/// Perform a RAG query using pre-retrieved note chunks.
///
/// `note_contents` is a list of (path, content, relevance_score) tuples
/// already sorted by relevance (most relevant first).
pub async fn rag_query(
    config: &RagConfig,
    query: &str,
    note_contents: Vec<(String, String, f32)>,
) -> Result<RagAnswer, String> {
    if note_contents.is_empty() {
        return Ok(RagAnswer {
            answer: "I couldn't find any relevant notes to answer your question. Please make sure your notes are indexed for semantic search.".to_string(),
            sources: Vec::new(),
            model: config.ollama_config.model.clone(),
        });
    }

    // Take top-K results and build context within char budget
    let top_notes: Vec<&(String, String, f32)> = note_contents
        .iter()
        .take(config.top_k)
        .collect();

    let mut context_parts: Vec<String> = Vec::new();
    let mut total_chars = 0usize;
    let mut sources: Vec<RagSource> = Vec::new();

    for (path, content, score) in top_notes {
        // Truncate individual note content if needed
        let remaining = config.max_context_chars.saturating_sub(total_chars);
        if remaining == 0 {
            break;
        }

        let snippet: String = if content.len() <= remaining {
            content.clone()
        } else {
            let truncated: String = content.chars().take(remaining).collect();
            format!("{}...", truncated)
        };

        let snippet_len = snippet.len();
        context_parts.push(format!("### Note: {}\n{}", path, snippet));
        total_chars += snippet_len;

        // Create a display snippet (first ~200 chars) for the source citation
        let display_snippet: String = if content.len() <= 200 {
            content.clone()
        } else {
            let s: String = content.chars().take(200).collect();
            format!("{}...", s)
        };

        sources.push(RagSource {
            note_path: path.clone(),
            relevance_score: *score,
            snippet: display_snippet,
        });
    }

    let context = context_parts.join("\n\n---\n\n");

    let prompt = format!(
        "You are a knowledgeable assistant with access to the user's personal notes.\n\
         Answer the question based on the provided context. If the context doesn't contain\n\
         enough information, say so honestly.\n\n\
         Context:\n\
         ---\n\
         {}\n\
         ---\n\n\
         Question: {}\n\n\
         Answer:",
        context, query
    );

    let answer = call_ollama(&config.ollama_config, &prompt, 512).await?;
    let answer = answer.trim().to_string();

    Ok(RagAnswer {
        answer,
        sources,
        model: config.ollama_config.model.clone(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_rag_config_default() {
        let config = RagConfig::default();
        assert_eq!(config.top_k, 5);
        assert_eq!(config.max_context_chars, 4000);
        assert_eq!(config.ollama_config.base_url, "http://localhost:11434");
    }

    #[test]
    fn test_rag_source_serialization() {
        let source = RagSource {
            note_path: "notes/test.md".to_string(),
            relevance_score: 0.85,
            snippet: "This is a test snippet...".to_string(),
        };
        let json = serde_json::to_string(&source).unwrap();
        let parsed: RagSource = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.note_path, "notes/test.md");
        assert!((parsed.relevance_score - 0.85).abs() < 0.001);
    }

    #[test]
    fn test_rag_answer_serialization() {
        let answer = RagAnswer {
            answer: "Test answer".to_string(),
            sources: vec![RagSource {
                note_path: "a.md".to_string(),
                relevance_score: 0.9,
                snippet: "snippet".to_string(),
            }],
            model: "llama3.2".to_string(),
        };
        let json = serde_json::to_string(&answer).unwrap();
        let parsed: RagAnswer = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.answer, "Test answer");
        assert_eq!(parsed.sources.len(), 1);
    }
}
