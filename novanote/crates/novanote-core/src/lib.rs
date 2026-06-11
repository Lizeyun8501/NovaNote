// Always available (WASM-Compatible)
pub mod crypto;
pub use crypto::*;

pub mod meta_crypto;
pub use meta_crypto::MetaCrypto;

pub mod crdt;
pub use crdt::YDocHolder;

#[cfg(feature = "native")]
pub mod crdt_store;
#[cfg(feature = "native")]
pub use crdt_store::CrdtStore;

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
    #[error("Tantivy error: {0}")]
    Tantivy(#[from] tantivy::TantivyError),
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
    #[serde(default)]
    pub encryption_key_encrypted: Option<String>,  // Encrypted master key (base64), stored encrypted with user password
    #[serde(default)]
    pub sync_salt: Option<String>,  // Base64-encoded Argon2id salt for sync key derivation
    #[serde(default)]
    pub settings: VaultSettings,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VaultSettings {
    #[serde(default = "default_true")]
    pub auto_save: bool,
    #[serde(default = "default_auto_save_interval")]
    pub auto_save_interval_ms: u64,
    #[serde(default)]
    pub sync_enabled: bool,
    #[serde(default)]
    pub e2ee_enabled: bool,
    #[serde(default = "default_true")]
    pub file_watcher_enabled: bool,
    #[serde(default)]
    pub default_note_folder: String,
    #[serde(default)]
    pub daily_note_folder: String,
    #[serde(default)]
    pub attachment_folder: String,
}

fn default_true() -> bool { true }
fn default_auto_save_interval() -> u64 { 500 }

impl Default for VaultSettings {
    fn default() -> Self {
        Self {
            auto_save: true,
            auto_save_interval_ms: 500,
            sync_enabled: false,
            e2ee_enabled: false,
            file_watcher_enabled: true,
            default_note_folder: String::new(),
            daily_note_folder: "daily".to_string(),
            attachment_folder: "attachments".to_string(),
        }
    }
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

// === Core Trait Abstractions ===
// These traits define the interfaces for swappable backends.

/// Trait for note storage operations. Implementations can use SQLite, RocksDB, etc.
pub trait NoteStore: Send + Sync {
    /// Get a note's content by its relative path
    fn get_note_content(&self, path: &str) -> Result<String, VaultError>;
    /// Save note content, creating or updating as needed
    fn save_note(&self, path: &str, content: &str) -> Result<(), VaultError>;
    /// Delete a note
    fn delete_note(&self, path: &str) -> Result<(), VaultError>;
    /// Rename/move a note
    fn rename_note(&self, old_path: &str, new_path: &str) -> Result<(), VaultError>;
    /// List all notes with metadata
    fn list_notes(&self) -> Result<Vec<NoteMeta>, VaultError>;
    /// Search notes by query string
    fn search(&self, query: &str) -> Result<Vec<NoteMeta>, VaultError>;
    /// Get backlinks for a note
    fn get_backlinks(&self, path: &str) -> Result<Vec<NoteMeta>, VaultError>;
    /// Get all tags
    fn list_tags(&self) -> Result<Vec<String>, VaultError>;
    /// Get notes by tag
    fn get_notes_by_tag(&self, tag: &str) -> Result<Vec<NoteMeta>, VaultError>;
    /// Get graph data (nodes and edges)
    fn get_graph_data(&self) -> Result<GraphData, VaultError>;
}

/// Trait for sync backend operations. Implementations can use WebSocket, WebDAV, S3, etc.
pub trait SyncBackend: Send + Sync {
    /// Push an encrypted update to the server
    fn push_update(&self, doc_id: &str, encrypted_blob: &[u8], nonce: &[u8]) -> Result<(), VaultError>;
    /// Pull missing updates from the server
    fn pull_updates(&self, doc_id: &str, since_version: u64) -> Result<Vec<EncryptedUpdate>, VaultError>;
    /// Get the current sync status
    fn get_status(&self) -> Result<SyncStatusInfo, VaultError>;
    /// Test connection to the backend
    fn test_connection(&self) -> Result<bool, VaultError>;
}

/// Trait for file storage operations. Implementations can use local FS, S3, etc.
pub trait StorageBackend: Send + Sync {
    /// Read file content
    fn read_file(&self, path: &str) -> Result<Vec<u8>, VaultError>;
    /// Write file content
    fn write_file(&self, path: &str, content: &[u8]) -> Result<(), VaultError>;
    /// Delete a file
    fn delete_file(&self, path: &str) -> Result<(), VaultError>;
    /// Check if file exists
    fn exists(&self, path: &str) -> Result<bool, VaultError>;
    /// List files in a directory
    fn list_dir(&self, path: &str) -> Result<Vec<String>, VaultError>;
}

/// Graph data for knowledge graph visualization
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GraphData {
    pub nodes: Vec<GraphNode>,
    pub edges: Vec<GraphEdge>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GraphNode {
    pub id: String,
    pub title: String,
    pub path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GraphEdge {
    pub source: String,
    pub target: String,
}

/// Encrypted update from sync server
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EncryptedUpdate {
    pub doc_id: String,
    pub encrypted_blob: String,  // base64
    pub nonce: String,           // base64
    pub version: u64,
    pub timestamp: i64,
}

/// Sync status information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncStatusInfo {
    pub connected: bool,
    pub last_sync: i64,
    pub pending_count: usize,
    pub backend_type: String,
}

// === Block Model ===
// Block-based document model inspired by Notion/Notion-style editors.
// TipTap (ProseMirror) already uses a block model on the frontend;
// these types align the Rust backend with the editor's document structure.

/// Block types matching ProseMirror/TipTap node types
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum BlockType {
    Paragraph,
    Heading,
    BulletList,
    OrderedList,
    ListItem,
    CodeBlock,
    Blockquote,
    HorizontalRule,
    Image,
    Table,
    TableRow,
    TableCell,
    TaskList,
    TaskItem,
    MathBlock,
    Callout,
    Embed,
    Custom(String),
}

/// A block in the document tree
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Block {
    pub id: String,
    pub block_type: BlockType,
    pub content: String,
    pub props: serde_json::Value,
    pub children: Vec<Block>,
    pub refs: Vec<BlockRef>,
}

/// A reference from one block to another note/block
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BlockRef {
    pub target_note_path: String,
    pub target_block_id: Option<String>,
    pub display_text: String,
}

/// Full note structure with blocks (extends NoteMeta for richer data)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Note {
    pub meta: NoteMeta,
    pub blocks: Vec<Block>,
    pub links: Vec<LinkIndex>,
    pub attachments: Vec<String>,
}

/// Bidirectional link index entry
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LinkIndex {
    pub source_path: String,
    pub source_block_id: Option<String>,
    pub target_path: String,
    pub target_block_id: Option<String>,
    pub link_text: String,
}

/// Sync log entry for audit trail
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncLog {
    pub operation_id: String,
    pub note_id: String,
    pub operation: String,  // "create" | "update" | "delete"
    pub version: u64,
    pub timestamp: i64,
}

// AI integration (native - uses reqwest for HTTP)
#[cfg(feature = "native")]
pub mod ai;
#[cfg(feature = "native")]
pub use ai::{OllamaConfig, AITagResult, AISummaryResult, WritingAssistMode, WritingAssistResult, generate_tags, generate_summary, writing_assist, check_ollama, call_ollama};

// OCR text recognition (native - uses reqwest for HTTP)
#[cfg(feature = "native")]
pub mod ocr;
#[cfg(feature = "native")]
pub use ocr::{OcrConfig, OcrResult, ocr_image, ocr_images};

// Email import (native - uses mailparse)
#[cfg(feature = "native")]
pub mod email_import;
#[cfg(feature = "native")]
pub use email_import::{parse_eml_file, parse_eml_content, email_to_markdown, ParsedEmail};

// Vector search / semantic search (native - uses Ollama embedding API)
#[cfg(feature = "native")]
pub mod vector_search;
#[cfg(feature = "native")]
pub use vector_search::{generate_embedding, cosine_similarity, serialize_embedding, deserialize_embedding, VectorSearchResult, VectorSearchConfig, register_cosine_similarity_fn, create_vector_table, store_embedding_sql, vector_search_sql};

// Tantivy advanced full-text search (native only)
#[cfg(feature = "native")]
pub mod tantivy_search;
#[cfg(feature = "native")]
pub use tantivy_search::{TantivyIndex, SearchHit};

// RAG knowledge base Q&A (native - uses Ollama for embeddings + generation)
#[cfg(feature = "native")]
pub mod rag;
#[cfg(feature = "native")]
pub use rag::{RagConfig, RagAnswer, RagSource, rag_query};

// Native-only modules (not available on WASM)
#[cfg(feature = "native")]
pub mod sync;
#[cfg(feature = "native")]
pub use sync::{SyncEngine, SyncConfig, SyncStatus, PendingUpdate};

#[cfg(feature = "native")]
pub mod sync_webdav;
#[cfg(feature = "native")]
pub use sync_webdav::{WebDAVConfig, WebDAVBackend};

#[cfg(feature = "native")]
pub mod git_integration;
#[cfg(feature = "native")]
pub use git_integration::{GitIntegration, CommitEntry};

#[cfg(feature = "native")]
pub mod webhook;
#[cfg(feature = "native")]
pub use webhook::{WebhookConfig, WebhookPayload, WebhookDelivery, WebhookManager};

#[cfg(feature = "native")]
pub mod sync_s3;
#[cfg(feature = "native")]
pub use sync_s3::{S3Config, S3Backend};

// Native-only vault implementation
#[cfg(feature = "native")]
mod vault_impl;
#[cfg(feature = "native")]
mod vault_db;
mod vault_import;
#[cfg(feature = "native")]
pub use vault_db::VaultDb;
pub use vault_import::{sanitize_filename, clean_notion_markdown};
#[cfg(feature = "native")]
pub use vault_impl::Vault;

#[cfg(feature = "native")]
pub mod audit_log;
#[cfg(feature = "native")]
pub use audit_log::{AuditEntry, AuditLogConfig, AuditLog};

#[cfg(feature = "native")]
pub mod whisper;
#[cfg(feature = "native")]
pub use whisper::{WhisperConfig, TranscriptionResult, transcribe_audio, transcribe_audio_bytes};

#[cfg(feature = "native")]
pub mod ai_graph;
#[cfg(feature = "native")]
pub use ai_graph::{GraphAnalysisConfig, SuggestedConnection, ClusterInfo, GraphAnalysisResult, analyze_graph, summarize_cluster};

#[cfg(feature = "native")]
pub mod integrations;
#[cfg(feature = "native")]
pub use integrations::{
    GitHubConfig, GitHubIssue, github_list_issues, github_issue_to_markdown,
    SlackConfig, SlackMessage, slack_list_messages, slack_messages_to_markdown,
    NotionConfig, NotionPage, notion_list_pages, notion_page_to_markdown,
};

#[cfg(feature = "native")]
pub mod wechat;
#[cfg(feature = "native")]
pub use wechat::{WeChatArticle, parse_wechat_article, wechat_to_markdown};

#[cfg(feature = "native")]
pub mod biometric;
#[cfg(feature = "native")]
pub use biometric::{BiometricConfig, store_in_keychain, retrieve_from_keychain, delete_from_keychain, is_biometric_available};

#[cfg(feature = "native")]
pub mod webauthn;
#[cfg(feature = "native")]
pub use webauthn::{
    WebAuthnConfig, CredentialRegistration, RegistrationChallenge,
    AuthenticationChallenge, AuthVerificationResult,
    generate_registration_challenge, generate_authentication_challenge,
    verify_registration, verify_authentication,
};

#[cfg(feature = "native")]
pub mod multimodal;
#[cfg(feature = "native")]
pub use multimodal::{MultiModalConfig, ImageAnalysisResult, analyze_image, describe_image, tag_image, image_to_note};

#[cfg(feature = "native")]
pub mod file_watcher;
#[cfg(feature = "native")]
pub use file_watcher::{FileWatcher, FileWatcherConfig, FileChangeEvent};

#[cfg(feature = "native")]
pub mod export;
#[cfg(feature = "native")]
pub use export::{ExportFormat, ExportResult, export_to_markdown, export_to_html, export_to_pdf, export_note};

#[cfg(feature = "native")]
pub mod protobuf;
#[cfg(feature = "native")]
pub use protobuf::{
    SyncMessage, AuthRequest, AuthResponse, SyncStep1, SyncStep2,
    AwarenessUpdate, CursorState, DocEvent, DocEventType,
    FrontendCommand, BackendResponse, EncryptedPayload,
    PREFIX_PROTOBUF, PREFIX_JSON,
};