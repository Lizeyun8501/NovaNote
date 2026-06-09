use argon2::Argon2;
use chacha20poly1305::{
    XChaCha20Poly1305,
    aead::{Aead, AeadCore, KeyInit, OsRng},
    XNonce,
};
use rand::RngCore;
use zeroize::Zeroizing;

/// Derive a 256-bit master key from password and salt using Argon2id
pub fn derive_key(password: &str, salt: Option<&[u8]>) -> (Zeroizing<[u8; 32]>, [u8; 32]) {
    let actual_salt: [u8; 32] = if let Some(s) = salt {
        let mut arr = [0u8; 32];
        arr.copy_from_slice(&s[..32.min(s.len())]);
        arr
    } else {
        let mut arr = [0u8; 32];
        rand::thread_rng().fill_bytes(&mut arr);
        arr
    };
    
    let mut key = Zeroizing::new([0u8; 32]);
    let params = argon2::ParamsBuilder::new()
        .m_cost(65536)  // 64MB memory cost
        .t_cost(3)      // 3 iterations
        .p_cost(4)      // 4 parallelism
        .output_len(32)
        .build()
        .expect("Argon2 params");
    
    let argon2 = Argon2::new(argon2::Algorithm::Argon2id, argon2::Version::V0x13, params);
    argon2.hash_password_into(password.as_bytes(), &actual_salt, key.as_mut())
        .expect("Argon2 key derivation");
    
    (key, actual_salt)
}

/// Encrypt plaintext using XChaCha20-Poly1305
/// Returns (ciphertext_bytes, nonce_bytes) both as Vec<u8>
pub fn encrypt(plaintext: &[u8], key: &[u8; 32]) -> (Vec<u8>, Vec<u8>) {
    let cipher = XChaCha20Poly1305::new_from_slice(key).expect("Invalid key length");
    let nonce = XChaCha20Poly1305::generate_nonce(&mut OsRng);
    let ciphertext = cipher.encrypt(&nonce, plaintext).expect("Encryption failed");
    (ciphertext, nonce.to_vec())
}

/// String convenience: encrypt a string, returns (base64_ciphertext, base64_nonce)
pub fn encrypt_string(plaintext: &str, key: &[u8; 32]) -> (String, String) {
    let (ciphertext, nonce) = encrypt(plaintext.as_bytes(), key);
    use base64::{Engine as _, engine::general_purpose::STANDARD as B64};
    (B64.encode(&ciphertext), B64.encode(&nonce))
}

/// Decrypt ciphertext using XChaCha20-Poly1305
/// Returns plaintext bytes or error
pub fn decrypt(ciphertext: &[u8], nonce: &[u8], key: &[u8; 32]) -> Result<Vec<u8>, String> {
    let cipher = XChaCha20Poly1305::new_from_slice(key).map_err(|e| format!("Invalid key: {}", e))?;
    let nonce = XNonce::from_slice(nonce);
    cipher.decrypt(nonce, ciphertext).map_err(|e| format!("Decryption failed: {}", e))
}

/// String convenience: decrypt from base64 strings
pub fn decrypt_string(ciphertext_b64: &str, nonce_b64: &str, key: &[u8; 32]) -> Result<String, String> {
    use base64::{Engine as _, engine::general_purpose::STANDARD as B64};
    let ciphertext = B64.decode(ciphertext_b64).map_err(|e| format!("Invalid base64 ciphertext: {}", e))?;
    let nonce = B64.decode(nonce_b64).map_err(|e| format!("Invalid base64 nonce: {}", e))?;
    let plaintext = decrypt(&ciphertext, &nonce, key)?;
    String::from_utf8(plaintext).map_err(|e| format!("Invalid UTF-8: {}", e))
}

/// Generate a random 256-bit key (for vault encryption if no password)
pub fn generate_random_key() -> [u8; 32] {
    let mut key = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut key);
    key
}

/// Encrypted payload for serialization
#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct EncryptedPayload {
    pub ciphertext: String,  // base64
    pub nonce: String,       // base64
    pub salt: String,        // base64 key derivation salt
    pub algorithm: String,   // "xchacha20-poly1305-ietf"
}

impl EncryptedPayload {
    /// Encrypt data and create payload
    pub fn encrypt(plaintext: &[u8], password: &str, existing_salt: Option<&[u8]>) -> Self {
        let (key, salt) = derive_key(password, existing_salt);
        let (ciphertext, nonce) = encrypt(plaintext, &key);
        use base64::{Engine as _, engine::general_purpose::STANDARD as B64};
        EncryptedPayload {
            ciphertext: B64.encode(&ciphertext),
            nonce: B64.encode(&nonce),
            salt: B64.encode(&salt),
            algorithm: "xchacha20-poly1305-ietf".to_string(),
        }
    }

    /// Decrypt payload
    pub fn decrypt(&self, password: &str) -> Result<Vec<u8>, String> {
        use base64::{Engine as _, engine::general_purpose::STANDARD as B64};
        let salt = B64.decode(&self.salt).map_err(|e| format!("Invalid salt: {}", e))?;
        let (key, _) = derive_key(password, Some(&salt));
        let ciphertext = B64.decode(&self.ciphertext).map_err(|e| format!("Invalid ciphertext: {}", e))?;
        let nonce = B64.decode(&self.nonce).map_err(|e| format!("Invalid nonce: {}", e))?;
        decrypt(&ciphertext, &nonce, &key)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_derive_key_deterministic() {
        let (key1, salt) = derive_key("test-password", None);
        let (key2, _) = derive_key("test-password", Some(&salt));
        assert_eq!(key1.as_slice(), key2.as_slice());
    }

    #[test]
    fn test_encrypt_decrypt_roundtrip() {
        let key = generate_random_key();
        let plaintext = b"Hello, encrypted world! This is a secret message.";
        let (ciphertext, nonce) = encrypt(plaintext, &key);
        let decrypted = decrypt(&ciphertext, &nonce, &key).unwrap();
        assert_eq!(decrypted, plaintext);
    }

    #[test]
    fn test_encrypt_decrypt_wrong_key() {
        let key1 = generate_random_key();
        let key2 = generate_random_key();
        let plaintext = b"secret";
        let (ciphertext, nonce) = encrypt(plaintext, &key1);
        let result = decrypt(&ciphertext, &nonce, &key2);
        assert!(result.is_err());
    }

    #[test]
    fn test_encrypt_decrypt_string() {
        let key = generate_random_key();
        let text = "你好，世界！This is a test with Unicode and special chars: !@#$%^&*()";
        let (b64_ct, b64_nonce) = encrypt_string(text, &key);
        let decrypted = decrypt_string(&b64_ct, &b64_nonce, &key).unwrap();
        assert_eq!(decrypted, text);
    }

    #[test]
    fn test_encrypted_payload_full_workflow() {
        let data = b"{\"title\": \"My Note\", \"content\": \"Secret content\"}";
        let payload = EncryptedPayload::encrypt(data, "strong-password-123", None);
        
        // Verify algorithm
        assert_eq!(payload.algorithm, "xchacha20-poly1305-ietf");
        
        // Decrypt
        let decrypted = payload.decrypt("strong-password-123").unwrap();
        assert_eq!(decrypted, data);
        
        // Wrong password
        let result = payload.decrypt("wrong-password");
        assert!(result.is_err());
    }

    #[test]
    fn test_different_salts_produce_different_keys() {
        let (key1, salt1) = derive_key("same-password", None);
        let (key2, salt2) = derive_key("same-password", None);
        assert!(salt1 != salt2, "Same password with different salts should produce different keys");
        // Keys should be different too
        assert!(key1.as_slice() != key2.as_slice());
    }

    #[test]
    fn test_ciphertext_is_different_each_time() {
        let key = generate_random_key();
        let plaintext = b"same plaintext";
        let (ct1, _) = encrypt(plaintext, &key);
        let (ct2, _) = encrypt(plaintext, &key);
        assert!(ct1 != ct2, "Same plaintext should produce different ciphertext (different nonces)");
    }
}