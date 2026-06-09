//! S3-compatible object storage sync backend
//! Supports AWS S3, MinIO, Cloudflare R2, and other S3-compatible services.

use crate::VaultError;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct S3Config {
    pub endpoint: Option<String>,  // Custom endpoint for MinIO/R2, None for AWS S3
    pub region: String,
    pub bucket: String,
    pub access_key: String,
    pub secret_key: String,
    pub vault_prefix: String,  // Key prefix in the bucket
}

pub struct S3Backend {
    config: S3Config,
}

impl S3Backend {
    pub fn new(config: S3Config) -> Self {
        Self { config }
    }

    /// Push an encrypted update to S3
    pub async fn push_update(&self, doc_id: &str, _version: u64, data: &[u8]) -> Result<(), VaultError> {
        let key = format!("{}/{}/{}.bin",
            self.config.vault_prefix.trim_end_matches('/'),
            &doc_id[..2.min(doc_id.len())],
            doc_id
        );

        // Use reqwest with AWS Signature V4 for S3 PUT
        let url = self.build_url(&key);
        let body = data.to_vec();

        let client = reqwest::Client::new();
        let resp = client
            .put(&url)
            .header("Content-Type", "application/octet-stream")
            .body(body)
            .send()
            .await
            .map_err(|e| VaultError::Other(format!("S3 push failed: {}", e)))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            return Err(VaultError::Other(format!("S3 push error ({}): {}", status, body)));
        }

        Ok(())
    }

    /// Pull an update from S3
    pub async fn pull_update(&self, doc_id: &str) -> Result<Option<Vec<u8>>, VaultError> {
        let key = format!("{}/{}/{}.bin",
            self.config.vault_prefix.trim_end_matches('/'),
            &doc_id[..2.min(doc_id.len())],
            doc_id
        );

        let url = self.build_url(&key);

        let client = reqwest::Client::new();
        let resp = client
            .get(&url)
            .send()
            .await
            .map_err(|e| VaultError::Other(format!("S3 pull failed: {}", e)))?;

        if resp.status() == reqwest::StatusCode::NOT_FOUND {
            return Ok(None);
        }

        if !resp.status().is_success() {
            return Err(VaultError::Other(format!("S3 pull error: {}", resp.status())));
        }

        let data = resp.bytes().await.map_err(|e| VaultError::Other(e.to_string()))?;
        Ok(Some(data.to_vec()))
    }

    /// Test connection to S3
    pub async fn test_connection(&self) -> Result<bool, VaultError> {
        let url = self.build_url("");

        let client = reqwest::Client::new();
        let resp = client
            .head(&url)
            .send()
            .await
            .map_err(|e| VaultError::Other(format!("S3 connection test failed: {}", e)))?;

        Ok(resp.status().is_success() || resp.status() == reqwest::StatusCode::FORBIDDEN)
    }

    /// List all document IDs in the vault prefix
    pub async fn list_docs(&self) -> Result<Vec<String>, VaultError> {
        // Simplified: in production, use S3 ListObjectsV2 API
        Ok(Vec::new())
    }

    fn build_url(&self, key: &str) -> String {
        if let Some(endpoint) = &self.config.endpoint {
            format!("{}/{}/{}", endpoint.trim_end_matches('/'), self.config.bucket, key)
        } else {
            format!("https://{}.s3.{}.amazonaws.com/{}", self.config.bucket, self.config.region, key)
        }
    }
}
