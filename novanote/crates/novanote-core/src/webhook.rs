//! Webhook integration for NovaNote
//! Allows users to configure HTTP callbacks that fire on vault events.

use crate::VaultError;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WebhookConfig {
    pub id: String,
    pub url: String,
    pub events: Vec<String>,  // e.g. ["note.created", "note.updated", "note.deleted"]
    pub secret: String,       // HMAC secret for payload signing
    pub enabled: bool,
    pub headers: HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WebhookPayload {
    pub event: String,
    pub vault_id: String,
    pub timestamp: i64,
    pub data: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WebhookDelivery {
    pub id: String,
    pub webhook_id: String,
    pub event: String,
    pub status_code: u16,
    pub success: bool,
    pub timestamp: i64,
    pub response_body: Option<String>,
    pub error: Option<String>,
}

/// Webhook manager
pub struct WebhookManager {
    webhooks: Vec<WebhookConfig>,
    delivery_history: Vec<WebhookDelivery>,
}

impl WebhookManager {
    pub fn new() -> Self {
        Self {
            webhooks: Vec::new(),
            delivery_history: Vec::new(),
        }
    }

    /// Add a webhook configuration
    pub fn add_webhook(&mut self, config: WebhookConfig) {
        self.webhooks.push(config);
    }

    /// Remove a webhook by ID
    pub fn remove_webhook(&mut self, id: &str) {
        self.webhooks.retain(|w| w.id != id);
    }

    /// List all webhooks
    pub fn list_webhooks(&self) -> &[WebhookConfig] {
        &self.webhooks
    }

    /// Fire an event to all matching webhooks
    pub async fn fire_event(&mut self, event: &str, vault_id: &str, data: serde_json::Value) -> Vec<WebhookDelivery> {
        let mut deliveries = Vec::new();
        let timestamp = chrono::Utc::now().timestamp();

        let payload = WebhookPayload {
            event: event.to_string(),
            vault_id: vault_id.to_string(),
            timestamp,
            data,
        };

        for webhook in &self.webhooks {
            if !webhook.enabled {
                continue;
            }
            if !webhook.events.iter().any(|e| e == event || e == "*") {
                continue;
            }

            let delivery = self.deliver(webhook, &payload).await;
            deliveries.push(delivery);
        }

        // Keep last 100 deliveries
        self.delivery_history.extend(deliveries.clone());
        if self.delivery_history.len() > 100 {
            self.delivery_history.drain(0..self.delivery_history.len() - 100);
        }

        deliveries
    }

    async fn deliver(&self, webhook: &WebhookConfig, payload: &WebhookPayload) -> WebhookDelivery {
        let id = uuid::Uuid::new_v4().to_string();
        let timestamp = chrono::Utc::now().timestamp();

        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(10))
            .build();

        let delivery = match client {
            Ok(client) => {
                let mut builder = client.post(&webhook.url)
                    .json(payload);

                // Add custom headers
                for (key, value) in &webhook.headers {
                    builder = builder.header(key.as_str(), value.as_str());
                }

                // Add HMAC signature header
                let payload_bytes = serde_json::to_vec(payload).unwrap_or_default();
                let signature = compute_hmac(&webhook.secret, &payload_bytes);
                builder = builder.header("X-NovaNote-Signature", format!("sha256={}", signature));

                match builder.send().await {
                    Ok(resp) => {
                        let status = resp.status().as_u16();
                        let body = resp.text().await.ok();
                        WebhookDelivery {
                            id,
                            webhook_id: webhook.id.clone(),
                            event: payload.event.clone(),
                            status_code: status,
                            success: status >= 200 && status < 300,
                            timestamp,
                            response_body: body,
                            error: None,
                        }
                    }
                    Err(e) => WebhookDelivery {
                        id,
                        webhook_id: webhook.id.clone(),
                        event: payload.event.clone(),
                        status_code: 0,
                        success: false,
                        timestamp,
                        response_body: None,
                        error: Some(e.to_string()),
                    },
                }
            }
            Err(e) => WebhookDelivery {
                id,
                webhook_id: webhook.id.clone(),
                event: payload.event.clone(),
                status_code: 0,
                success: false,
                timestamp,
                response_body: None,
                error: Some(format!("Failed to create HTTP client: {}", e)),
            },
        };

        delivery
    }

    /// Get delivery history
    pub fn get_delivery_history(&self) -> &[WebhookDelivery] {
        &self.delivery_history
    }

    /// Load webhooks from a JSON file
    pub fn load_from_file(path: &std::path::Path) -> Result<Self, VaultError> {
        let content = std::fs::read_to_string(path)?;
        let webhooks: Vec<WebhookConfig> = serde_json::from_str(&content)?;
        Ok(Self {
            webhooks,
            delivery_history: Vec::new(),
        })
    }

    /// Save webhooks to a JSON file
    pub fn save_to_file(&self, path: &std::path::Path) -> Result<(), VaultError> {
        let content = serde_json::to_string_pretty(&self.webhooks)?;
        std::fs::write(path, content)?;
        Ok(())
    }
}

/// Compute HMAC-SHA256 for webhook payload signing
fn compute_hmac(secret: &str, payload: &[u8]) -> String {
    use std::fmt::Write;
    use hmac::{Hmac, Mac};
    use sha2::Sha256;

    type HmacSha256 = Hmac<Sha256>;

    let mut mac = HmacSha256::new_from_slice(secret.as_bytes())
        .expect("HMAC can take key of any size");
    mac.update(payload);
    let result = mac.finalize();
    let code_bytes = result.into_bytes();
    code_bytes.iter().fold(String::new(), |mut output, b| {
        write!(output, "{:02x}", b).unwrap();
        output
    })
}
