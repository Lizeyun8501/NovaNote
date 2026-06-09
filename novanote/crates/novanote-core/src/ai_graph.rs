//! AI-powered knowledge graph analysis
//! Uses Ollama to analyze note relationships and suggest connections

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GraphAnalysisConfig {
    pub base_url: String,
    pub model: String,
}

impl Default for GraphAnalysisConfig {
    fn default() -> Self {
        Self {
            base_url: "http://localhost:11434".to_string(),
            model: "llama3.2".to_string(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SuggestedConnection {
    pub source_path: String,
    pub target_path: String,
    pub reason: String,
    pub confidence: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClusterInfo {
    pub name: String,
    pub note_paths: Vec<String>,
    pub description: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GraphAnalysisResult {
    pub suggested_connections: Vec<SuggestedConnection>,
    pub clusters: Vec<ClusterInfo>,
    pub orphan_notes: Vec<String>,
}

/// Analyze the knowledge graph and suggest connections
pub async fn analyze_graph(
    config: &GraphAnalysisConfig,
    note_titles: &[(String, String)],  // (path, title) pairs
    existing_links: &[(String, String)],  // (source, target) pairs
) -> Result<GraphAnalysisResult, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .map_err(|e| e.to_string())?;

    // Build a compact representation of the graph for the AI
    let mut notes_desc = String::new();
    for (path, title) in note_titles.iter().take(50) {
        notes_desc.push_str(&format!("- {} ({})\n", title, path));
    }

    let mut links_desc = String::new();
    for (source, target) in existing_links.iter().take(100) {
        links_desc.push_str(&format!("- {} -> {}\n", source, target));
    }

    let prompt = format!(
        "You are analyzing a personal knowledge graph. Given the following notes and their existing links, \
        suggest new connections that might be valuable.\n\n\
        Notes:\n{}\n\
        Existing Links:\n{}\n\n\
        Return a JSON object with these fields:\n\
        - \"suggested_connections\": array of objects with source_path, target_path, reason (why they should be linked), confidence (0.0-1.0)\n\
        - \"clusters\": array of objects with name, note_paths (array), description\n\
        - \"orphan_notes\": array of paths that have no links and might need connections\n\n\
        Return ONLY valid JSON, no other text.",
        notes_desc, links_desc
    );

    let request_body = serde_json::json!({
        "model": config.model,
        "prompt": prompt,
        "stream": false,
        "options": {
            "temperature": 0.3,
            "num_predict": 1024
        }
    });

    let url = format!("{}/api/generate", config.base_url);
    let resp = client
        .post(&url)
        .json(&request_body)
        .send()
        .await
        .map_err(|e| format!("Failed to connect to Ollama: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("Ollama API error: {}", resp.status()));
    }

    #[derive(Deserialize)]
    struct OllamaResponse {
        response: String,
    }

    let result: OllamaResponse = resp.json().await.map_err(|e| e.to_string())?;

    // Parse the JSON response
    let parsed: GraphAnalysisResult = serde_json::from_str(&result.response)
        .unwrap_or(GraphAnalysisResult {
            suggested_connections: Vec::new(),
            clusters: Vec::new(),
            orphan_notes: Vec::new(),
        });

    Ok(parsed)
}

/// Generate a summary of a cluster of related notes
pub async fn summarize_cluster(
    config: &GraphAnalysisConfig,
    note_titles: &[String],
    note_contents: &[String],
) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(60))
        .build()
        .map_err(|e| e.to_string())?;

    let mut combined = String::new();
    for (title, content) in note_titles.iter().zip(note_contents.iter()).take(5) {
        combined.push_str(&format!("## {}\n{}\n\n", title, &content.chars().take(500).collect::<String>()));
    }

    let prompt = format!(
        "Summarize the common themes across these related notes in 2-3 sentences:\n\n{}",
        combined
    );

    let request_body = serde_json::json!({
        "model": config.model,
        "prompt": prompt,
        "stream": false,
        "options": { "temperature": 0.5, "num_predict": 256 }
    });

    let url = format!("{}/api/generate", config.base_url);
    let resp = client
        .post(&url)
        .json(&request_body)
        .send()
        .await
        .map_err(|e| format!("Failed to connect to Ollama: {}", e))?;

    #[derive(Deserialize)]
    struct OllamaResponse {
        response: String,
    }

    let result: OllamaResponse = resp.json().await.map_err(|e| e.to_string())?;
    Ok(result.response.trim().to_string())
}
