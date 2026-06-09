//! Speech-to-text module using Ollama Whisper model
//! Converts audio recordings to text for note-taking

use base64::Engine;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WhisperConfig {
    pub base_url: String,
    pub model: String,
}

impl Default for WhisperConfig {
    fn default() -> Self {
        Self {
            base_url: "http://localhost:11434".to_string(),
            model: "whisper".to_string(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TranscriptionResult {
    pub text: String,
    pub language: Option<String>,
    pub duration_secs: Option<f64>,
    pub model: String,
}

/// Transcribe an audio file using Ollama Whisper
pub async fn transcribe_audio(config: &WhisperConfig, audio_path: &str) -> Result<TranscriptionResult, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(300))  // 5 min timeout for audio
        .build()
        .map_err(|e| e.to_string())?;

    // Read and base64-encode the audio file
    let audio_data = std::fs::read(audio_path)
        .map_err(|e| format!("Failed to read audio file: {}", e))?;
    let base64_audio = base64::engine::general_purpose::STANDARD.encode(&audio_data);

    let request_body = serde_json::json!({
        "model": config.model,
        "prompt": "Transcribe the following audio. Return ONLY the transcribed text.",
        "images": [format!("data:audio/wav;base64,{}", base64_audio)],
        "stream": false
    });

    let url = format!("{}/api/generate", config.base_url);
    let resp = client
        .post(&url)
        .json(&request_body)
        .send()
        .await
        .map_err(|e| format!("Failed to connect to Ollama: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("Ollama Whisper error: {}", resp.status()));
    }

    #[derive(Deserialize)]
    struct OllamaResponse {
        response: String,
    }

    let result: OllamaResponse = resp.json().await.map_err(|e| e.to_string())?;

    Ok(TranscriptionResult {
        text: result.response.trim().to_string(),
        language: None,
        duration_secs: None,
        model: config.model.clone(),
    })
}

/// Transcribe audio from raw bytes
pub async fn transcribe_audio_bytes(config: &WhisperConfig, audio_data: &[u8], mime_type: &str) -> Result<TranscriptionResult, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(300))
        .build()
        .map_err(|e| e.to_string())?;

    let base64_audio = base64::engine::general_purpose::STANDARD.encode(audio_data);

    let request_body = serde_json::json!({
        "model": config.model,
        "prompt": "Transcribe the following audio. Return ONLY the transcribed text.",
        "images": [format!("data:{};base64,{}", mime_type, base64_audio)],
        "stream": false
    });

    let url = format!("{}/api/generate", config.base_url);
    let resp = client
        .post(&url)
        .json(&request_body)
        .send()
        .await
        .map_err(|e| format!("Failed to connect to Ollama: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("Ollama Whisper error: {}", resp.status()));
    }

    #[derive(Deserialize)]
    struct OllamaResponse {
        response: String,
    }

    let result: OllamaResponse = resp.json().await.map_err(|e| e.to_string())?;

    Ok(TranscriptionResult {
        text: result.response.trim().to_string(),
        language: None,
        duration_secs: None,
        model: config.model.clone(),
    })
}
