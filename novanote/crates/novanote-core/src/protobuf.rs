//! Protobuf message definitions for Rust↔TypeScript communication contract.
//! These types define the wire format between the Tauri backend and frontend,
//! ensuring type-safe communication across the FFI boundary.
//!
//! All message types support both JSON (serde) and Protobuf (prost) serialization.
//! The WebSocket protocol uses a prefix byte to distinguish formats:
//!   0x01 = Protobuf binary
//!   0x02 = JSON text

use prost::Message;
use serde::{Deserialize, Serialize};
use crate::VaultError;

/// Prefix byte indicating Protobuf-encoded payload
pub const PREFIX_PROTOBUF: u8 = 0x01;
/// Prefix byte indicating JSON-encoded payload
pub const PREFIX_JSON: u8 = 0x02;

// ── Serde helpers for fields that are Vec<u8> in prost but serde_json::Value in JSON ──

/// Serde module that serializes `Vec<u8>` (containing JSON bytes) as a `serde_json::Value`.
/// This maintains JSON backward compatibility while using raw bytes for Protobuf.
mod json_bytes {
    use serde::{Deserialize, Deserializer, Serializer, Serialize};
    use serde_json::Value;

    pub fn serialize<S: Serializer>(data: &Vec<u8>, serializer: S) -> Result<S::Ok, S::Error> {
        let value: Value = serde_json::from_slice(data).unwrap_or(Value::Null);
        value.serialize(serializer)
    }

    pub fn deserialize<'de, D: Deserializer<'de>>(deserializer: D) -> Result<Vec<u8>, D::Error> {
        let value: Value = Value::deserialize(deserializer)?;
        Ok(serde_json::to_vec(&value).unwrap_or_default())
    }
}

/// Same as json_bytes but for Option<Vec<u8>>.
mod json_bytes_opt {
    use serde::{Deserialize, Deserializer, Serializer, Serialize};
    use serde_json::Value;

    pub fn serialize<S: Serializer>(data: &Option<Vec<u8>>, serializer: S) -> Result<S::Ok, S::Error> {
        match data {
            Some(bytes) => {
                let value: Value = serde_json::from_slice(bytes).unwrap_or(Value::Null);
                value.serialize(serializer)
            }
            None => serializer.serialize_none(),
        }
    }

    pub fn deserialize<'de, D: Deserializer<'de>>(deserializer: D) -> Result<Option<Vec<u8>>, D::Error> {
        let value: Option<Value> = Option::deserialize(deserializer)?;
        Ok(value.map(|v| serde_json::to_vec(&v).unwrap_or_default()))
    }
}

// ── Sync protocol messages ────────────────────────────────────────────

/// Sync protocol message (mirrors the protobuf definition in the design doc)
#[derive(Clone, PartialEq, Serialize, Deserialize, prost::Message)]
pub struct SyncMessage {
    #[prost(string, tag = "1")]
    #[serde(rename = "type")]
    pub msg_type: String,

    #[prost(message, optional, tag = "2")]
    pub auth: Option<AuthRequest>,

    #[prost(message, optional, tag = "3")]
    pub auth_ok: Option<AuthResponse>,

    #[prost(message, optional, tag = "4")]
    pub step1: Option<SyncStep1>,

    #[prost(message, optional, tag = "5")]
    pub step2: Option<SyncStep2>,

    #[prost(message, optional, tag = "6")]
    pub awareness: Option<AwarenessUpdate>,
}

impl SyncMessage {
    /// Encode this message as Protobuf bytes (without prefix).
    pub fn encode_to_bytes(&self) -> Vec<u8> {
        let mut buf = Vec::with_capacity(self.encoded_len());
        self.encode(&mut buf).expect("prost encoding is infallible");
        buf
    }

    /// Encode this message with the Protobuf prefix byte for WebSocket transport.
    pub fn encode_prefixed(&self) -> Vec<u8> {
        let mut buf = vec![PREFIX_PROTOBUF];
        buf.reserve(self.encoded_len());
        self.encode(&mut buf).expect("prost encoding is infallible");
        buf
    }

    /// Encode this message with the JSON prefix byte for WebSocket transport.
    pub fn encode_json_prefixed(&self) -> Result<Vec<u8>, VaultError> {
        let json = serde_json::to_vec(self)
            .map_err(|e| VaultError::Other(format!("JSON encode error: {}", e)))?;
        let mut buf = vec![PREFIX_JSON];
        buf.extend_from_slice(&json);
        Ok(buf)
    }

    /// Decode a Protobuf-encoded SyncMessage (without prefix).
    pub fn decode_from_bytes(data: &[u8]) -> Result<Self, VaultError> {
        Self::decode(data).map_err(|e| VaultError::Other(format!("Protobuf decode error: {}", e)))
    }

    /// Decode a prefixed message, detecting format from the first byte.
    /// Returns the parsed SyncMessage regardless of whether it was Protobuf or JSON.
    pub fn decode_prefixed(data: &[u8]) -> Result<Self, VaultError> {
        if data.is_empty() {
            return Err(VaultError::Other("Empty message".to_string()));
        }
        match data[0] {
            PREFIX_PROTOBUF => {
                Self::decode_from_bytes(&data[1..])
            }
            PREFIX_JSON => {
                serde_json::from_slice(&data[1..])
                    .map_err(|e| VaultError::Other(format!("JSON decode error: {}", e)))
            }
            _ => {
                // Try to detect: if first byte looks like valid JSON ('{') or
                // valid protobuf field tag, attempt both
                if data[0] == b'{' {
                    serde_json::from_slice(data)
                        .map_err(|e| VaultError::Other(format!("JSON decode error: {}", e)))
                } else {
                    // Try protobuf without prefix
                    Self::decode_from_bytes(data)
                }
            }
        }
    }
}

#[derive(Clone, PartialEq, Serialize, Deserialize, prost::Message)]
pub struct AuthRequest {
    #[prost(string, tag = "1")]
    pub jwt: String,
    #[prost(string, tag = "2")]
    pub device_id: String,
    #[prost(string, tag = "3")]
    pub vault_id: String,
}

impl AuthRequest {
    pub fn encode_to_bytes(&self) -> Vec<u8> {
        let mut buf = Vec::with_capacity(self.encoded_len());
        self.encode(&mut buf).expect("prost encoding is infallible");
        buf
    }

    pub fn decode_from_bytes(data: &[u8]) -> Result<Self, VaultError> {
        Self::decode(data).map_err(|e| VaultError::Other(format!("Protobuf decode error: {}", e)))
    }
}

#[derive(Clone, PartialEq, Serialize, Deserialize, prost::Message)]
pub struct AuthResponse {
    #[prost(bool, tag = "1")]
    pub ok: bool,
    #[prost(string, optional, tag = "2")]
    pub error: Option<String>,
}

impl AuthResponse {
    pub fn encode_to_bytes(&self) -> Vec<u8> {
        let mut buf = Vec::with_capacity(self.encoded_len());
        self.encode(&mut buf).expect("prost encoding is infallible");
        buf
    }

    pub fn decode_from_bytes(data: &[u8]) -> Result<Self, VaultError> {
        Self::decode(data).map_err(|e| VaultError::Other(format!("Protobuf decode error: {}", e)))
    }
}

#[derive(Clone, PartialEq, Serialize, Deserialize, prost::Message)]
pub struct SyncStep1 {
    #[prost(string, tag = "1")]
    pub doc_id: String,
    #[prost(bytes = "vec", tag = "2")]
    pub state_vector: Vec<u8>,  // Serialized Yrs StateVector
}

impl SyncStep1 {
    pub fn encode_to_bytes(&self) -> Vec<u8> {
        let mut buf = Vec::with_capacity(self.encoded_len());
        self.encode(&mut buf).expect("prost encoding is infallible");
        buf
    }

    pub fn decode_from_bytes(data: &[u8]) -> Result<Self, VaultError> {
        Self::decode(data).map_err(|e| VaultError::Other(format!("Protobuf decode error: {}", e)))
    }
}

#[derive(Clone, PartialEq, Serialize, Deserialize, prost::Message)]
pub struct SyncStep2 {
    #[prost(string, tag = "1")]
    pub doc_id: String,
    #[prost(bytes = "vec", repeated, tag = "2")]
    pub updates: Vec<Vec<u8>>,  // Serialized Yrs Updates
}

impl SyncStep2 {
    pub fn encode_to_bytes(&self) -> Vec<u8> {
        let mut buf = Vec::with_capacity(self.encoded_len());
        self.encode(&mut buf).expect("prost encoding is infallible");
        buf
    }

    pub fn decode_from_bytes(data: &[u8]) -> Result<Self, VaultError> {
        Self::decode(data).map_err(|e| VaultError::Other(format!("Protobuf decode error: {}", e)))
    }
}

#[derive(Clone, PartialEq, Serialize, Deserialize, prost::Message)]
pub struct AwarenessUpdate {
    #[prost(string, tag = "1")]
    pub doc_id: String,
    #[prost(uint64, tag = "2")]
    pub client_id: u64,
    #[prost(message, optional, tag = "3")]
    pub cursor: Option<CursorState>,
    #[prost(string, optional, tag = "4")]
    pub user_name: Option<String>,
}

impl AwarenessUpdate {
    pub fn encode_to_bytes(&self) -> Vec<u8> {
        let mut buf = Vec::with_capacity(self.encoded_len());
        self.encode(&mut buf).expect("prost encoding is infallible");
        buf
    }

    pub fn decode_from_bytes(data: &[u8]) -> Result<Self, VaultError> {
        Self::decode(data).map_err(|e| VaultError::Other(format!("Protobuf decode error: {}", e)))
    }
}

#[derive(Clone, PartialEq, Serialize, Deserialize, prost::Message)]
pub struct CursorState {
    #[prost(uint32, tag = "1")]
    pub line: u32,
    #[prost(uint32, tag = "2")]
    pub column: u32,
    #[prost(uint32, optional, tag = "3")]
    pub selection_start: Option<u32>,
    #[prost(uint32, optional, tag = "4")]
    pub selection_end: Option<u32>,
}

impl CursorState {
    pub fn encode_to_bytes(&self) -> Vec<u8> {
        let mut buf = Vec::with_capacity(self.encoded_len());
        self.encode(&mut buf).expect("prost encoding is infallible");
        buf
    }

    pub fn decode_from_bytes(data: &[u8]) -> Result<Self, VaultError> {
        Self::decode(data).map_err(|e| VaultError::Other(format!("Protobuf decode error: {}", e)))
    }
}

/// Encrypted payload wrapper
#[derive(Clone, PartialEq, Serialize, Deserialize, prost::Message)]
pub struct EncryptedPayload {
    #[prost(bytes = "vec", tag = "1")]
    pub ciphertext: Vec<u8>,
    #[prost(bytes = "vec", tag = "2")]
    pub nonce: Vec<u8>,       // 24 bytes for XChaCha20
    #[prost(bytes = "vec", tag = "3")]
    pub salt: Vec<u8>,        // Per-message independent salt
    #[prost(string, tag = "4")]
    pub alg: String,          // "xchacha20-poly1305-ietf"
}

impl EncryptedPayload {
    pub fn encode_to_bytes(&self) -> Vec<u8> {
        let mut buf = Vec::with_capacity(self.encoded_len());
        self.encode(&mut buf).expect("prost encoding is infallible");
        buf
    }

    pub fn decode_from_bytes(data: &[u8]) -> Result<Self, VaultError> {
        Self::decode(data).map_err(|e| VaultError::Other(format!("Protobuf decode error: {}", e)))
    }
}

/// Document operation event (for plugin system and webhooks)
#[derive(Clone, PartialEq, Serialize, Deserialize, prost::Message)]
pub struct DocEvent {
    #[prost(enumeration = "DocEventType", tag = "1")]
    pub event_type: i32,
    #[prost(string, tag = "2")]
    pub doc_id: String,
    #[prost(string, tag = "3")]
    pub path: String,
    #[prost(int64, tag = "4")]
    pub timestamp: i64,
    #[prost(bytes = "vec", tag = "5")]
    #[serde(with = "json_bytes")]
    pub metadata: Vec<u8>,  // JSON-encoded serde_json::Value
}

impl DocEvent {
    /// Create a DocEvent, serializing the metadata Value to bytes for Protobuf.
    pub fn new(event_type: DocEventType, doc_id: String, path: String, timestamp: i64, metadata: serde_json::Value) -> Self {
        DocEvent {
            event_type: event_type as i32,
            doc_id,
            path,
            timestamp,
            metadata: serde_json::to_vec(&metadata).unwrap_or_default(),
        }
    }

    /// Get the metadata as a serde_json::Value.
    pub fn metadata_value(&self) -> serde_json::Value {
        serde_json::from_slice(&self.metadata).unwrap_or(serde_json::Value::Null)
    }

    /// Get the event_type as the enum.
    pub fn event_type_enum(&self) -> DocEventType {
        DocEventType::try_from(self.event_type).unwrap_or(DocEventType::Updated)
    }

    pub fn encode_to_bytes(&self) -> Vec<u8> {
        let mut buf = Vec::with_capacity(self.encoded_len());
        self.encode(&mut buf).expect("prost encoding is infallible");
        buf
    }

    pub fn decode_from_bytes(data: &[u8]) -> Result<Self, VaultError> {
        Self::decode(data).map_err(|e| VaultError::Other(format!("Protobuf decode error: {}", e)))
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize, prost::Enumeration)]
#[serde(rename_all = "snake_case")]
pub enum DocEventType {
    Created = 0,
    Updated = 1,
    Deleted = 2,
    Renamed = 3,
    Opened = 4,
}

/// Command from frontend to backend (Tauri command protocol)
#[derive(Clone, PartialEq, Serialize, Deserialize, prost::Message)]
pub struct FrontendCommand {
    #[prost(string, tag = "1")]
    pub id: String,
    #[prost(string, tag = "2")]
    pub command: String,
    #[prost(bytes = "vec", tag = "3")]
    #[serde(with = "json_bytes")]
    pub params: Vec<u8>,  // JSON-encoded serde_json::Value
}

impl FrontendCommand {
    /// Create a FrontendCommand, serializing params to bytes for Protobuf.
    pub fn new(id: String, command: String, params: serde_json::Value) -> Self {
        FrontendCommand {
            id,
            command,
            params: serde_json::to_vec(&params).unwrap_or_default(),
        }
    }

    /// Get the params as a serde_json::Value.
    pub fn params_value(&self) -> serde_json::Value {
        serde_json::from_slice(&self.params).unwrap_or(serde_json::Value::Null)
    }

    pub fn encode_to_bytes(&self) -> Vec<u8> {
        let mut buf = Vec::with_capacity(self.encoded_len());
        self.encode(&mut buf).expect("prost encoding is infallible");
        buf
    }

    pub fn decode_from_bytes(data: &[u8]) -> Result<Self, VaultError> {
        Self::decode(data).map_err(|e| VaultError::Other(format!("Protobuf decode error: {}", e)))
    }
}

/// Response from backend to frontend
#[derive(Clone, PartialEq, Serialize, Deserialize, prost::Message)]
pub struct BackendResponse {
    #[prost(string, tag = "1")]
    pub id: String,
    #[prost(bool, tag = "2")]
    pub success: bool,
    #[prost(bytes = "vec", optional, tag = "3")]
    #[serde(with = "json_bytes_opt")]
    pub data: Option<Vec<u8>>,  // JSON-encoded serde_json::Value
    #[prost(string, optional, tag = "4")]
    pub error: Option<String>,
}

impl BackendResponse {
    /// Create a BackendResponse, serializing data to bytes for Protobuf.
    pub fn new(id: String, success: bool, data: Option<serde_json::Value>, error: Option<String>) -> Self {
        BackendResponse {
            id,
            success,
            data: data.map(|v| serde_json::to_vec(&v).unwrap_or_default()),
            error,
        }
    }

    /// Get the data as a serde_json::Value.
    pub fn data_value(&self) -> Option<serde_json::Value> {
        self.data.as_ref().and_then(|bytes| serde_json::from_slice(bytes).ok())
    }

    pub fn encode_to_bytes(&self) -> Vec<u8> {
        let mut buf = Vec::with_capacity(self.encoded_len());
        self.encode(&mut buf).expect("prost encoding is infallible");
        buf
    }

    pub fn decode_from_bytes(data: &[u8]) -> Result<Self, VaultError> {
        Self::decode(data).map_err(|e| VaultError::Other(format!("Protobuf decode error: {}", e)))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn roundtrip_sync_message_protobuf() {
        let msg = SyncMessage {
            msg_type: "auth".to_string(),
            auth: Some(AuthRequest {
                jwt: "token123".to_string(),
                device_id: "dev1".to_string(),
                vault_id: "vault1".to_string(),
            }),
            auth_ok: None,
            step1: None,
            step2: None,
            awareness: None,
        };
        let bytes = msg.encode_to_bytes();
        let decoded = SyncMessage::decode_from_bytes(&bytes).unwrap();
        assert_eq!(msg, decoded);
    }

    #[test]
    fn roundtrip_sync_message_prefixed() {
        let msg = SyncMessage {
            msg_type: "update".to_string(),
            auth: None,
            auth_ok: None,
            step1: None,
            step2: Some(SyncStep2 {
                doc_id: "doc1".to_string(),
                updates: vec![vec![1, 2, 3], vec![4, 5, 6]],
            }),
            awareness: None,
        };
        let prefixed = msg.encode_prefixed();
        assert_eq!(prefixed[0], PREFIX_PROTOBUF);
        let decoded = SyncMessage::decode_prefixed(&prefixed).unwrap();
        assert_eq!(msg, decoded);
    }

    #[test]
    fn roundtrip_json_prefixed() {
        let msg = SyncMessage {
            msg_type: "auth_ok".to_string(),
            auth: None,
            auth_ok: Some(AuthResponse {
                ok: true,
                error: None,
            }),
            step1: None,
            step2: None,
            awareness: None,
        };
        let prefixed = msg.encode_json_prefixed().unwrap();
        assert_eq!(prefixed[0], PREFIX_JSON);
        let decoded = SyncMessage::decode_prefixed(&prefixed).unwrap();
        assert_eq!(msg, decoded);
    }

    #[test]
    fn roundtrip_encrypted_payload() {
        let payload = EncryptedPayload {
            ciphertext: vec![0u8; 32],
            nonce: vec![1u8; 24],
            salt: vec![2u8; 16],
            alg: "xchacha20-poly1305-ietf".to_string(),
        };
        let bytes = payload.encode_to_bytes();
        let decoded = EncryptedPayload::decode_from_bytes(&bytes).unwrap();
        assert_eq!(payload, decoded);
    }

    #[test]
    fn roundtrip_doc_event() {
        let event = DocEvent::new(
            DocEventType::Updated,
            "doc1".to_string(),
            "/notes/doc1.md".to_string(),
            1234567890,
            serde_json::json!({"key": "value"}),
        );
        let bytes = event.encode_to_bytes();
        let decoded = DocEvent::decode_from_bytes(&bytes).unwrap();
        assert_eq!(event, decoded);
        assert_eq!(decoded.event_type_enum(), DocEventType::Updated);
        assert_eq!(decoded.metadata_value()["key"], "value");
    }

    #[test]
    fn doc_event_json_compat() {
        let event = DocEvent::new(
            DocEventType::Created,
            "doc2".to_string(),
            "/notes/doc2.md".to_string(),
            999,
            serde_json::json!({"action": "create"}),
        );
        let json = serde_json::to_string(&event).unwrap();
        // metadata should serialize as a JSON object, not a byte array
        assert!(json.contains("\"action\""));
        let decoded: DocEvent = serde_json::from_str(&json).unwrap();
        assert_eq!(decoded.metadata_value()["action"], "create");
    }
}
