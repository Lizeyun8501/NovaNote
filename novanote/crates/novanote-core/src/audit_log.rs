//! Audit log module
//! Records all vault operations for security compliance and debugging.

use crate::VaultError;
use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuditEntry {
    pub id: String,
    pub timestamp: i64,
    pub action: String,
    pub resource_type: String,
    pub resource_path: String,
    pub details: serde_json::Value,
    pub user_agent: Option<String>,
    pub session_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuditLogConfig {
    pub enabled: bool,
    pub max_entries: usize,
    pub log_file: Option<String>,
}

impl Default for AuditLogConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            max_entries: 10000,
            log_file: None,
        }
    }
}

pub struct AuditLog {
    entries: Vec<AuditEntry>,
    config: AuditLogConfig,
}

impl AuditLog {
    pub fn new(config: AuditLogConfig) -> Self {
        Self {
            entries: Vec::new(),
            config,
        }
    }

    /// Log an audit event
    pub fn log(
        &mut self,
        action: &str,
        resource_type: &str,
        resource_path: &str,
        details: serde_json::Value,
    ) {
        if !self.config.enabled {
            return;
        }

        let entry = AuditEntry {
            id: uuid::Uuid::new_v4().to_string(),
            timestamp: chrono::Utc::now().timestamp_millis(),
            action: action.to_string(),
            resource_type: resource_type.to_string(),
            resource_path: resource_path.to_string(),
            details,
            user_agent: None,
            session_id: None,
        };

        self.entries.push(entry);

        // Trim to max entries
        if self.entries.len() > self.config.max_entries {
            self.entries.drain(0..self.entries.len() - self.config.max_entries);
        }

        // Append to log file if configured
        if let Some(ref log_file) = self.config.log_file {
            if let Ok(mut file) = std::fs::OpenOptions::new()
                .create(true)
                .append(true)
                .open(log_file)
            {
                let json = serde_json::to_string(&self.entries.last()).unwrap_or_default();
                let _ = std::io::Write::write_all(&mut file, format!("{}\n", json).as_bytes());
            }
        }
    }

    /// Get all audit entries
    pub fn get_entries(&self) -> &[AuditEntry] {
        &self.entries
    }

    /// Get entries filtered by action
    pub fn get_entries_by_action(&self, action: &str) -> Vec<&AuditEntry> {
        self.entries.iter().filter(|e| e.action == action).collect()
    }

    /// Get entries filtered by resource path
    pub fn get_entries_by_resource(&self, path: &str) -> Vec<&AuditEntry> {
        self.entries.iter().filter(|e| e.resource_path == path).collect()
    }

    /// Get entries since a timestamp
    pub fn get_entries_since(&self, since: i64) -> Vec<&AuditEntry> {
        self.entries.iter().filter(|e| e.timestamp >= since).collect()
    }

    /// Clear all entries
    pub fn clear(&mut self) {
        self.entries.clear();
    }

    /// Load entries from a log file
    pub fn load_from_file(path: &Path) -> Result<Self, VaultError> {
        let content = std::fs::read_to_string(path)?;
        let entries: Vec<AuditEntry> = content
            .lines()
            .filter(|l| !l.trim().is_empty())
            .filter_map(|l| serde_json::from_str(l).ok())
            .collect();

        Ok(Self {
            entries,
            config: AuditLogConfig::default(),
        })
    }
}
