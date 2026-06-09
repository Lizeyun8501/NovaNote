//! TOTP Two-Factor Authentication for NovaNote sync server

use hmac::{Hmac, Mac};
use sha1::Sha1;
use std::time::SystemTime;

type HmacSha1 = Hmac<Sha1>;

/// Generate a TOTP secret (base32 encoded)
pub fn generate_secret() -> String {
    let secret: [u8; 20] = rand::random();
    base32_encode(&secret)
}

/// Generate a TOTP code for the current time step
pub fn generate_totp(secret: &str, time_step: Option<u64>) -> Result<String, String> {
    let secret_bytes = base32_decode(secret)?;
    let time_step = time_step.unwrap_or_else(|| {
        SystemTime::now()
            .duration_since(SystemTime::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs()
            / 30
    });

    let time_bytes = time_step.to_be_bytes();

    let mut mac = HmacSha1::new_from_slice(&secret_bytes)
        .map_err(|e| format!("HMAC init failed: {}", e))?;
    mac.update(&time_bytes);
    let result = mac.finalize().into_bytes();

    let offset = (result[19] & 0xf) as usize;
    let code = ((result[offset] as u32 & 0x7f) << 24)
        | ((result[offset + 1] as u32) << 16)
        | ((result[offset + 2] as u32) << 8)
        | (result[offset + 3] as u32);

    Ok(format!("{:06}", code % 1_000_000))
}

/// Verify a TOTP code
pub fn verify_totp(secret: &str, code: &str) -> Result<bool, String> {
    let current_step = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
        / 30;

    // Check current and adjacent time steps (±1 for clock drift)
    for delta in -1i64..=1 {
        let step = (current_step as i64 + delta) as u64;
        let expected = generate_totp(secret, Some(step))?;
        if expected == code {
            return Ok(true);
        }
    }

    Ok(false)
}

/// Generate otpauth:// URI for QR code
pub fn generate_otpauth_uri(secret: &str, email: &str, issuer: &str) -> String {
    format!(
        "otpauth://totp/{}:{}?secret={}&issuer={}&algorithm=SHA1&digits=6&period=30",
        issuer, email, secret, issuer
    )
}

/// Base32 encode (RFC 4648, no padding)
fn base32_encode(data: &[u8]) -> String {
    const ALPHABET: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    let mut result = String::new();
    let mut bits = 0u32;
    let mut buffer = 0u32;

    for &byte in data {
        buffer = (buffer << 8) | byte as u32;
        bits += 8;
        while bits >= 5 {
            bits -= 5;
            let index = ((buffer >> bits) & 0x1f) as usize;
            result.push(ALPHABET[index] as char);
        }
    }

    if bits > 0 {
        let index = ((buffer << (5 - bits)) & 0x1f) as usize;
        result.push(ALPHABET[index] as char);
    }

    result
}

/// Base32 decode
fn base32_decode(s: &str) -> Result<Vec<u8>, String> {
    const ALPHABET: &str = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    let s = s.trim_end_matches('=').to_uppercase();

    let mut result = Vec::new();
    let mut bits = 0u32;
    let mut buffer = 0u32;

    for c in s.chars() {
        let val = ALPHABET.find(c).ok_or_else(|| format!("Invalid base32 char: {}", c))?;
        buffer = (buffer << 5) | val as u32;
        bits += 5;
        if bits >= 8 {
            bits -= 8;
            result.push(((buffer >> bits) & 0xff) as u8);
        }
    }

    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_base32_roundtrip() {
        let data = b"Hello, World!";
        let encoded = base32_encode(data);
        let decoded = base32_decode(&encoded).unwrap();
        assert_eq!(data.to_vec(), decoded);
    }

    #[test]
    fn test_totp_generate_and_verify() {
        let secret = generate_secret();
        let step = 12345u64;
        let code = generate_totp(&secret, Some(step)).unwrap();
        assert_eq!(code.len(), 6);

        // Verify with same step
        let expected = generate_totp(&secret, Some(step)).unwrap();
        assert_eq!(code, expected);
    }

    #[test]
    fn test_otpauth_uri() {
        let uri = generate_otpauth_uri("JBSWY3DPEHPK3PXP", "user@example.com", "NovaNote");
        assert!(uri.starts_with("otpauth://totp/NovaNote:user@example.com"));
        assert!(uri.contains("secret=JBSWY3DPEHPK3PXP"));
    }
}
