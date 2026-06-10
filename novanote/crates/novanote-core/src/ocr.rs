//! OCR text recognition module
//! Supports image-to-text via Ollama Vision models (llava, llava-llama3, etc.)

use serde::{Deserialize, Serialize};
use base64::Engine;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OcrConfig {
    pub base_url: String,
    pub model: String,
}

impl Default for OcrConfig {
    fn default() -> Self {
        Self {
            base_url: "http://localhost:11434".to_string(),
            model: "llava".to_string(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OcrResult {
    pub text: String,
    pub confidence: f32,
    pub model: String,
}

/// Perform OCR on an image using Ollama Vision model
pub async fn ocr_image(config: &OcrConfig, image_path: &str) -> Result<OcrResult, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .map_err(|e| e.to_string())?;

    // Read and base64-encode the image
    let image_data = std::fs::read(image_path)
        .map_err(|e| format!("Failed to read image: {}", e))?;
    let base64_image = base64::engine::general_purpose::STANDARD.encode(&image_data);

    // Determine MIME type from extension
    let mime = match image_path.rsplit('.').next().unwrap_or("") {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        _ => "image/png",
    };

    let request_body = serde_json::json!({
        "model": config.model,
        "prompt": "Extract all text from this image. Return ONLY the extracted text, nothing else. If there is no text, return an empty string.",
        "images": [format!("data:{};base64,{}", mime, base64_image)],
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
        return Err(format!("Ollama OCR error: {}", resp.status()));
    }

    #[derive(Deserialize)]
    struct OllamaResponse {
        response: String,
    }

    let result: OllamaResponse = resp.json().await.map_err(|e| e.to_string())?;

    Ok(OcrResult {
        text: result.response.trim().to_string(),
        confidence: 0.85,
        model: config.model.clone(),
    })
}

/// Perform OCR on multiple images and combine results
pub async fn ocr_images(config: &OcrConfig, image_paths: &[String]) -> Result<Vec<OcrResult>, String> {
    let mut results = Vec::new();
    for path in image_paths {
        match ocr_image(config, path).await {
            Ok(result) => results.push(result),
            Err(_e) => results.push(OcrResult {
                text: String::new(),
                confidence: 0.0,
                model: config.model.clone(),
            }),
        }
    }
    Ok(results)
}
