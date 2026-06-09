// Always available (WASM-compatible)
pub mod crypto;
pub use crypto::*;

pub mod crdt;
pub use crdt::YDocHolder;

// Shared types available on all platforms
use serde::{Deserialize, Serialize};
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

// AI integration (native - uses reqwest for HTTP)
#[cfg(feature = "native")]
pub mod ai;
#[cfg(feature = "native")]
pub use ai::{OllamaConfig, AITagResult, AISummaryResult, WritingAssistMode, WritingAssistResult, generate_tags, generate_summary, writing_assist, check_ollama};

// Email import (native - uses mailparse)
#[cfg(feature = "native")]
pub mod email_import;
#[cfg(feature = "native")]
pub use email_import::{parse_eml_file, parse_eml_content, email_to_markdown, ParsedEmail};

// Vector search / semantic search (native - uses Ollama embedding API)
#[cfg(feature = "native")]
pub mod vector_search;
#[cfg(feature = "native")]
pub use vector_search::{generate_embedding, cosine_similarity, serialize_embedding, deserialize_embedding, VectorSearchResult, VectorSearchConfig};

// Native-only modules (not available on WASM)
#[cfg(feature = "native")]
pub mod sync;
#[cfg(feature = "native")]
pub use sync::{SyncEngine, SyncConfig, SyncStatus, PendingUpdate};

// Native-only vault implementation
#[cfg(feature = "native")]
mod vault_impl;
#[cfg(feature = "native")]
pub use vault_impl::Vault;