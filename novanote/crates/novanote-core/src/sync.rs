use std::collections::VecDeque;
use std::sync::{Arc, Mutex};
use serde::{Serialize, Deserialize};
use tokio::sync::watch;
use futures_util::{SinkExt, StreamExt};
use crate::crdt::YDocHolder;
use crate::crypto::{encrypt, decrypt, derive_key};
use crate::protobuf::{AuthRequest, SyncMessage};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncConfig {
    pub server_url: String,
    pub vault_id: String,
    pub enabled: bool,
    pub master_password_set: bool,
    pub jwt_token: String,
    pub device_id: String,
}

/// Represents a pending sync operation (for offline queue)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PendingUpdate {
    pub note_id: String,
    pub encrypted_blob: String,  // base64
    pub nonce: String,           // base64
    pub timestamp: i64,
}

/// Command sent from the SyncEngine to the WebSocket background task
#[derive(Debug, Clone)]
#[allow(dead_code)]
enum WsCommand {
    /// Send an encrypted CRDT update for a note
    SendUpdate { note_id: String, encrypted_data: String },
    /// Shut down the WebSocket task
    Disconnect,
}

/// Shared state accessible from both SyncEngine and background tasks
struct SharedState {
    connected: bool,
    ws_connected: bool,
    last_sync_timestamp: i64,
}

pub struct SyncEngine {
    config: Arc<Mutex<SyncConfig>>,
    master_key: Arc<Mutex<Option<[u8; 32]>>>,
    offline_queue: Arc<Mutex<VecDeque<PendingUpdate>>>,
    shared: Arc<Mutex<SharedState>>,
    /// Channel to send commands to the WebSocket background task
    ws_cmd_tx: Mutex<Option<tokio::sync::mpsc::UnboundedSender<WsCommand>>>,
    /// Watch channel to signal the WebSocket task to shut down
    ws_shutdown_tx: Mutex<Option<watch::Sender<bool>>>,
    /// Handle for the WebSocket background task
    ws_task_handle: Mutex<Option<tokio::task::JoinHandle<()>>>,
    /// Handle for the sync loop background task
    sync_loop_handle: Mutex<Option<tokio::task::JoinHandle<()>>>,
}

impl SyncEngine {
    pub fn new(server_url: Option<String>, vault_id: Option<String>) -> Self {
        SyncEngine {
            config: Arc::new(Mutex::new(SyncConfig {
                server_url: server_url.unwrap_or_default(),
                vault_id: vault_id.unwrap_or_default(),
                enabled: false,
                master_password_set: false,
                jwt_token: String::new(),
                device_id: uuid::Uuid::new_v4().to_string(),
            })),
            master_key: Arc::new(Mutex::new(None)),
            offline_queue: Arc::new(Mutex::new(VecDeque::new())),
            shared: Arc::new(Mutex::new(SharedState {
                connected: false,
                ws_connected: false,
                last_sync_timestamp: 0,
            })),
            ws_cmd_tx: Mutex::new(None),
            ws_shutdown_tx: Mutex::new(None),
            ws_task_handle: Mutex::new(None),
            sync_loop_handle: Mutex::new(None),
        }
    }

    /// Configure the sync engine
    pub fn configure(&self, server_url: String, vault_id: String) {
        let mut config = self.config.lock().unwrap();
        config.server_url = server_url;
        config.vault_id = vault_id;
    }

    /// Set the JWT token used for WebSocket authentication
    pub fn set_jwt_token(&self, token: String) {
        self.config.lock().unwrap().jwt_token = token;
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

    /// Push updates to server via HTTP (fallback)
    pub async fn push_updates(&self, note_id: &str, ydoc_holder: &YDocHolder) -> Result<(), String> {
        if !self.is_enabled() {
            return Err("Sync not enabled".to_string());
        }

        let config = self.config.lock().unwrap();
        let server_url = config.server_url.clone();
        drop(config);

        if server_url.is_empty() {
            self.queue_offline(note_id, ydoc_holder).map_err(|e| e.to_string())?;
            return Ok(());
        }

        self.flush_offline_queue().await.unwrap_or_else(|e| {
            tracing::warn!("Failed to flush offline queue before push: {}", e);
            0
        });

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
                .unwrap_or_else(|e| {
                    tracing::warn!("HTTP push failed for note {}: {}", note_id, e);
                });

            let mut shared = self.shared.lock().unwrap();
            shared.last_sync_timestamp = chrono::Utc::now().timestamp();
        }

        Ok(())
    }

    /// Pull updates from server via HTTP (fallback)
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

    /// Flush offline queue when back online.
    /// Sends all queued updates to the sync server via HTTP.
    /// Returns the number of updates successfully sent.
    pub async fn flush_offline_queue(&self) -> Result<usize, String> {
        let queue: Vec<PendingUpdate> = {
            let mut queue = self.offline_queue.lock().unwrap();
            queue.drain(..).collect()
        };
        if queue.is_empty() {
            return Ok(0);
        }

        let config = self.config.lock().unwrap();
        let server_url = config.server_url.clone();
        let vault_id = config.vault_id.clone();
        drop(config);

        if server_url.is_empty() {
            // Re-queue if we can't send
            let mut q = self.offline_queue.lock().unwrap();
            q.extend(queue);
            return Err("Server URL not configured".to_string());
        }

        let client = reqwest::Client::new();
        let mut sent = 0usize;

        for update in &queue {
            let result = client.post(format!("{}/sync/push", server_url))
                .json(&serde_json::json!({
                    "vault_id": vault_id,
                    "note_id": update.note_id,
                    "encrypted_blob": format!("{}:{}", update.nonce, update.encrypted_blob),
                }))
                .send()
                .await;

            match result {
                Ok(resp) if resp.status().is_success() => {
                    sent += 1;
                }
                _ => {
                    // Re-queue failed updates
                    let mut q = self.offline_queue.lock().unwrap();
                    q.extend(queue.iter().skip(sent).cloned());
                    return Err(format!("Failed to send update at index {}", sent));
                }
            }
        }

        let mut shared = self.shared.lock().unwrap();
        shared.last_sync_timestamp = chrono::Utc::now().timestamp();

        Ok(sent)
    }

    /// Get sync status
    pub fn get_status(&self) -> SyncStatus {
        let config = self.config.lock().unwrap();
        let queue_len = self.offline_queue.lock().unwrap().len();
        let shared = self.shared.lock().unwrap();

        SyncStatus {
            enabled: config.enabled,
            connected: shared.connected,
            ws_connected: shared.ws_connected,
            server_url: config.server_url.clone(),
            vault_id: config.vault_id.clone(),
            master_password_set: config.master_password_set,
            encryption_ready: self.master_key.lock().unwrap().is_some(),
            offline_queue_size: queue_len,
            last_sync: shared.last_sync_timestamp,
        }
    }

    /// Set connected status
    pub fn set_connected(&self, connected: bool) {
        self.shared.lock().unwrap().connected = connected;
    }

    /// Check if WebSocket is connected
    pub fn is_ws_connected(&self) -> bool {
        self.shared.lock().unwrap().ws_connected
    }

    // ── WebSocket methods ──────────────────────────────────────────────

    /// Connect to the sync server via WebSocket.
    ///
    /// Spawns a background tokio task that:
    /// - Authenticates with the server using the stored JWT
    /// - Listens for incoming encrypted CRDT updates and applies them
    /// - Forwards local changes to the server when requested
    /// - Reconnects with exponential backoff on disconnection
    pub fn connect_websocket(&self, ydoc_holder: YDocHolder) -> Result<(), String> {
        if self.shared.lock().unwrap().ws_connected {
            return Ok(()); // Already connected
        }

        let config = self.config.lock().unwrap().clone();
        if config.server_url.is_empty() || config.vault_id.is_empty() {
            return Err("Server URL and vault ID must be configured".to_string());
        }
        if config.jwt_token.is_empty() {
            return Err("JWT token must be set before connecting".to_string());
        }

        // Create channels for commands and shutdown signalling
        let (cmd_tx, cmd_rx) = tokio::sync::mpsc::unbounded_channel::<WsCommand>();
        let (shutdown_tx, shutdown_rx) = watch::channel(false);

        // Store senders so the SyncEngine can communicate with the task
        *self.ws_cmd_tx.lock().unwrap() = Some(cmd_tx);
        *self.ws_shutdown_tx.lock().unwrap() = Some(shutdown_tx);

        // Clone the Arc references so the spawned task can access shared state
        let shared = Arc::clone(&self.shared);
        let master_key = Arc::clone(&self.master_key);
        let offline_queue = Arc::clone(&self.offline_queue);

        // Spawn the background WebSocket task
        let handle = tokio::spawn(async move {
            run_ws_loop(
                config,
                ydoc_holder,
                cmd_rx,
                shutdown_rx,
                shared,
                master_key,
                offline_queue,
            ).await;
        });

        *self.ws_task_handle.lock().unwrap() = Some(handle);

        Ok(())
    }

    /// Disconnect the WebSocket connection
    pub fn disconnect_websocket(&self) {
        // Signal shutdown
        if let Some(tx) = self.ws_shutdown_tx.lock().unwrap().take() {
            let _ = tx.send(true);
        }
        // Close command channel
        if let Some(tx) = self.ws_cmd_tx.lock().unwrap().take() {
            drop(tx);
        }
        self.shared.lock().unwrap().ws_connected = false;
    }

    /// Send a local update through the WebSocket connection (if connected).
    /// Falls back to HTTP push if WebSocket is not connected.
    pub async fn send_ws_update(&self, note_id: &str, ydoc_holder: &YDocHolder) -> Result<(), String> {
        if self.shared.lock().unwrap().ws_connected {
            if let Some(tx) = self.ws_cmd_tx.lock().unwrap().as_ref() {
                let sv = ydoc_holder.get_state_vector(note_id).unwrap_or_default();
                if let Some(encrypted) = self.prepare_update(note_id, ydoc_holder, &sv) {
                    let _ = tx.send(WsCommand::SendUpdate {
                        note_id: note_id.to_string(),
                        encrypted_data: encrypted,
                    });
                    return Ok(());
                }
            }
        }
        // Fallback to HTTP
        self.push_updates(note_id, ydoc_holder).await
    }

    /// Start the main sync loop.
    ///
    /// This method:
    /// - Connects WebSocket if not already connected
    /// - Periodically (every 30s) performs a full HTTP sync as fallback
    /// - Processes the offline queue when connection is established
    pub fn start_sync_loop(&self, ydoc_holder: YDocHolder) -> Result<(), String> {
        if !self.is_enabled() {
            return Err("Sync not enabled".to_string());
        }

        // Try to connect WebSocket (non-blocking — ok if it fails, HTTP fallback will work)
        if !self.shared.lock().unwrap().ws_connected {
            let _ = self.connect_websocket(ydoc_holder.clone());
        }

        // If a sync loop is already running, don't start another
        if let Some(handle) = self.sync_loop_handle.lock().unwrap().as_ref() {
            if !handle.is_finished() {
                return Ok(()); // Already running
            }
        }

        let config = self.config.lock().unwrap().clone();
        let shared = Arc::clone(&self.shared);
        let master_key = Arc::clone(&self.master_key);
        let offline_queue = Arc::clone(&self.offline_queue);
        let ydoc = ydoc_holder;
        let server_url = config.server_url.clone();
        let vault_id = config.vault_id.clone();

        let handle = tokio::spawn(async move {
            let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(30));

            loop {
                interval.tick().await;

                // HTTP fallback: full sync
                if !server_url.is_empty() {
                    let client = reqwest::Client::new();

                    // Pull all updates for this vault
                    if let Ok(resp) = client
                        .get(format!("{}/sync/pull/{}", server_url, vault_id))
                        .send()
                        .await
                    {
                        if let Ok(json) = resp.json::<serde_json::Value>().await {
                            if let Some(updates) = json["updates"].as_array() {
                                for update in updates {
                                    if let (Some(note_id), Some(encrypted)) = (
                                        update["note_id"].as_str(),
                                        update["encrypted_blob"].as_str(),
                                    ) {
                                        // Decrypt and apply the update
                                        let key_opt = *master_key.lock().unwrap();
                                        if let Some(key) = key_opt {
                                            if let Ok(plaintext) = decrypt_incoming(encrypted, &key) {
                                                ydoc.get_or_create(note_id);
                                                let _ = ydoc.apply_update(note_id, &plaintext);
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }

                    // Update last sync timestamp
                    shared.lock().unwrap().last_sync_timestamp = chrono::Utc::now().timestamp();
                }

                // Process offline queue if connected
                let is_connected = {
                    let s = shared.lock().unwrap();
                    s.ws_connected || s.connected
                };
                if is_connected {
                    // Send queued updates to the server
                    let queue: Vec<PendingUpdate> = {
                        let mut q = offline_queue.lock().unwrap();
                        q.drain(..).collect()
                    };
                    if !queue.is_empty() {
                        for update in &queue {
                            let _ = client.post(format!("{}/sync/push", server_url))
                                .json(&serde_json::json!({
                                    "vault_id": vault_id,
                                    "note_id": update.note_id,
                                    "encrypted_blob": format!("{}:{}", update.nonce, update.encrypted_blob),
                                }))
                                .send()
                                .await;
                        }
                    }
                }
            }
        });

        *self.sync_loop_handle.lock().unwrap() = Some(handle);

        Ok(())
    }
}

/// Decrypt an incoming encrypted update string (format: "base64_nonce:base64_ciphertext")
fn decrypt_incoming(encrypted_data: &str, key: &[u8; 32]) -> Result<Vec<u8>, String> {
    use base64::{Engine as _, engine::general_purpose::STANDARD as B64};
    let parts: Vec<&str> = encrypted_data.splitn(2, ':').collect();
    if parts.len() != 2 {
        return Err("Invalid encrypted data format".to_string());
    }
    let nonce = B64.decode(parts[0]).map_err(|e| format!("Invalid nonce: {}", e))?;
    let ciphertext = B64.decode(parts[1]).map_err(|e| format!("Invalid ciphertext: {}", e))?;
    decrypt(&ciphertext, &nonce, key)
}

/// Handle an incoming SyncMessage by applying updates to the YDocHolder.
fn handle_sync_message(sync_msg: &SyncMessage, ydoc_holder: &YDocHolder, master_key: &Arc<Mutex<Option<[u8; 32]>>>) {
    match sync_msg.msg_type.as_str() {
        "auth_ok" => {
            // Server confirmed authentication
        }
        "update" => {
            // Handle incoming encrypted CRDT updates
            if let Some(step2) = &sync_msg.step2 {
                let key_opt = *master_key.lock().unwrap();
                if let Some(key) = key_opt {
                    for update_bytes in &step2.updates {
                        let encrypted_str = String::from_utf8_lossy(update_bytes);
                        if let Ok(plaintext) = decrypt_incoming(&encrypted_str, &key) {
                            ydoc_holder.get_or_create(&step2.doc_id);
                            let _ = ydoc_holder.apply_update(&step2.doc_id, &plaintext);
                        }
                    }
                }
            }
        }
        _ => {}
    }
}

/// Background WebSocket loop with exponential backoff reconnection.
async fn run_ws_loop(
    config: SyncConfig,
    ydoc_holder: YDocHolder,
    mut cmd_rx: tokio::sync::mpsc::UnboundedReceiver<WsCommand>,
    mut shutdown_rx: watch::Receiver<bool>,
    shared: Arc<Mutex<SharedState>>,
    master_key: Arc<Mutex<Option<[u8; 32]>>>,
    offline_queue: Arc<Mutex<VecDeque<PendingUpdate>>>,
) {
    let mut backoff_secs: u64 = 1;
    let max_backoff_secs: u64 = 60;

    loop {
        // Check shutdown before connecting
        if *shutdown_rx.borrow() {
            break;
        }

        // Build WebSocket URL: ws://{server_url}/ws/{vault_id}
        // Strip any http:// or https:// prefix from server_url
        let host = config.server_url
            .trim_start_matches("http://")
            .trim_start_matches("https://");
        let ws_url = format!("ws://{}/ws/{}", host, config.vault_id);

        // Attempt connection
        match tokio_tungstenite::connect_async(&ws_url).await {
            Ok((ws_stream, _response)) => {
                shared.lock().unwrap().ws_connected = true;
                backoff_secs = 1; // Reset backoff on successful connection

                let (mut write, mut read) = ws_stream.split();

                // Send authentication message using Protobuf
                let auth_msg = SyncMessage {
                    msg_type: "auth".to_string(),
                    auth: Some(AuthRequest {
                        jwt: config.jwt_token.clone(),
                        device_id: config.device_id.clone(),
                        vault_id: config.vault_id.clone(),
                    }),
                    auth_ok: None,
                    step1: None,
                    step2: None,
                    awareness: None,
                };
                // Encode as Protobuf with prefix byte and send as binary
                let auth_bytes = auth_msg.encode_prefixed();
                use tokio_tungstenite::tungstenite::Message;
                if write.send(Message::Binary(auth_bytes.into())).await.is_err() {
                    shared.lock().unwrap().ws_connected = false;
                    tokio::time::sleep(tokio::time::Duration::from_secs(backoff_secs)).await;
                    backoff_secs = (backoff_secs * 2).min(max_backoff_secs);
                    continue;
                }

                // Flush offline queue now that we're connected
                offline_queue.lock().unwrap().clear();

                // Main message loop
                loop {
                    tokio::select! {
                        // Incoming messages from server
                        msg = read.next() => {
                            match msg {
                                Some(Ok(Message::Binary(data))) => {
                                    // Binary messages: try Protobuf-prefixed first, then JSON-prefixed
                                    if let Ok(sync_msg) = SyncMessage::decode_prefixed(&data) {
                                        handle_sync_message(&sync_msg, &ydoc_holder, &master_key);
                                    }
                                }
                                Some(Ok(Message::Text(text))) => {
                                    // Text messages: legacy JSON format (backward compatibility)
                                    if let Ok(sync_msg) = serde_json::from_str::<SyncMessage>(&text) {
                                        handle_sync_message(&sync_msg, &ydoc_holder, &master_key);
                                    }
                                }
                                Some(Ok(Message::Close(_))) | Some(Err(_)) | None => {
                                    break;
                                }
                                _ => {}
                            }
                        }

                        // Commands from the SyncEngine
                        cmd = cmd_rx.recv() => {
                            match cmd {
                                Some(WsCommand::SendUpdate { note_id, encrypted_data }) => {
                                    let msg = SyncMessage {
                                        msg_type: "update".to_string(),
                                        auth: None,
                                        auth_ok: None,
                                        step1: None,
                                        step2: Some(crate::protobuf::SyncStep2 {
                                            doc_id: note_id,
                                            updates: vec![encrypted_data.into_bytes()],
                                        }),
                                        awareness: None,
                                    };
                                    // Encode as Protobuf with prefix byte and send as binary
                                    let msg_bytes = msg.encode_prefixed();
                                    if write.send(Message::Binary(msg_bytes.into())).await.is_err() {
                                        break;
                                    }
                                }
                                Some(WsCommand::Disconnect) | None => {
                                    let _ = write.send(Message::Close(None)).await;
                                    break;
                                }
                            }
                        }

                        // Shutdown signal
                        _ = shutdown_rx.changed() => {
                            let _ = write.send(Message::Close(None)).await;
                            break;
                        }
                    }
                }

                shared.lock().unwrap().ws_connected = false;
            }
            Err(_) => {
                shared.lock().unwrap().ws_connected = false;
            }
        }

        // Exponential backoff before reconnecting
        tokio::time::sleep(tokio::time::Duration::from_secs(backoff_secs)).await;
        backoff_secs = (backoff_secs * 2).min(max_backoff_secs);

        // Check shutdown again after backoff
        if *shutdown_rx.borrow() {
            break;
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncStatus {
    pub enabled: bool,
    pub connected: bool,
    pub ws_connected: bool,
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
