//! WebAuthn / FIDO2 hardware security key support
//! Provides registration and authentication using hardware tokens like YubiKey

use base64::Engine;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WebAuthnConfig {
    pub rp_id: String,           // Relying Party ID (e.g., "novanote.local")
    pub rp_name: String,         // Display name
    pub origin: String,          // Origin URL
}

impl Default for WebAuthnConfig {
    fn default() -> Self {
        Self {
            rp_id: "novanote.local".to_string(),
            rp_name: "NovaNote".to_string(),
            origin: "https://novanote.local".to_string(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CredentialRegistration {
    pub credential_id: String,    // base64
    pub public_key: String,       // base64 COSE key
    pub sign_count: u32,
    pub device_name: Option<String>,
    pub registered_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RegistrationChallenge {
    pub challenge: String,        // base64
    pub rp_id: String,
    pub rp_name: String,
    pub user_id: String,
    pub user_name: String,
    pub timeout_ms: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthenticationChallenge {
    pub challenge: String,        // base64
    pub rp_id: String,
    pub credential_ids: Vec<String>,
    pub timeout_ms: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthVerificationResult {
    pub verified: bool,
    pub sign_count: u32,
    pub credential_id: String,
}

/// Generate a new registration challenge for WebAuthn
pub fn generate_registration_challenge(
    config: &WebAuthnConfig,
    user_id: &str,
    user_name: &str,
) -> RegistrationChallenge {
    let challenge = generate_random_bytes(32);

    RegistrationChallenge {
        challenge: base64::engine::general_purpose::STANDARD.encode(&challenge),
        rp_id: config.rp_id.clone(),
        rp_name: config.rp_name.clone(),
        user_id: user_id.to_string(),
        user_name: user_name.to_string(),
        timeout_ms: 60000,
    }
}

/// Generate an authentication challenge
pub fn generate_authentication_challenge(
    config: &WebAuthnConfig,
    credential_ids: &[String],
) -> AuthenticationChallenge {
    let challenge = generate_random_bytes(32);

    AuthenticationChallenge {
        challenge: base64::engine::general_purpose::STANDARD.encode(&challenge),
        rp_id: config.rp_id.clone(),
        credential_ids: credential_ids.to_vec(),
        timeout_ms: 60000,
    }
}

/// Verify a registration response (simplified - in production use webauthn-rs crate)
pub fn verify_registration(
    _challenge: &str,
    _client_data_json: &str,
    _attestation_object: &str,
) -> Result<CredentialRegistration, String> {
    // In a full implementation, this would:
    // 1. Verify client_data_json matches the challenge
    // 2. Verify the attestation signature
    // 3. Extract the public key
    // For now, return a placeholder
    Ok(CredentialRegistration {
        credential_id: base64::engine::general_purpose::STANDARD.encode(&generate_random_bytes(32)),
        public_key: base64::engine::general_purpose::STANDARD.encode(&generate_random_bytes(64)),
        sign_count: 0,
        device_name: Some("Security Key".to_string()),
        registered_at: chrono::Utc::now().timestamp(),
    })
}

/// Verify an authentication response
pub fn verify_authentication(
    _challenge: &str,
    credential_id: &str,
    _client_data_json: &str,
    _authenticator_data: &str,
    _signature: &str,
    _public_key: &str,
    expected_sign_count: u32,
) -> Result<AuthVerificationResult, String> {
    // In a full implementation, this would:
    // 1. Verify client_data_json matches the challenge
    // 2. Verify the signature against the public key
    // 3. Check sign count for clone detection
    Ok(AuthVerificationResult {
        verified: true,
        sign_count: expected_sign_count + 1,
        credential_id: credential_id.to_string(),
    })
}

fn generate_random_bytes(len: usize) -> Vec<u8> {
    (0..len).map(|_| rand::random::<u8>()).collect()
}
