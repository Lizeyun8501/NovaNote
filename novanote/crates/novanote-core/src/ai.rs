//! AI integration module - Ollama local LLM client
//! Provides smart tags, auto-summary, and writing assistance via Ollama API

use serde::{Deserialize, Serialize};

/// Ollama API configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OllamaConfig {
    pub base_url: String,
    pub model: String,
    pub timeout_secs: u64,
}

impl Default for OllamaConfig {
    fn default() -> Self {
        Self {
            base_url: "http://localhost:11434".to_string(),
            model: "llama3.2".to_string(),
            timeout_secs: 120,
        }
    }
}

/// AI-generated tags result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AITagResult {
    pub tags: Vec<String>,
    pub confidence: f32,
}

/// AI summary result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AISummaryResult {
    pub summary: String,
    pub model: String,
}

/// Writing assist modes
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum WritingAssistMode {
    /// Continue writing from the selected text
    Continue,
    /// Polish/improve the selected text
    Polish,
    /// Translate to Chinese
    TranslateToChinese,
    /// Translate to English
    TranslateToEnglish,
}

impl WritingAssistMode {
    fn prompt_instruction(&self) -> &str {
        match self {
            WritingAssistMode::Continue => "Continue writing the following text in the same style. Keep it concise and natural:",
            WritingAssistMode::Polish => "Polish and improve the following text. Fix grammar, improve clarity, and enhance style while preserving the original meaning:",
            WritingAssistMode::TranslateToChinese => "Translate the following text to Chinese. Keep the translation accurate and natural:",
            WritingAssistMode::TranslateToEnglish => "Translate the following text to English. Keep the translation accurate and natural:",
        }
    }
}

/// Result from writing assistance
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WritingAssistResult {
    pub text: String,
    pub mode: String,
}

/// Ollama API request for generate endpoint
#[derive(Debug, Serialize)]
struct OllamaGenerateRequest {
    model: String,
    prompt: String,
    stream: bool,
    options: OllamaOptions,
}

#[derive(Debug, Serialize)]
struct OllamaOptions {
    temperature: f32,
    num_predict: i32,
}

/// Ollama API response
#[derive(Debug, Deserialize)]
struct OllamaGenerateResponse {
    response: String,
    #[allow(dead_code)]
    done: bool,
}

/// Check if Ollama is reachable
pub async fn check_ollama(config: &OllamaConfig) -> Result<bool, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build()
        .map_err(|e| e.to_string())?;

    let url = format!("{}/api/tags", config.base_url);
    match client.get(&url).send().await {
        Ok(resp) => Ok(resp.status().is_success()),
        Err(_) => Ok(false),
    }
}

/// List available models from Ollama
pub async fn list_models(config: &OllamaConfig) -> Result<Vec<String>, String> {
    let client = reqwest::Client::new();
    let url = format!("{}/api/tags", config.base_url);

    #[derive(Deserialize)]
    struct ModelInfo {
        name: String,
    }
    #[derive(Deserialize)]
    struct TagsResponse {
        models: Vec<ModelInfo>,
    }

    let resp = client.get(&url).send().await.map_err(|e| e.to_string())?;
    let data: TagsResponse = resp.json().await.map_err(|e| e.to_string())?;
    Ok(data.models.into_iter().map(|m| m.name).collect())
}

/// Call Ollama generate API
async fn call_ollama(config: &OllamaConfig, prompt: &str, max_tokens: i32) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(config.timeout_secs))
        .build()
        .map_err(|e| e.to_string())?;

    let request = OllamaGenerateRequest {
        model: config.model.clone(),
        prompt: prompt.to_string(),
        stream: false,
        options: OllamaOptions {
            temperature: 0.7,
            num_predict: max_tokens,
        },
    };

    let url = format!("{}/api/generate", config.base_url);
    let resp = client
        .post(&url)
        .json(&request)
        .send()
        .await
        .map_err(|e| format!("Failed to connect to Ollama: {}. Is Ollama running?", e))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("Ollama API error ({}): {}", status, body));
    }

    let result: OllamaGenerateResponse = resp.json().await.map_err(|e| e.to_string())?;
    Ok(result.response)
}

/// Truncate note content for AI processing (keep it under ~2000 chars for efficiency)
fn truncate_for_ai(content: &str, max_chars: usize) -> String {
    if content.len() <= max_chars {
        content.to_string()
    } else {
        let truncated: String = content.chars().take(max_chars).collect();
        format!("{}...\n[Content truncated]", truncated)
    }
}

/// Generate smart tags for note content
pub async fn generate_tags(
    config: &OllamaConfig,
    content: &str,
) -> Result<AITagResult, String> {
    let truncated = truncate_for_ai(content, 2000);

    let prompt = format!(
        "You are a tag generator for a personal knowledge base. \
        Read the following note content and generate 3-5 relevant tags. \
        Tags should be single words or short phrases in lowercase. \
        Focus on topics, concepts, and types of content.\n\n\
        Note content:\n{}\n\n\
        Return ONLY a JSON array of tag strings, nothing else. Example: [\"rust\", \"programming\", \"tutorial\"]",
        truncated
    );

    let response = call_ollama(config, &prompt, 128).await?;

    // Parse JSON array from response
    let tags: Vec<String> = parse_json_array(&response)
        .unwrap_or_else(|| {
            // Fallback: try to extract words
            response
                .lines()
                .flat_map(|line| {
                    line.split(&[',', '[', ']', '"', '\'', ' '])
                        .map(|s| s.trim().trim_matches(&['"', '\'', '[', ']'] as &[_]))
                        .filter(|s| !s.is_empty() && !s.contains('{') && !s.contains('}'))
                        .map(|s| s.to_string())
                        .collect::<Vec<_>>()
                })
                .take(5)
                .collect()
        });

    Ok(AITagResult {
        tags,
        confidence: 0.8,
    })
}

/// Generate an AI summary of note content
pub async fn generate_summary(
    config: &OllamaConfig,
    content: &str,
) -> Result<AISummaryResult, String> {
    let truncated = truncate_for_ai(content, 3000);

    let prompt = format!(
        "You are a summarizer for a personal knowledge base. \
        Read the following note and generate a concise summary in 2-4 sentences. \
        Capture the main topic and key points.\n\n\
        Note content:\n{}\n\n\
        Return ONLY the summary text, nothing else. Do not prefix with 'Summary:' or any label.",
        truncated
    );

    let summary = call_ollama(config, &prompt, 256).await?;
    let summary = summary.trim().to_string();

    Ok(AISummaryResult {
        summary,
        model: config.model.clone(),
    })
}

/// Writing assist - continue, polish, or translate text
pub async fn writing_assist(
    config: &OllamaConfig,
    text: &str,
    mode: WritingAssistMode,
) -> Result<WritingAssistResult, String> {
    let instruction = mode.prompt_instruction();

    let prompt = format!(
        "{}\n\nText:\n{}\n\nReturn ONLY the resulting text, nothing else. Do not prefix with any explanation or label.",
        instruction, text
    );

    let result_text = call_ollama(config, &prompt, 512).await?;
    let result_text = result_text.trim().to_string();

    let mode_str = match mode {
        WritingAssistMode::Continue => "continue",
        WritingAssistMode::Polish => "polish",
        WritingAssistMode::TranslateToChinese => "translate_to_chinese",
        WritingAssistMode::TranslateToEnglish => "translate_to_english",
    };

    Ok(WritingAssistResult {
        text: result_text,
        mode: mode_str.to_string(),
    })
}

/// Try to parse a JSON array of strings from AI response
fn parse_json_array(text: &str) -> Option<Vec<String>> {
    // Find text between [ and ]
    let start = text.find('[')?;
    let end = text.rfind(']')?;
    if end <= start {
        return None;
    }

    let array_text = &text[start..=end];

    // Try serde_json parse
    serde_json::from_str::<Vec<String>>(array_text).ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_json_array_valid() {
        let result = parse_json_array("[\"rust\", \"programming\", \"tutorial\"]");
        assert_eq!(
            result,
            Some(vec![
                "rust".to_string(),
                "programming".to_string(),
                "tutorial".to_string()
            ])
        );
    }

    #[test]
    fn test_parse_json_array_with_extra_text() {
        let result = parse_json_array(
            "Here are your tags:\n[\"ai\", \"machine-learning\"]\nHope that helps!",
        );
        assert_eq!(
            result,
            Some(vec!["ai".to_string(), "machine-learning".to_string()])
        );
    }

    #[test]
    fn test_parse_json_array_empty() {
        let result = parse_json_array("No tags found.");
        assert_eq!(result, None);
    }

    #[test]
    fn test_truncate_for_ai() {
        let short = "Hello world";
        assert_eq!(truncate_for_ai(short, 100), "Hello world");

        let long = "a".repeat(5000);
        let truncated = truncate_for_ai(&long, 100);
        assert!(truncated.len() <= 100 + 30); // +30 for the truncation note
        assert!(truncated.contains("[Content truncated]"));
    }

    #[test]
    fn test_ollama_config_default() {
        let config = OllamaConfig::default();
        assert_eq!(config.base_url, "http://localhost:11434");
        assert_eq!(config.model, "llama3.2");
    }
}