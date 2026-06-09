//! Multi-modal AI module
//! Supports image understanding and analysis via Ollama Vision models

use base64::Engine;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MultiModalConfig {
    pub base_url: String,
    pub model: String,
}

impl Default for MultiModalConfig {
    fn default() -> Self {
        Self {
            base_url: "http://localhost:11434".to_string(),
            model: "llava".to_string(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImageAnalysisResult {
    pub description: String,
    pub tags: Vec<String>,
    pub text_content: Option<String>,
    pub model: String,
}

/// Analyze an image using Ollama Vision model
pub async fn analyze_image(
    config: &MultiModalConfig,
    image_path: &str,
    prompt: &str,
) -> Result<ImageAnalysisResult, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .map_err(|e| e.to_string())?;

    let image_data = std::fs::read(image_path)
        .map_err(|e| format!("Failed to read image: {}", e))?;
    let base64_image = base64::engine::general_purpose::STANDARD.encode(&image_data);

    let mime = match image_path.rsplit('.').next().unwrap_or("") {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        _ => "image/png",
    };

    let request_body = serde_json::json!({
        "model": config.model,
        "prompt": prompt,
        "images": [format!("data:{};base64,{}", mime, base64_image)],
        "stream": false,
        "options": { "temperature": 0.3, "num_predict": 512 }
    });

    let url = format!("{}/api/generate", config.base_url);
    let resp = client
        .post(&url)
        .json(&request_body)
        .send()
        .await
        .map_err(|e| format!("Failed to connect to Ollama: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("Ollama Vision error: {}", resp.status()));
    }

    #[derive(Deserialize)]
    struct OllamaResponse {
        response: String,
    }

    let result: OllamaResponse = resp.json().await.map_err(|e| e.to_string())?;

    Ok(ImageAnalysisResult {
        description: result.response.trim().to_string(),
        tags: Vec::new(),
        text_content: None,
        model: config.model.clone(),
    })
}

/// Describe an image in detail
pub async fn describe_image(
    config: &MultiModalConfig,
    image_path: &str,
) -> Result<ImageAnalysisResult, String> {
    analyze_image(config, image_path,
        "Describe this image in detail. What do you see? Be specific about objects, people, text, colors, and layout."
    ).await
}

/// Extract and generate tags for an image
pub async fn tag_image(
    config: &MultiModalConfig,
    image_path: &str,
) -> Result<ImageAnalysisResult, String> {
    let result = analyze_image(config, image_path,
        "Generate 5-10 relevant tags for this image. Return ONLY a JSON array of tag strings. Example: [\"landscape\", \"mountain\", \"sunset\"]"
    ).await?;

    // Try to parse tags from response
    let tags = crate::ai::parse_json_array(&result.description).unwrap_or_default();

    Ok(ImageAnalysisResult {
        tags,
        ..result
    })
}

/// Analyze an image and generate a Markdown note about it
pub async fn image_to_note(
    config: &MultiModalConfig,
    image_path: &str,
) -> Result<String, String> {
    let analysis = describe_image(config, image_path).await?;
    let tags = tag_image(config, image_path).await?;

    let filename = std::path::Path::new(image_path)
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "image".to_string());

    Ok(format!(
        "---\nsource: image\ntype: image-analysis\ntags: [{}]\n---\n\n# Image Analysis: {}\n\n{}\n\n![{}](attachments/{})\n",
        tags.tags.iter().map(|t| format!("\"{}\"", t)).collect::<Vec<_>>().join(", "),
        filename,
        analysis.description,
        filename,
        filename
    ))
}
