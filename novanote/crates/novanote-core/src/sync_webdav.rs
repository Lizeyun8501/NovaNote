//! WebDAV sync backend
//! Allows syncing notes via WebDAV servers (Nextcloud, ownCloud, etc.)

use crate::{EncryptedUpdate, SyncBackend, SyncStatusInfo, VaultError};
use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WebDAVConfig {
    pub server_url: String,
    pub username: String,
    pub password: String,
    pub vault_path: String,
}

pub struct WebDAVBackend {
    config: WebDAVConfig,
    client: reqwest::Client,
}

impl WebDAVBackend {
    pub fn new(config: WebDAVConfig) -> Self {
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(30))
            .build()
            .expect("Failed to create HTTP client");
        Self { config, client }
    }

    /// Push an encrypted update to WebDAV
    pub async fn push_update(&self, doc_id: &str, data: &[u8]) -> Result<(), VaultError> {
        let path = format!("{}/{}/{}.bin",
            self.config.vault_path.trim_end_matches('/'),
            &doc_id[..2],  // shard by first 2 chars of doc_id
            doc_id
        );
        let url = format!("{}/{}", self.config.server_url.trim_end_matches('/'), path);

        let resp = self.client
            .put(&url)
            .basic_auth(&self.config.username, Some(&self.config.password))
            .body(data.to_vec())
            .send()
            .await
            .map_err(|e| VaultError::Other(format!("WebDAV push failed: {}", e)))?;

        if !resp.status().is_success() {
            return Err(VaultError::Other(format!("WebDAV push error: {}", resp.status())));
        }
        Ok(())
    }

    /// Pull an update from WebDAV
    pub async fn pull_update(&self, doc_id: &str) -> Result<Option<Vec<u8>>, VaultError> {
        let path = format!("{}/{}/{}.bin",
            self.config.vault_path.trim_end_matches('/'),
            &doc_id[..2],
            doc_id
        );
        let url = format!("{}/{}", self.config.server_url.trim_end_matches('/'), path);

        let resp = self.client
            .get(&url)
            .basic_auth(&self.config.username, Some(&self.config.password))
            .send()
            .await
            .map_err(|e| VaultError::Other(format!("WebDAV pull failed: {}", e)))?;

        if resp.status() == reqwest::StatusCode::NOT_FOUND {
            return Ok(None);
        }
        if !resp.status().is_success() {
            return Err(VaultError::Other(format!("WebDAV pull error: {}", resp.status())));
        }

        let data = resp.bytes().await.map_err(|e| VaultError::Other(e.to_string()))?;
        Ok(Some(data.to_vec()))
    }

    /// Test connection to WebDAV server
    pub async fn test_connection(&self) -> Result<bool, VaultError> {
        let url = self.config.server_url.trim_end_matches('/');
        let resp = self.client
            .request(reqwest::Method::from_bytes(b"PROPFIND").unwrap(), url)
            .basic_auth(&self.config.username, Some(&self.config.password))
            .header("Depth", "0")
            .send()
            .await
            .map_err(|e| VaultError::Other(format!("WebDAV connection test failed: {}", e)))?;

        Ok(resp.status().is_success() || resp.status() == reqwest::StatusCode::MULTI_STATUS)
    }

    /// List all documents in the vault path
    pub async fn list_docs(&self) -> Result<Vec<String>, VaultError> {
        let url = self.config.server_url.trim_end_matches('/').to_string()
            + "/" + self.config.vault_path.trim_start_matches('/');

        let resp = self.client
            .request(reqwest::Method::from_bytes(b"PROPFIND").unwrap(), &url)
            .basic_auth(&self.config.username, Some(&self.config.password))
            .header("Depth", "1")
            .send()
            .await
            .map_err(|e| VaultError::Other(format!("WebDAV list failed: {}", e)))?;

        if !resp.status().is_success() && resp.status() != reqwest::StatusCode::MULTI_STATUS {
            return Err(VaultError::Other(format!("WebDAV list error: {}", resp.status())));
        }

        let body = resp.text().await.map_err(|e| VaultError::Other(e.to_string()))?;

        // Simple XML parsing: extract href values that end with .bin
        let mut docs = Vec::new();
        for line in body.lines() {
            let trimmed = line.trim();
            if trimmed.contains("<d:href>") || trimmed.contains("<href>") {
                if let Some(start) = trimmed.find('>') {
                    if let Some(end) = trimmed.find("</") {
                        let href = &trimmed[start+1..end];
                        if href.ends_with(".bin") {
                            if let Some(name) = href.rsplit('/').next() {
                                docs.push(name.replace(".bin", ""));
                            }
                        }
                    }
                }
            }
        }
        Ok(docs)
    }
}

// ---- SyncBackend trait implementation ----

impl SyncBackend for WebDAVBackend {
    fn push_update(
        &self,
        doc_id: &str,
        encrypted_blob: &[u8],
        nonce: &[u8],
    ) -> Result<(), VaultError> {
        // Wire format: [8 bytes version (u64 BE)] + [2 bytes nonce_len (u16 BE)] + [nonce] + [encrypted_blob]
        let version = chrono::Utc::now().timestamp() as u64;
        let nonce_len = nonce.len() as u16;
        let mut payload = Vec::with_capacity(8 + 2 + nonce.len() + encrypted_blob.len());
        payload.extend_from_slice(&version.to_be_bytes());
        payload.extend_from_slice(&nonce_len.to_be_bytes());
        payload.extend_from_slice(nonce);
        payload.extend_from_slice(encrypted_blob);

        block_on_async(self.push_update(doc_id, &payload))
    }

    fn pull_updates(
        &self,
        doc_id: &str,
        since_version: u64,
    ) -> Result<Vec<EncryptedUpdate>, VaultError> {
        let data = block_on_async(self.pull_update(doc_id))?;

        match data {
            Some(payload) if payload.len() > 10 => {
                let version = u64::from_be_bytes(
                    payload[0..8]
                        .try_into()
                        .map_err(|_| VaultError::Other("Invalid WebDAV object format".into()))?,
                );
                let nonce_len = u16::from_be_bytes(
                    payload[8..10]
                        .try_into()
                        .map_err(|_| VaultError::Other("Invalid WebDAV object format".into()))?,
                ) as usize;

                if payload.len() < 10 + nonce_len {
                    return Err(VaultError::Other(
                        "Invalid WebDAV object format: truncated nonce".into(),
                    ));
                }

                if version <= since_version {
                    return Ok(Vec::new());
                }

                let nonce = &payload[10..10 + nonce_len];
                let encrypted_blob = &payload[10 + nonce_len..];

                Ok(vec![EncryptedUpdate {
                    doc_id: doc_id.to_string(),
                    encrypted_blob: BASE64.encode(encrypted_blob),
                    nonce: BASE64.encode(nonce),
                    version,
                    timestamp: version as i64,
                }])
            }
            Some(_) => Err(VaultError::Other(
                "Invalid WebDAV object format: too short".into(),
            )),
            None => Ok(Vec::new()),
        }
    }

    fn get_status(&self) -> Result<SyncStatusInfo, VaultError> {
        let connected = block_on_async(self.test_connection()).unwrap_or(false);
        Ok(SyncStatusInfo {
            connected,
            last_sync: 0,
            pending_count: 0,
            backend_type: "webdav".to_string(),
        })
    }

    fn test_connection(&self) -> Result<bool, VaultError> {
        block_on_async(self.test_connection())
    }
}

/// Run an async future synchronously, handling both inside-runtime and
/// outside-runtime contexts.
fn block_on_async<F: std::future::Future>(fut: F) -> F::Output {
    match tokio::runtime::Handle::try_current() {
        Ok(handle) => {
            tokio::task::block_in_place(|| handle.block_on(fut))
        }
        Err(_) => {
            let rt = tokio::runtime::Runtime::new().expect("Failed to create tokio runtime");
            rt.block_on(fut)
        }
    }
}
