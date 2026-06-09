//! Protobuf message definitions for Rust↔TypeScript communication contract.
//! These types define the wire format between the Tauri backend and frontend,
//! ensuring type-safe communication across the FFI boundary.

use serde::{Deserialize, Serialize};

/// Sync protocol message (mirrors the protobuf definition in the design doc)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncMessage {
    #[serde(rename = "type")]
    pub msg_type: String,
    pub auth: Option<AuthRequest>,
    pub auth_ok: Option<AuthResponse>,
    pub step1: Option<SyncStep1>,
    pub step2: Option<SyncStep2>,
    pub awareness: Option<AwarenessUpdate>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthRequest {
    pub jwt: String,
    pub device_id: String,
    pub vault_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthResponse {
    pub ok: bool,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncStep1 {
    pub doc_id: String,
    pub state_vector: Vec<u8>,  // Serialized Yrs StateVector
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncStep2 {
    pub doc_id: String,
    pub updates: Vec<Vec<u8>>,  // Serialized Yrs Updates
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AwarenessUpdate {
    pub doc_id: String,
    pub client_id: u64,
    pub cursor: Option<CursorState>,
    pub user_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CursorState {
    pub line: u32,
    pub column: u32,
    pub selection_start: Option<u32>,
    pub selection_end: Option<u32>,
}

/// Encrypted payload wrapper
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EncryptedPayload {
    pub ciphertext: Vec<u8>,
    pub nonce: Vec<u8>,       // 24 bytes for XChaCha20
    pub salt: Vec<u8>,        // Per-message independent salt
    pub alg: String,          // "xchacha20-poly1305-ietf"
}

/// Document operation event (for plugin system and webhooks)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DocEvent {
    pub event_type: DocEventType,
    pub doc_id: String,
    pub path: String,
    pub timestamp: i64,
    pub metadata: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DocEventType {
    Created,
    Updated,
    Deleted,
    Renamed,
    Opened,
}

/// Command from frontend to backend (Tauri command protocol)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FrontendCommand {
    pub id: String,
    pub command: String,
    pub params: serde_json::Value,
}

/// Response from backend to frontend
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackendResponse {
    pub id: String,
    pub success: bool,
    pub data: Option<serde_json::Value>,
    pub error: Option<String>,
}
