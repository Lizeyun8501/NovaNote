//! S3-compatible object storage sync backend
//! Supports AWS S3, MinIO, Cloudflare R2, and other S3-compatible services.
//! Uses AWS Signature V4 for request signing.

use crate::{EncryptedUpdate, SyncBackend, SyncStatusInfo, VaultError};
use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use hmac::{Hmac, Mac};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

type HmacSha256 = Hmac<Sha256>;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct S3Config {
    pub endpoint: Option<String>, // Custom endpoint for MinIO/R2, None for AWS S3
    pub region: String,
    pub bucket: String,
    pub access_key: String,
    pub secret_key: String,
    pub vault_prefix: String, // Key prefix in the bucket
}

pub struct S3Backend {
    config: S3Config,
    client: reqwest::Client,
}

impl S3Backend {
    pub fn new(config: S3Config) -> Self {
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(30))
            .build()
            .expect("Failed to create HTTP client");
        Self { config, client }
    }

    /// Push an encrypted update to S3
    pub async fn push_update(
        &self,
        doc_id: &str,
        _version: u64,
        data: &[u8],
    ) -> Result<(), VaultError> {
        let key = self.build_key(doc_id);
        let url = self.build_url(&key);
        let body = data.to_vec();

        let mut headers = reqwest::header::HeaderMap::new();
        headers.insert(
            reqwest::header::CONTENT_TYPE,
            reqwest::header::HeaderValue::from_static("application/octet-stream"),
        );
        self.sign_request("PUT", &url, &mut headers, &body)?;

        let resp = self
            .client
            .put(&url)
            .headers(headers)
            .body(body)
            .send()
            .await
            .map_err(|e| VaultError::Other(format!("S3 push failed: {}", e)))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            return Err(VaultError::Other(format!(
                "S3 push error ({}): {}",
                status, body
            )));
        }

        Ok(())
    }

    /// Pull an update from S3
    pub async fn pull_update(&self, doc_id: &str) -> Result<Option<Vec<u8>>, VaultError> {
        let key = self.build_key(doc_id);
        let url = self.build_url(&key);

        let mut headers = reqwest::header::HeaderMap::new();
        self.sign_request("GET", &url, &mut headers, &[])?;

        let resp = self
            .client
            .get(&url)
            .headers(headers)
            .send()
            .await
            .map_err(|e| VaultError::Other(format!("S3 pull failed: {}", e)))?;

        if resp.status() == reqwest::StatusCode::NOT_FOUND {
            return Ok(None);
        }

        if !resp.status().is_success() {
            return Err(VaultError::Other(format!(
                "S3 pull error: {}",
                resp.status()
            )));
        }

        let data = resp
            .bytes()
            .await
            .map_err(|e| VaultError::Other(e.to_string()))?;
        Ok(Some(data.to_vec()))
    }

    /// Test connection to S3
    pub async fn test_connection(&self) -> Result<bool, VaultError> {
        let url = self.build_url("");

        let mut headers = reqwest::header::HeaderMap::new();
        self.sign_request("HEAD", &url, &mut headers, &[])?;

        let resp = self
            .client
            .head(&url)
            .headers(headers)
            .send()
            .await
            .map_err(|e| VaultError::Other(format!("S3 connection test failed: {}", e)))?;

        Ok(resp.status().is_success() || resp.status() == reqwest::StatusCode::FORBIDDEN)
    }

    /// List all document IDs in the vault prefix using ListObjectsV2
    pub async fn list_docs(&self) -> Result<Vec<String>, VaultError> {
        let prefix = format!("{}/", self.config.vault_prefix.trim_end_matches('/'));
        let url = self.build_list_url(&prefix);

        let mut headers = reqwest::header::HeaderMap::new();
        self.sign_request("GET", &url, &mut headers, &[])?;

        let resp = self
            .client
            .get(&url)
            .headers(headers)
            .send()
            .await
            .map_err(|e| VaultError::Other(format!("S3 list failed: {}", e)))?;

        if !resp.status().is_success() {
            return Err(VaultError::Other(format!(
                "S3 list error: {}",
                resp.status()
            )));
        }

        let body = resp
            .text()
            .await
            .map_err(|e| VaultError::Other(e.to_string()))?;

        // Parse ListObjectsV2 XML: extract <Key> elements
        let mut docs = Vec::new();
        for tag in extract_xml_tags(&body, "Key") {
            if tag.ends_with(".bin") {
                if let Some(name) = tag.rsplit('/').next() {
                    docs.push(name.replace(".bin", ""));
                }
            }
        }
        Ok(docs)
    }

    // ---- Internal helpers ----

    fn build_key(&self, doc_id: &str) -> String {
        format!(
            "{}/{}/{}.bin",
            self.config.vault_prefix.trim_end_matches('/'),
            &doc_id[..2.min(doc_id.len())],
            doc_id
        )
    }

    fn build_url(&self, key: &str) -> String {
        if let Some(endpoint) = &self.config.endpoint {
            format!(
                "{}/{}/{}",
                endpoint.trim_end_matches('/'),
                self.config.bucket,
                key
            )
        } else {
            format!(
                "https://{}.s3.{}.amazonaws.com/{}",
                self.config.bucket, self.config.region, key
            )
        }
    }

    fn build_list_url(&self, prefix: &str) -> String {
        let encoded_prefix = aws_uri_encode(prefix, true);
        if let Some(endpoint) = &self.config.endpoint {
            format!(
                "{}/{}?list-type=2&prefix={}",
                endpoint.trim_end_matches('/'),
                self.config.bucket,
                encoded_prefix
            )
        } else {
            format!(
                "https://{}.s3.{}.amazonaws.com/?list-type=2&prefix={}",
                self.config.bucket,
                self.config.region,
                encoded_prefix
            )
        }
    }

    /// Sign an HTTP request with AWS Signature V4
    fn sign_request(
        &self,
        method: &str,
        url: &str,
        headers: &mut reqwest::header::HeaderMap,
        body: &[u8],
    ) -> Result<(), VaultError> {
        let parsed = url::Url::parse(url).map_err(|e| VaultError::Other(format!("Invalid S3 URL: {}", e)))?;
        let host = parsed.host_str().ok_or_else(|| VaultError::Other("No host in S3 URL".into()))?;

        let now = chrono::Utc::now();
        let date_stamp = now.format("%Y%m%d").to_string();
        let amz_date = now.format("%Y%m%dT%H%M%SZ").to_string();

        // Add required headers for AWS V4 signing
        headers.insert("host", host.parse().map_err(|e| VaultError::Other(format!("Invalid host header: {}", e)))?);
        headers.insert("x-amz-date", amz_date.parse().map_err(|e| VaultError::Other(format!("Invalid date header: {}", e)))?);
        headers.insert(
            "x-amz-content-sha256",
            sha256_hex(body).parse().map_err(|e| VaultError::Other(format!("Invalid sha256 header: {}", e)))?,
        );

        // Build canonical headers list (sorted by lowercase header name)
        let mut canonical_headers: Vec<(String, String)> = Vec::new();
        for (key, value) in headers.iter() {
            let key_lower = key.as_str().to_lowercase();
            let value_str = value.to_str().unwrap_or("").to_string();
            // Collapse multiple whitespace into single space
            let value_str = value_str
                .split_whitespace()
                .collect::<Vec<_>>()
                .join(" ");
            canonical_headers.push((key_lower, value_str));
        }
        canonical_headers.sort_by(|a, b| a.0.cmp(&b.0));

        let signed_headers = canonical_headers
            .iter()
            .map(|(k, _)| k.as_str())
            .collect::<Vec<_>>()
            .join(";");

        let canonical_headers_str = canonical_headers
            .iter()
            .map(|(k, v)| format!("{}:{}", k, v))
            .collect::<Vec<_>>()
            .join("\n");

        // Canonical URI (URI-encoded, but preserve '/')
        let canonical_uri = canonical_uri_encode(parsed.path());

        // Canonical query string (sorted by key, then value)
        let canonical_query_string = {
            let mut params: Vec<(String, String)> = parsed
                .query_pairs()
                .map(|(k, v)| (k.to_string(), v.to_string()))
                .collect();
            params.sort_by(|a, b| a.0.cmp(&b.0).then_with(|| a.1.cmp(&b.1)));
            params
                .iter()
                .map(|(k, v)| {
                    format!(
                        "{}={}",
                        aws_uri_encode(k, true),
                        aws_uri_encode(v, true)
                    )
                })
                .collect::<Vec<_>>()
                .join("&")
        };

        // Payload hash
        let payload_hash = sha256_hex(body);

        // Canonical request
        let canonical_request = format!(
            "{}\n{}\n{}\n{}\n\n{}\n{}",
            method,
            canonical_uri,
            canonical_query_string,
            canonical_headers_str,
            signed_headers,
            payload_hash
        );

        // Credential scope
        let credential_scope = format!(
            "{}/{}/s3/aws4_request",
            date_stamp, self.config.region
        );

        // String to sign
        let string_to_sign = format!(
            "AWS4-HMAC-SHA256\n{}\n{}\n{}",
            amz_date,
            credential_scope,
            sha256_hex(canonical_request.as_bytes())
        );

        // Derive signing key
        let signing_key = derive_signing_key(
            &self.config.secret_key,
            &date_stamp,
            &self.config.region,
            "s3",
        )?;

        // Calculate signature
        let signature = {
            let mut mac =
                HmacSha256::new_from_slice(&signing_key).map_err(|e| VaultError::Other(format!("HMAC error: {}", e)))?;
            mac.update(string_to_sign.as_bytes());
            to_hex(&mac.finalize().into_bytes())
        };

        // Build Authorization header
        let auth_header = format!(
            "AWS4-HMAC-SHA256 Credential={}/{}, SignedHeaders={}, Signature={}",
            self.config.access_key, credential_scope, signed_headers, signature
        );

        headers.insert("Authorization", auth_header.parse().map_err(|e| VaultError::Other(format!("Invalid auth header: {}", e)))?);
        Ok(())
    }
}

// ---- SyncBackend trait implementation ----

impl SyncBackend for S3Backend {
    fn push_update(
        &self,
        doc_id: &str,
        encrypted_blob: &[u8],
        nonce: &[u8],
    ) -> Result<(), VaultError> {
        // Wire format: [8 bytes version (u64 BE)] + [2 bytes nonce_len (u16 BE)] + [nonce] + [encrypted_blob]
        let version = chrono::Utc::now().timestamp() as u64;
        let nonce_len = nonce.len() as u16;
        let mut payload =
            Vec::with_capacity(8 + 2 + nonce.len() + encrypted_blob.len());
        payload.extend_from_slice(&version.to_be_bytes());
        payload.extend_from_slice(&nonce_len.to_be_bytes());
        payload.extend_from_slice(nonce);
        payload.extend_from_slice(encrypted_blob);

        block_on_async(self.push_update(doc_id, 0, &payload))
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
                        .map_err(|_| VaultError::Other("Invalid S3 object format".into()))?,
                );
                let nonce_len = u16::from_be_bytes(
                    payload[8..10]
                        .try_into()
                        .map_err(|_| VaultError::Other("Invalid S3 object format".into()))?,
                ) as usize;

                if payload.len() < 10 + nonce_len {
                    return Err(VaultError::Other(
                        "Invalid S3 object format: truncated nonce".into(),
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
                "Invalid S3 object format: too short".into(),
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
            backend_type: "s3".to_string(),
        })
    }

    fn test_connection(&self) -> Result<bool, VaultError> {
        block_on_async(self.test_connection())
    }
}

// ---- AWS V4 signing helpers ----

/// Run an async future synchronously, handling both inside-runtime and
/// outside-runtime contexts.
fn block_on_async<F: std::future::Future>(fut: F) -> F::Output {
    match tokio::runtime::Handle::try_current() {
        Ok(handle) => {
            // Already inside a tokio runtime – use block_in_place to avoid
            // starving the executor.
            tokio::task::block_in_place(|| handle.block_on(fut))
        }
        Err(_) => {
            // Not inside a runtime – create a temporary one.
            let rt = tokio::runtime::Runtime::new()
                .expect("Failed to create tokio runtime — system resource exhaustion");
            rt.block_on(fut)
        }
    }
}

fn to_hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{:02x}", b)).collect()
}

fn sha256_hex(data: &[u8]) -> String {
    to_hex(&Sha256::digest(data))
}

fn hmac_sha256(key: &[u8], data: &[u8]) -> Result<Vec<u8>, VaultError> {
    let mut mac = HmacSha256::new_from_slice(key)
        .map_err(|e| VaultError::Other(format!("HMAC init error: {}", e)))?;
    mac.update(data);
    Ok(mac.finalize().into_bytes().to_vec())
}

fn derive_signing_key(
    secret_key: &str,
    date_stamp: &str,
    region: &str,
    service: &str,
) -> Result<Vec<u8>, VaultError> {
    let k_date = hmac_sha256(format!("AWS4{}", secret_key).as_bytes(), date_stamp.as_bytes())?;
    let k_region = hmac_sha256(&k_date, region.as_bytes())?;
    let k_service = hmac_sha256(&k_region, service.as_bytes())?;
    let k_signing = hmac_sha256(&k_service, b"aws4_request")?;
    Ok(k_signing)
}

/// URI-encode for AWS canonical URI. Preserves '/' characters.
fn canonical_uri_encode(s: &str) -> String {
    let mut result = String::with_capacity(s.len());
    for byte in s.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'.' | b'_' | b'~' | b'/' => {
                result.push(byte as char);
            }
            _ => {
                result.push_str(&format!("%{:02X}", byte));
            }
        }
    }
    result
}

/// URI-encode for AWS query-string values. When `encode_slash` is true, '/'
/// is also percent-encoded.
fn aws_uri_encode(s: &str, encode_slash: bool) -> String {
    let mut result = String::with_capacity(s.len());
    for byte in s.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'.' | b'_' | b'~' => {
                result.push(byte as char);
            }
            b'/' if !encode_slash => {
                result.push(byte as char);
            }
            _ => {
                result.push_str(&format!("%{:02X}", byte));
            }
        }
    }
    result
}

/// Naive XML tag extractor – finds all occurrences of `<tag>value</tag>`.
fn extract_xml_tags(xml: &str, tag: &str) -> Vec<String> {
    let open = format!("<{}>", tag);
    let close = format!("</{}>", tag);
    let mut results = Vec::new();
    let mut search_from = 0;
    while let Some(start) = xml[search_from..].find(&open) {
        let content_start = search_from + start + open.len();
        if let Some(end) = xml[content_start..].find(&close) {
            results.push(xml[content_start..content_start + end].to_string());
            search_from = content_start + end + close.len();
        } else {
            break;
        }
    }
    results
}
