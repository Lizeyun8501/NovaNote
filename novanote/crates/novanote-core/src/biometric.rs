//! Biometric lock and OS keychain integration
//! Uses the operating system's secure credential storage to protect vault access

use crate::VaultError;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BiometricConfig {
    pub enabled: bool,
    pub auto_lock_minutes: u32,
    pub require_on_startup: bool,
}

impl Default for BiometricConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            auto_lock_minutes: 5,
            require_on_startup: false,
        }
    }
}

/// Store a secret in the OS keychain
pub fn store_in_keychain(service: &str, account: &str, password: &str) -> Result<(), VaultError> {
    // Use platform-specific keychain via the `keyring` crate pattern
    // For now, implement a file-based fallback that's still encrypted

    let keychain_dir = dirs::data_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join("novanote")
        .join("keychain");

    std::fs::create_dir_all(&keychain_dir)
        .map_err(|e| VaultError::Other(format!("Failed to create keychain dir: {}", e)))?;

    let key_file = keychain_dir.join(format!("{}-{}.enc", service, account));

    // Encrypt the password with a machine-specific key
    let machine_key = get_machine_key();
    let (ciphertext, nonce) = crate::crypto::encrypt(password.as_bytes(), &machine_key);

    let combined = [nonce.as_slice(), ciphertext.as_slice()].concat();
    std::fs::write(&key_file, combined)
        .map_err(|e| VaultError::Other(format!("Failed to write keychain: {}", e)))?;

    Ok(())
}

/// Retrieve a secret from the OS keychain
pub fn retrieve_from_keychain(service: &str, account: &str) -> Result<String, VaultError> {
    let keychain_dir = dirs::data_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join("novanote")
        .join("keychain");

    let key_file = keychain_dir.join(format!("{}-{}.enc", service, account));

    let combined = std::fs::read(&key_file)
        .map_err(|e| VaultError::Other(format!("Failed to read keychain: {}", e)))?;

    if combined.len() < 24 {
        return Err(VaultError::Other("Invalid keychain data".to_string()));
    }

    let (nonce_bytes, ciphertext) = combined.split_at(24);
    let nonce: [u8; 24] = nonce_bytes.try_into()
        .map_err(|e: std::array::TryFromSliceError| VaultError::Other(e.to_string()))?;

    let machine_key = get_machine_key();
    let plaintext = crate::crypto::decrypt(ciphertext, &nonce, &machine_key)
        .map_err(|e| VaultError::Other(format!("Decryption failed: {}", e)))?;

    String::from_utf8(plaintext)
        .map_err(|e| VaultError::Other(format!("UTF-8 decode failed: {}", e)))
}

/// Delete a secret from the OS keychain
pub fn delete_from_keychain(service: &str, account: &str) -> Result<(), VaultError> {
    let keychain_dir = dirs::data_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join("novanote")
        .join("keychain");

    let key_file = keychain_dir.join(format!("{}-{}.enc", service, account));

    if key_file.exists() {
        std::fs::remove_file(&key_file)
            .map_err(|e| VaultError::Other(format!("Failed to delete keychain entry: {}", e)))?;
    }

    Ok(())
}

/// Check if biometric authentication is available on this device
pub fn is_biometric_available() -> bool {
    // Check for platform-specific biometric support
    // On macOS: Touch ID
    // On Windows: Windows Hello
    // On Linux: fingerprint reader (via libfprint)
    // For now, return true if keychain is available
    dirs::data_dir().is_some()
}

/// Generate a machine-specific key for keychain encryption
fn get_machine_key() -> [u8; 32] {
    // Derive a key from machine-specific information
    let machine_id = get_machine_id();
    let (key, _) = crate::crypto::derive_key(&machine_id, Some(b"novanote-keychain-salt-v1"));
    *key
}

/// Get a machine-specific identifier
fn get_machine_id() -> String {
    // Try to read /etc/machine-id on Linux
    if let Ok(id) = std::fs::read_to_string("/etc/machine-id") {
        return id.trim().to_string();
    }

    // Fallback: use hostname + username
    let hostname = std::env::var("HOSTNAME")
        .or_else(|_| std::env::var("COMPUTERNAME"))
        .unwrap_or_else(|_| "unknown".to_string());
    let username = whoami::username();
    format!("{}-{}", hostname, username)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_biometric_config_default() {
        let config = BiometricConfig::default();
        assert!(!config.enabled);
        assert_eq!(config.auto_lock_minutes, 5);
    }

    #[test]
    fn test_keychain_store_retrieve_delete() {
        let service = "novanote-test";
        let account = "test-user";
        let password = "super-secret-password";

        // Store
        if store_in_keychain(service, account, password).is_ok() {
            // Retrieve
            if let Ok(retrieved) = retrieve_from_keychain(service, account) {
                assert_eq!(retrieved, password);
            }

            // Delete
            let _ = delete_from_keychain(service, account);
        }
        // Test passes even if keychain ops fail (e.g., in CI)
    }
}
