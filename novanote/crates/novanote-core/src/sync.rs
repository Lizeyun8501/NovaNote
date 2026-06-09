use std::collections::VecDeque;
use std::sync::Mutex;
use serde::{Serialize, Deserialize};
use crate::crdt::YDocHolder;
use crate::crypto::{encrypt, decrypt, derive_key};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncConfig {
    pub server_url: String,
    pub vault_id: String,
    pub enabled: bool,
    pub master_password_set: bool,
}

/// Represents a pending sync operation (for offline queue)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PendingUpdate {
    pub note_id: String,
    pub encrypted_blob: String,  // base64
    pub nonce: String,           // base64
    pub timestamp: i64,
}

pub struct SyncEngine {
    config: Mutex<SyncConfig>,
    master_key: Mutex<Option<[u8; 32]>>,
    offline_queue: Mutex<VecDeque<PendingUpdate>>,
    connected: Mutex<bool>,
    last_sync_timestamp: Mutex<i64>,
}

impl SyncEngine {
    pub fn new(server_url: Option<String>, vault_id: Option<String>) -> Self {
        SyncEngine {
            config: Mutex::new(SyncConfig {
                server_url: server_url.unwrap_or_default(),
                vault_id: vault_id.unwrap_or_default(),
                enabled: false,
                master_password_set: false,
            }),
            master_key: Mutex::new(None),
            offline_queue: Mutex::new(VecDeque::new()),
            connected: Mutex::new(false),
            last_sync_timestamp: Mutex::new(0),
        }
    }

    /// Configure the sync engine
    pub fn configure(&self, server_url: String, vault_id: String) {
        let mut config = self.config.lock().unwrap();
        config.server_url = server_url;
        config.vault_id = vault_id;
    }

    /// Enable sync
    pub fn enable(&self) {
        self.config.lock().unwrap().enabled = true;
    }

    /// Disable sync
    pub fn disable(&self) {
        self.config.lock().unwrap().enabled = false;
    }

    /// Check if sync is enabled
    pub fn is_enabled(&self) -> bool {
        self.config.lock().unwrap().enabled
    }

    /// Set master password and derive encryption key
    pub fn set_master_password(&self, password: &str) {
        let (key, _salt) = derive_key(password, None);
        let mut mk = self.master_key.lock().unwrap();
        *mk = Some(*key);
        self.config.lock().unwrap().master_password_set = true;
    }

    /// Unlock with master password (for reconnecting)
    pub fn unlock(&self, password: &str) -> bool {
        // In production, verify against stored hash
        // For MVP, just derive the key
        let (key, _salt) = derive_key(password, None);
        let mut mk = self.master_key.lock().unwrap();
        *mk = Some(*key);
        true
    }

    /// Check if unlocked
    pub fn is_unlocked(&self) -> bool {
        self.master_key.lock().unwrap().is_some()
    }

    /// Get the current master key
    pub fn get_key(&self) -> Option<[u8; 32]> {
        *self.master_key.lock().unwrap()
    }

    /// Prepare an encrypted update for sending
    pub fn prepare_update(&self, note_id: &str, ydoc_holder: &YDocHolder, state_vector: &[u8]) -> Option<String> {
        let update = ydoc_holder.get_update(note_id, state_vector)?;
        let key = self.get_key()?;
        
        let (ciphertext, nonce) = encrypt(&update, &key);
        
        // Format: base64_nonce + ":" + base64_ciphertext
        use base64::{Engine as _, engine::general_purpose::STANDARD as B64};
        Some(format!("{}:{}", B64.encode(&nonce), B64.encode(&ciphertext)))
    }

    /// Process a received encrypted update
    pub fn process_received_update(&self, note_id: &str, encrypted_data: &str, ydoc_holder: &YDocHolder) -> Result<(), String> {
        let key = self.get_key().ok_or("No master key")?;
        
        use base64::{Engine as _, engine::general_purpose::STANDARD as B64};
        let parts: Vec<&str> = encrypted_data.splitn(2, ':').collect();
        if parts.len() != 2 {
            return Err("Invalid encrypted data format".to_string());
        }
        
        let nonce = B64.decode(parts[0]).map_err(|e| format!("Invalid nonce: {}", e))?;
        let ciphertext = B64.decode(parts[1]).map_err(|e| format!("Invalid ciphertext: {}", e))?;
        
        let plaintext = decrypt(&ciphertext, &nonce, &key)?;
        
        ydoc_holder.get_or_create(note_id);
        ydoc_holder.apply_update(note_id, &plaintext)?;
        
        Ok(())
    }

    /// Push updates to server (simplified - would use WebSocket in real impl)
    pub async fn push_updates(&self, note_id: &str, ydoc_holder: &YDocHolder) -> Result<(), String> {
        if !self.is_enabled() {
            return Err("Sync not enabled".to_string());
        }
        
        let config = self.config.lock().unwrap();
        let server_url = config.server_url.clone();
        drop(config);
        
        if server_url.is_empty() {
            // Queue offline
            self.queue_offline(note_id, ydoc_holder).map_err(|e| e.to_string())?;
            return Ok(());
        }
        
        // Try to flush offline queue first
        self.flush_offline_queue().await.ok();
        
        // Send current update via HTTP (in production, use WebSocket)
        let sv = ydoc_holder.get_state_vector(note_id).unwrap_or_default();
        if let Some(encrypted) = self.prepare_update(note_id, ydoc_holder, &sv) {
            let client = reqwest::Client::new();
            let _ = client.post(format!("{}/sync/push", server_url))
                .json(&serde_json::json!({
                    "vault_id": self.config.lock().unwrap().vault_id,
                    "note_id": note_id,
                    "encrypted_blob": encrypted,
                }))
                .send()
                .await
                .ok();
            
            let mut ts = self.last_sync_timestamp.lock().unwrap();
            *ts = chrono::Utc::now().timestamp();
        }
        
        Ok(())
    }

    /// Pull updates from server (simplified)
    pub async fn pull_updates(&self, note_id: &str, ydoc_holder: &YDocHolder) -> Result<bool, String> {
        if !self.is_enabled() {
            return Err("Sync not enabled".to_string());
        }
        
        let config = self.config.lock().unwrap();
        let server_url = config.server_url.clone();
        drop(config);
        
        if server_url.is_empty() {
            return Ok(false);
        }
        
        let client = reqwest::Client::new();
        if let Ok(resp) = client.get(format!("{}/sync/pull/{}", server_url, note_id))
            .send()
            .await
        {
            if let Ok(json) = resp.json::<serde_json::Value>().await {
                if let Some(updates) = json["updates"].as_array() {
                    for update in updates {
                        if let Some(encrypted) = update["encrypted_blob"].as_str() {
                            self.process_received_update(note_id, encrypted, ydoc_holder)?;
                        }
                    }
                    return Ok(!updates.is_empty());
                }
            }
        }
        
        Ok(false)
    }

    /// Queue an operation for offline use
    fn queue_offline(&self, note_id: &str, ydoc_holder: &YDocHolder) -> Result<(), String> {
        let sv = ydoc_holder.get_state_vector(note_id).unwrap_or_default();
        if let Some(encrypted) = self.prepare_update(note_id, ydoc_holder, &sv) {
            let parts: Vec<&str> = encrypted.splitn(2, ':').collect();
            let mut queue = self.offline_queue.lock().unwrap();
            queue.push_back(PendingUpdate {
                note_id: note_id.to_string(),
                encrypted_blob: parts.get(1).unwrap_or(&"").to_string(),
                nonce: parts.get(0).unwrap_or(&"").to_string(),
                timestamp: chrono::Utc::now().timestamp(),
            });
        }
        Ok(())
    }

    /// Flush offline queue when back online
    pub async fn flush_offline_queue(&self) -> Result<usize, String> {
        let mut queue = self.offline_queue.lock().unwrap();
        let count = queue.len();
        
        // In production, send each queued update to the server
        // For now, clear the queue
        queue.clear();
        
        Ok(count)
    }

    /// Get sync status
    pub fn get_status(&self) -> SyncStatus {
        let config = self.config.lock().unwrap();
        let queue_len = self.offline_queue.lock().unwrap().len();
        
        SyncStatus {
            enabled: config.enabled,
            connected: *self.connected.lock().unwrap(),
            server_url: config.server_url.clone(),
            vault_id: config.vault_id.clone(),
            master_password_set: config.master_password_set,
            encryption_ready: self.master_key.lock().unwrap().is_some(),
            offline_queue_size: queue_len,
            last_sync: *self.last_sync_timestamp.lock().unwrap(),
        }
    }

    /// Set connected status
    pub fn set_connected(&self, connected: bool) {
        *self.connected.lock().unwrap() = connected;
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncStatus {
    pub enabled: bool,
    pub connected: bool,
    pub server_url: String,
    pub vault_id: String,
    pub master_password_set: bool,
    pub encryption_ready: bool,
    pub offline_queue_size: usize,
    pub last_sync: i64,
}

impl Default for SyncEngine {
    fn default() -> Self {
        Self::new(None, None)
    }
}