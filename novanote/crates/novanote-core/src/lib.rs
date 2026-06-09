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