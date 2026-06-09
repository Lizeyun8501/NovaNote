//! Metadata encryption module
//! When E2EE is enabled, encrypts sensitive metadata (tags, link texts, titles)
//! stored in SQLite so the database file alone reveals nothing about content.

use crate::crypto::{encrypt, decrypt, derive_key};
use base64::Engine;

/// Metadata encryption wrapper
pub struct MetaCrypto {
    /// Derived key for metadata encryption (separate from sync key)
    key: [u8; 32],
}

impl MetaCrypto {
    /// Create a new MetaCrypto from a master password and vault ID (salt)
    pub fn new(master_password: &str, vault_id: &str) -> Self {
        // Ensure the salt is at least 32 bytes by padding if needed
        let vault_bytes = vault_id.as_bytes();
        let mut salt = [0u8; 32];
        if vault_bytes.len() >= 32 {
            salt.copy_from_slice(&vault_bytes[..32]);
        } else {
            salt[..vault_bytes.len()].copy_from_slice(vault_bytes);
            // Fill remaining with repeated vault_id bytes
            let mut i = vault_bytes.len();
            while i < 32 {
                let chunk = vault_bytes[..vault_bytes.len().min(32 - i)].len();
                salt[i..i + chunk].copy_from_slice(&vault_bytes[..chunk]);
                i += chunk;
            }
        }
        let (key, _salt) = derive_key(master_password, Some(&salt));
        let key: [u8; 32] = *key;
        Self { key }
    }

    /// Create from an existing key
    pub fn from_key(key: [u8; 32]) -> Self {
        Self { key }
    }

    /// Encrypt a string value, returning base64-encoded ciphertext
    pub fn encrypt_value(&self, plaintext: &str) -> Result<String, String> {
        let (ciphertext, nonce) = encrypt(plaintext.as_bytes(), &self.key);
        let combined = [nonce.as_slice(), ciphertext.as_slice()].concat();
        Ok(base64::engine::general_purpose::STANDARD.encode(&combined))
    }

    /// Decrypt a base64-encoded encrypted value
    pub fn decrypt_value(&self, encrypted: &str) -> Result<String, String> {
        let combined = base64::engine::general_purpose::STANDARD
            .decode(encrypted)
            .map_err(|e| format!("Base64 decode failed: {}", e))?;
        if combined.len() < 24 {
            return Err("Invalid encrypted data: too short".to_string());
        }
        let (nonce_bytes, ciphertext) = combined.split_at(24);
        let nonce: [u8; 24] = nonce_bytes.try_into()
            .map_err(|e: std::array::TryFromSliceError| format!("Invalid nonce: {}", e))?;
        let plaintext = decrypt(ciphertext, &nonce, &self.key)
            .map_err(|e| format!("Decryption failed: {}", e))?;
        String::from_utf8(plaintext).map_err(|e| format!("UTF-8 decode failed: {}", e))
    }

    /// Encrypt a list of tags into a single encrypted blob
    pub fn encrypt_tags(&self, tags: &[String]) -> Result<String, String> {
        let json = serde_json::to_string(tags).map_err(|e| e.to_string())?;
        self.encrypt_value(&json)
    }

    /// Decrypt an encrypted tags blob back to a list
    pub fn decrypt_tags(&self, encrypted: &str) -> Result<Vec<String>, String> {
        let json = self.decrypt_value(encrypted)?;
        serde_json::from_str(&json).map_err(|e| e.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_encrypt_decrypt_roundtrip() {
        let crypto = MetaCrypto::new("test-password", "vault-123");
        let encrypted = crypto.encrypt_value("Hello World").unwrap();
        let decrypted = crypto.decrypt_value(&encrypted).unwrap();
        assert_eq!(decrypted, "Hello World");
    }

    #[test]
    fn test_encrypt_decrypt_tags() {
        let crypto = MetaCrypto::new("test-password", "vault-456");
        let tags = vec!["rust".to_string(), "programming".to_string(), "tutorial".to_string()];
        let encrypted = crypto.encrypt_tags(&tags).unwrap();
        let decrypted = crypto.decrypt_tags(&encrypted).unwrap();
        assert_eq!(decrypted, tags);
    }

    #[test]
    fn test_different_passwords_fail() {
        let crypto1 = MetaCrypto::new("password1", "vault-789");
        let crypto2 = MetaCrypto::new("password2", "vault-789");
        let encrypted = crypto1.encrypt_value("secret").unwrap();
        assert!(crypto2.decrypt_value(&encrypted).is_err());
    }
}
