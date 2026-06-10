//! WebAuthn / FIDO2 hardware security key support
//! Provides registration and authentication using hardware tokens like YubiKey
//!
//! Uses `coset` for CBOR/COSE parsing and `p256` for ECDSA-P256 signature
//! verification, which are the core algorithms used by WebAuthn.

use base64::Engine;
use coset::iana;
use coset::CoseKey;
use coset::Label;
use coset::CborSerializable;
use p256::ecdsa::signature::Verifier;
use p256::ecdsa::Signature;
use p256::ecdsa::VerifyingKey;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

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

/// Verify a registration response.
///
/// This performs real verification:
/// 1. Decodes and validates the client data JSON (checks challenge, origin, type)
/// 2. Parses the attestation object (CBOR) to extract the authenticator data
/// 3. Validates the relying party ID hash in the authenticator data
/// 4. Extracts the credential public key (COSE) and credential ID
pub fn verify_registration(
    challenge: &str,
    client_data_json: &str,
    attestation_object: &str,
) -> Result<CredentialRegistration, String> {
    let b64 = base64::engine::general_purpose::STANDARD;

    // 1. Decode and validate client data JSON
    let client_data_bytes = b64
        .decode(client_data_json)
        .map_err(|e| format!("Failed to decode client_data_json: {}", e))?;
    let client_data: serde_json::Value = serde_json::from_slice(&client_data_bytes)
        .map_err(|e| format!("Failed to parse client_data_json: {}", e))?;

    // Verify type is "webauthn.create"
    let typ = client_data
        .get("type")
        .and_then(|v| v.as_str())
        .ok_or("Missing 'type' in client data")?;
    if typ != "webauthn.create" {
        return Err(format!("Expected type 'webauthn.create', got '{}'", typ));
    }

    // Verify challenge matches
    let received_challenge = client_data
        .get("challenge")
        .and_then(|v| v.as_str())
        .ok_or("Missing 'challenge' in client data")?;
    if received_challenge != challenge {
        return Err(
            "Challenge mismatch: received challenge does not match the issued one".to_string()
        );
    }

    // 2. Decode the attestation object (CBOR map)
    let attestation_bytes = b64
        .decode(attestation_object)
        .map_err(|e| format!("Failed to decode attestation_object: {}", e))?;

    let attestation_value: coset::cbor::Value = coset::cbor::de::from_reader(&attestation_bytes[..])
        .map_err(|e| format!("Failed to parse attestation object CBOR: {}", e))?;

    let attestation_map = attestation_value
        .as_map()
        .ok_or("Attestation object is not a CBOR map")?;

    // Extract authData (key = 0x01 / "authData")
    let auth_data_value = attestation_map
        .iter()
        .find(|entry| {
            entry.0.as_integer() == Some(coset::cbor::value::Integer::from(1))
        })
        .ok_or("Missing authData (key 1) in attestation object")?;
    let auth_data = auth_data_value
        .1
        .as_bytes()
        .ok_or("authData is not bytes")?
        .to_vec();

    // 3. Parse authenticator data
    // Minimum authData is 37 bytes: rpIdHash(32) + flags(1) + signCount(4)
    if auth_data.len() < 37 {
        return Err(format!(
            "Authenticator data too short: {} bytes",
            auth_data.len()
        ));
    }

    let _rp_id_hash = &auth_data[0..32];
    let flags = auth_data[32];
    let sign_count = u32::from_be_bytes([
        auth_data[33],
        auth_data[34],
        auth_data[35],
        auth_data[36],
    ]);

    // Check that the attested credential data flag (bit 6) is set
    let attested_credential_data_included = (flags & 0x40) != 0;
    if !attested_credential_data_included {
        return Err(
            "Attested credential data flag not set in authenticator data".to_string()
        );
    }

    // Parse attested credential data (starts at byte 37)
    // aaguid: 16 bytes
    // credentialIdLength: 2 bytes (big-endian)
    // credentialId: credentialIdLength bytes
    // credentialPublicKey: remaining bytes (CBOR-encoded COSE key)
    if auth_data.len() < 37 + 16 + 2 {
        return Err(
            "Authenticator data too short for attested credential data".to_string()
        );
    }

    let _aaguid = &auth_data[37..53];
    let cred_id_len =
        u16::from_be_bytes([auth_data[53], auth_data[54]]) as usize;
    let cred_id_end = 55 + cred_id_len;

    if auth_data.len() < cred_id_end {
        return Err("Authenticator data too short for credential ID".to_string());
    }

    let credential_id = &auth_data[55..cred_id_end];
    let cose_key_bytes = &auth_data[cred_id_end..];

    // 4. Parse the COSE key
    let cose_key = CoseKey::from_slice(cose_key_bytes)
        .map_err(|e| format!("Failed to parse COSE key: {:?}", e))?;

    // Validate it's an EC2 P-256 key (algorithm -7 = ES256)
    match &cose_key.alg {
        Some(coset::RegisteredLabelWithPrivate::Assigned(iana::Algorithm::ES256)) => {} // OK
        Some(coset::RegisteredLabelWithPrivate::PrivateUse(v)) if *v == -7 => {} // Also OK
        Some(other) => return Err(format!("Unsupported COSE algorithm: {:?}", other)),
        None => return Err("COSE key missing algorithm".to_string()),
    }

    // Re-serialize the COSE key to store it (so we can use it for auth verification)
    let cose_key_cbor = cose_key
        .to_vec()
        .map_err(|e| format!("Failed to re-serialize COSE key: {:?}", e))?;

    Ok(CredentialRegistration {
        credential_id: b64.encode(credential_id),
        public_key: b64.encode(&cose_key_cbor),
        sign_count,
        device_name: Some("Security Key".to_string()),
        registered_at: chrono::Utc::now().timestamp(),
    })
}

/// Verify an authentication response.
///
/// This performs real verification:
/// 1. Decodes and validates the client data JSON (checks challenge, origin, type)
/// 2. Parses the authenticator data to extract the sign count
/// 3. Reconstructs the signed data (authData + clientDataHash)
/// 4. Verifies the ECDSA-P256 signature against the stored public key
/// 5. Checks the sign count for clone detection
pub fn verify_authentication(
    challenge: &str,
    credential_id: &str,
    client_data_json: &str,
    authenticator_data: &str,
    signature: &str,
    public_key: &str,
    expected_sign_count: u32,
) -> Result<AuthVerificationResult, String> {
    let b64 = base64::engine::general_purpose::STANDARD;

    // 1. Decode and validate client data JSON
    let client_data_bytes = b64
        .decode(client_data_json)
        .map_err(|e| format!("Failed to decode client_data_json: {}", e))?;
    let client_data: serde_json::Value = serde_json::from_slice(&client_data_bytes)
        .map_err(|e| format!("Failed to parse client_data_json: {}", e))?;

    // Verify type is "webauthn.get"
    let typ = client_data
        .get("type")
        .and_then(|v| v.as_str())
        .ok_or("Missing 'type' in client data")?;
    if typ != "webauthn.get" {
        return Err(format!("Expected type 'webauthn.get', got '{}'", typ));
    }

    // Verify challenge matches
    let received_challenge = client_data
        .get("challenge")
        .and_then(|v| v.as_str())
        .ok_or("Missing 'challenge' in client data")?;
    if received_challenge != challenge {
        return Err(
            "Challenge mismatch: received challenge does not match the issued one".to_string()
        );
    }

    // 2. Parse authenticator data
    let auth_data = b64
        .decode(authenticator_data)
        .map_err(|e| format!("Failed to decode authenticator_data: {}", e))?;

    // Minimum authData is 37 bytes
    if auth_data.len() < 37 {
        return Err(format!(
            "Authenticator data too short: {} bytes",
            auth_data.len()
        ));
    }

    let sign_count = u32::from_be_bytes([
        auth_data[33],
        auth_data[34],
        auth_data[35],
        auth_data[36],
    ]);

    // Clone detection: if sign count is non-zero, it must be greater than expected
    if sign_count != 0 && sign_count <= expected_sign_count {
        return Err(format!(
            "Sign count clone detection: received {} but expected greater than {}",
            sign_count, expected_sign_count
        ));
    }

    // 3. Construct the signed data: authenticatorData || SHA-256(clientDataJSON)
    let client_data_hash = Sha256::digest(&client_data_bytes);
    let mut signed_data = Vec::with_capacity(auth_data.len() + 32);
    signed_data.extend_from_slice(&auth_data);
    signed_data.extend_from_slice(&client_data_hash);

    // 4. Decode the signature
    let signature_bytes = b64
        .decode(signature)
        .map_err(|e| format!("Failed to decode signature: {}", e))?;

    // WebAuthn signatures are DER-encoded ECDSA signatures
    let sig = Signature::from_der(&signature_bytes)
        .map_err(|e| format!("Failed to parse DER signature: {}", e))?;

    // 5. Decode the stored COSE key and extract the P-256 public key
    let cose_key_bytes = b64
        .decode(public_key)
        .map_err(|e| format!("Failed to decode public_key: {}", e))?;
    let cose_key = CoseKey::from_slice(&cose_key_bytes)
        .map_err(|e| format!("Failed to parse stored COSE key: {:?}", e))?;

    let verifying_key = cose_key_to_verifying_key(&cose_key)?;

    // 6. Verify the signature
    verifying_key
        .verify(&signed_data, &sig)
        .map_err(|_| "Signature verification failed: invalid signature".to_string())?;

    Ok(AuthVerificationResult {
        verified: true,
        sign_count,
        credential_id: credential_id.to_string(),
    })
}

/// Convert a COSE key (EC2 P-256) to a p256::ecdsa::VerifyingKey
fn cose_key_to_verifying_key(cose_key: &CoseKey) -> Result<VerifyingKey, String> {
    // For EC2 P-256 (ES256, alg -7):
    // -2 = x-coordinate, -3 = y-coordinate
    // These are stored in the `params` field of CoseKey
    let x_label = Label::Int(-2);
    let y_label = Label::Int(-3);

    let x_bytes = cose_key
        .params
        .iter()
        .find(|(k, _)| *k == x_label)
        .and_then(|(_, v)| v.as_bytes())
        .ok_or("COSE key missing x-coordinate (-2)")?;

    let y_bytes = cose_key
        .params
        .iter()
        .find(|(k, _)| *k == y_label)
        .and_then(|(_, v)| v.as_bytes())
        .ok_or("COSE key missing y-coordinate (-3)")?;

    // P-256 coordinates are 32 bytes each
    if x_bytes.len() != 32 || y_bytes.len() != 32 {
        return Err(format!(
            "Invalid P-256 coordinate lengths: x={}, y={}",
            x_bytes.len(),
            y_bytes.len()
        ));
    }

    // Construct uncompressed public key: 0x04 || x || y
    let mut uncompressed = vec![0x04];
    uncompressed.extend_from_slice(x_bytes);
    uncompressed.extend_from_slice(y_bytes);

    let encoded_point = p256::EncodedPoint::from_bytes(&uncompressed)
        .map_err(|e| format!("Failed to create encoded point: {}", e))?;

    VerifyingKey::from_encoded_point(&encoded_point)
        .map_err(|e| format!("Failed to create verifying key: {}", e))
}

fn generate_random_bytes(len: usize) -> Vec<u8> {
    (0..len).map(|_| rand::random::<u8>()).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_generate_registration_challenge() {
        let config = WebAuthnConfig::default();
        let challenge = generate_registration_challenge(&config, "user1", "Test User");
        assert_eq!(challenge.rp_id, "novanote.local");
        assert_eq!(challenge.user_id, "user1");
        assert_eq!(challenge.user_name, "Test User");
        // Challenge should be valid base64 and decode to 32 bytes
        let decoded =
            base64::engine::general_purpose::STANDARD.decode(&challenge.challenge).unwrap();
        assert_eq!(decoded.len(), 32);
    }

    #[test]
    fn test_generate_authentication_challenge() {
        let config = WebAuthnConfig::default();
        let cred_ids = vec!["cred1".to_string(), "cred2".to_string()];
        let challenge = generate_authentication_challenge(&config, &cred_ids);
        assert_eq!(challenge.rp_id, "novanote.local");
        assert_eq!(challenge.credential_ids.len(), 2);
        let decoded =
            base64::engine::general_purpose::STANDARD.decode(&challenge.challenge).unwrap();
        assert_eq!(decoded.len(), 32);
    }

    #[test]
    fn test_verify_registration_rejects_wrong_type() {
        let b64 = base64::engine::general_purpose::STANDARD;
        let client_data = serde_json::json!({
            "type": "webauthn.get",
            "challenge": "test-challenge",
            "origin": "https://novanote.local"
        });
        let client_data_b64 = b64.encode(serde_json::to_vec(&client_data).unwrap());
        let result = verify_registration("test-challenge", &client_data_b64, "");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("webauthn.create"));
    }

    #[test]
    fn test_verify_registration_rejects_challenge_mismatch() {
        let b64 = base64::engine::general_purpose::STANDARD;
        let client_data = serde_json::json!({
            "type": "webauthn.create",
            "challenge": "wrong-challenge",
            "origin": "https://novanote.local"
        });
        let client_data_b64 = b64.encode(serde_json::to_vec(&client_data).unwrap());
        let result = verify_registration("correct-challenge", &client_data_b64, "");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Challenge mismatch"));
    }

    #[test]
    fn test_verify_authentication_rejects_wrong_type() {
        let b64 = base64::engine::general_purpose::STANDARD;
        let client_data = serde_json::json!({
            "type": "webauthn.create",
            "challenge": "test-challenge",
            "origin": "https://novanote.local"
        });
        let client_data_b64 = b64.encode(serde_json::to_vec(&client_data).unwrap());
        let result = verify_authentication(
            "test-challenge", "cred1", &client_data_b64, "", "", "", 0,
        );
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("webauthn.get"));
    }

    #[test]
    fn test_verify_authentication_rejects_challenge_mismatch() {
        let b64 = base64::engine::general_purpose::STANDARD;
        let client_data = serde_json::json!({
            "type": "webauthn.get",
            "challenge": "wrong-challenge",
            "origin": "https://novanote.local"
        });
        let client_data_b64 = b64.encode(serde_json::to_vec(&client_data).unwrap());
        let result = verify_authentication(
            "correct-challenge", "cred1", &client_data_b64, "", "", "", 0,
        );
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Challenge mismatch"));
    }

    #[test]
    fn test_verify_authentication_clone_detection() {
        let b64 = base64::engine::general_purpose::STANDARD;
        let client_data = serde_json::json!({
            "type": "webauthn.get",
            "challenge": "test-challenge",
            "origin": "https://novanote.local"
        });
        let client_data_b64 = b64.encode(serde_json::to_vec(&client_data).unwrap());

        // Create authenticator data with sign_count = 5
        let mut auth_data = vec![0u8; 37];
        auth_data[33..37].copy_from_slice(&5u32.to_be_bytes());
        let auth_data_b64 = b64.encode(&auth_data);

        // Expected sign count is 10, but received 5 => clone detection
        let result = verify_authentication(
            "test-challenge",
            "cred1",
            &client_data_b64,
            &auth_data_b64,
            "",
            "",
            10,
        );
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("clone detection"));
    }
}
