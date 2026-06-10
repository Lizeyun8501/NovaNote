//! Third-party integrations for NovaNote
//! Supports GitHub, Slack, and other services via their APIs

use serde::{Deserialize, Serialize};

// ── GitHub Integration ──────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitHubConfig {
    pub token: String,
    pub repo: Option<String>,  // owner/repo format
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitHubIssue {
    pub number: i64,
    pub title: String,
    pub body: Option<String>,
    pub state: String,
    pub labels: Vec<String>,
    pub html_url: String,
    pub created_at: String,
}

/// Fetch issues from a GitHub repository
pub async fn github_list_issues(config: &GitHubConfig) -> Result<Vec<GitHubIssue>, String> {
    let repo = config.repo.as_deref().unwrap_or("");
    if repo.is_empty() {
        return Err("GitHub repo not configured (format: owner/repo)".to_string());
    }

    let url = format!("https://api.github.com/repos/{}/issues?state=open&per_page=30", repo);
    let client = reqwest::Client::new();
    let resp = client
        .get(&url)
        .header("Authorization", format!("Bearer {}", config.token))
        .header("User-Agent", "NovaNote")
        .send()
        .await
        .map_err(|e| format!("GitHub API error: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("GitHub API error: {}", resp.status()));
    }

    #[derive(Deserialize)]
    struct GhLabel {
        name: String,
    }
    #[derive(Deserialize)]
    struct GhIssue {
        number: i64,
        title: String,
        body: Option<String>,
        state: String,
        labels: Vec<GhLabel>,
        html_url: String,
        created_at: String,
    }

    let issues: Vec<GhIssue> = resp.json().await.map_err(|e| e.to_string())?;
    Ok(issues.into_iter().map(|i| GitHubIssue {
        number: i.number,
        title: i.title,
        body: i.body,
        state: i.state,
        labels: i.labels.into_iter().map(|l| l.name).collect(),
        html_url: i.html_url,
        created_at: i.created_at,
    }).collect())
}

/// Convert a GitHub issue to Markdown note
pub fn github_issue_to_markdown(issue: &GitHubIssue, repo: &str) -> String {
    let labels = if issue.labels.is_empty() {
        String::new()
    } else {
        format!("tags: [{}]", issue.labels.iter().map(|l| format!("\"github-{}\"", l)).collect::<Vec<_>>().join(", "))
    };

    format!(
        "---\nsource: github\ntype: github-issue\nrepo: \"{}\"\nissue_number: {}\nurl: \"{}\"\nstate: \"{}\"\n{}\n---\n\n# {} (#{})\n\n{}\n",
        repo,
        issue.number,
        issue.html_url,
        issue.state,
        labels,
        issue.title,
        issue.number,
        issue.body.as_deref().unwrap_or("*No description*")
    )
}

// ── Slack Integration ───────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SlackConfig {
    pub bot_token: String,
    pub channel: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SlackMessage {
    pub text: String,
    pub user: String,
    pub timestamp: String,
    pub channel_name: Option<String>,
}

/// Fetch recent messages from a Slack channel
pub async fn slack_list_messages(config: &SlackConfig, limit: usize) -> Result<Vec<SlackMessage>, String> {
    let channel = config.channel.as_deref().unwrap_or("general");

    // First, get channel ID
    let client = reqwest::Client::new();
    let list_url = "https://slack.com/api/conversations.list";
    let list_resp = client
        .get(list_url)
        .header("Authorization", format!("Bearer {}", config.bot_token))
        .send()
        .await
        .map_err(|e| format!("Slack API error: {}", e))?;

    #[derive(Deserialize)]
    struct ChannelListResponse {
        ok: bool,
        channels: Option<Vec<SlackChannel>>,
    }
    #[derive(Deserialize)]
    struct SlackChannel {
        id: String,
        name: String,
    }

    let list_data: ChannelListResponse = list_resp.json().await.map_err(|e| e.to_string())?;
    if !list_data.ok {
        return Err("Slack API returned error".to_string());
    }

    let channel_id = list_data.channels
        .and_then(|channels| channels.into_iter().find(|c| c.name == channel))
        .map(|c| c.id)
        .ok_or_else(|| format!("Channel '{}' not found", channel))?;

    // Fetch messages
    let hist_url = format!("https://slack.com/api/conversations.history?channel={}&limit={}", channel_id, limit);
    let hist_resp = client
        .get(&hist_url)
        .header("Authorization", format!("Bearer {}", config.bot_token))
        .send()
        .await
        .map_err(|e| format!("Slack API error: {}", e))?;

    #[derive(Deserialize)]
    struct HistoryResponse {
        ok: bool,
        messages: Option<Vec<SlackMsg>>,
    }
    #[derive(Deserialize)]
    struct SlackMsg {
        text: Option<String>,
        user: Option<String>,
        ts: Option<String>,
    }

    let hist_data: HistoryResponse = hist_resp.json().await.map_err(|e| e.to_string())?;
    if !hist_data.ok {
        return Err("Slack API returned error".to_string());
    }

    Ok(hist_data.messages.unwrap_or_default().into_iter().map(|m| SlackMessage {
        text: m.text.unwrap_or_default(),
        user: m.user.unwrap_or_default(),
        timestamp: m.ts.unwrap_or_default(),
        channel_name: Some(channel.to_string()),
    }).collect())
}

/// Convert Slack messages to a Markdown note
pub fn slack_messages_to_markdown(messages: &[SlackMessage], channel: &str) -> String {
    let mut md = format!("---\nsource: slack\ntype: slack-export\nchannel: \"{}\"\n---\n\n# Slack #{} Export\n\n", channel, channel);

    for msg in messages {
        md.push_str(&format!("**@{}** ({}):\n> {}\n\n", msg.user, msg.timestamp, msg.text));
    }

    md
}

// ── Notion Integration ──────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NotionConfig {
    pub api_key: String,
    pub database_id: Option<String>,
    #[serde(default = "default_notion_version")]
    pub version: String,
}

fn default_notion_version() -> String {
    "2022-06-28".to_string()
}

impl Default for NotionConfig {
    fn default() -> Self {
        Self {
            api_key: String::new(),
            database_id: None,
            version: default_notion_version(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NotionPage {
    pub id: String,
    pub title: String,
    pub url: String,
    pub created_time: String,
    pub last_edited_time: String,
    pub parent_type: String,
}

/// Fetch pages from Notion using the search API
pub async fn notion_list_pages(config: &NotionConfig) -> Result<Vec<NotionPage>, String> {
    let client = reqwest::Client::new();
    if let Some(ref db_id) = config.database_id {
        // If a database_id is provided, we query that database specifically
        let url = format!("https://api.notion.com/v1/databases/{}/query", db_id);
        let resp = client
            .post(&url)
            .header("Authorization", format!("Bearer {}", config.api_key))
            .header("Notion-Version", &config.version)
            .header("Content-Type", "application/json")
            .json(&serde_json::json!({}))
            .send()
            .await
            .map_err(|e| format!("Notion API error: {}", e))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            return Err(format!("Notion API error: {} - {}", status, text));
        }

        #[derive(Deserialize)]
        struct NotionSearchResponse {
            results: Vec<serde_json::Value>,
        }

        let data: NotionSearchResponse = resp.json().await.map_err(|e| format!("JSON parse error: {}", e))?;
        Ok(data.results.into_iter().filter_map(|p| parse_notion_page(&p)).collect())
    } else {
        // Use the search API to list all pages
        let body = serde_json::json!({
            "filter": {
                "property": "object",
                "value": "page"
            }
        });

        let resp = client
            .post("https://api.notion.com/v1/search")
            .header("Authorization", format!("Bearer {}", config.api_key))
            .header("Notion-Version", &config.version)
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Notion API error: {}", e))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            return Err(format!("Notion API error: {} - {}", status, text));
        }

        #[derive(Deserialize)]
        struct NotionSearchResponse {
            results: Vec<serde_json::Value>,
        }

        let data: NotionSearchResponse = resp.json().await.map_err(|e| format!("JSON parse error: {}", e))?;
        Ok(data.results.into_iter().filter_map(|p| parse_notion_page(&p)).collect())
    }
}

/// Parse a Notion page JSON object into a NotionPage
fn parse_notion_page(page: &serde_json::Value) -> Option<NotionPage> {
    let id = page.get("id")?.as_str()?.to_string();
    let url = page.get("url")?.as_str()?.to_string();
    let created_time = page.get("created_time")?.as_str()?.to_string();
    let last_edited_time = page.get("last_edited_time")?.as_str()?.to_string();

    // Extract parent type
    let parent_type = page
        .get("parent")
        .and_then(|p| p.get("type"))
        .and_then(|t| t.as_str())
        .unwrap_or("unknown")
        .to_string();

    // Extract title from properties
    let title = extract_page_title(page);

    Some(NotionPage {
        id,
        title,
        url,
        created_time,
        last_edited_time,
        parent_type,
    })
}

/// Extract the title from a Notion page object
fn extract_page_title(page: &serde_json::Value) -> String {
    let properties = match page.get("properties") {
        Some(props) => props,
        None => return "Untitled".to_string(),
    };

    // Try common title property names
    for key in &["Name", "title", "Title", "name"] {
        if let Some(prop) = properties.get(key) {
            if let Some(title) = extract_rich_text_from_property(prop) {
                return title;
            }
        }
    }

    // Try to find any property of type "title"
    if let Some(props) = properties.as_object() {
        for (_key, prop) in props {
            if prop.get("type").and_then(|t| t.as_str()) == Some("title") {
                if let Some(title) = extract_rich_text_from_property(prop) {
                    return title;
                }
            }
        }
    }

    "Untitled".to_string()
}

/// Extract plain text from a Notion rich text property
fn extract_rich_text_from_property(prop: &serde_json::Value) -> Option<String> {
    let title_array = prop.get("title")?.as_array()?;
    let text: String = title_array.iter().filter_map(|t| {
        t.get("plain_text").and_then(|pt| pt.as_str())
    }).collect();
    if text.is_empty() { None } else { Some(text) }
}

/// Convert a Notion page to Markdown by fetching its block children
pub async fn notion_page_to_markdown(config: &NotionConfig, page_id: &str) -> Result<String, String> {
    let blocks = fetch_blocks_recursive(config, page_id).await?;

    let title_line = format!("# Notion Page\n\n");
    let mut md = String::from("---\nsource: notion\ntype: notion-page\n---\n\n");
    md.push_str(&title_line);

    for block in &blocks {
        md.push_str(&block_to_markdown(block, 0));
    }

    Ok(md)
}

/// A Notion block with its children
#[derive(Debug, Clone)]
struct NotionBlock {
    block_type: String,
    data: serde_json::Value,
    children: Vec<NotionBlock>,
}

/// Recursively fetch blocks from the Notion API
fn fetch_blocks_recursive<'a>(config: &'a NotionConfig, block_id: &'a str) -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<Vec<NotionBlock>, String>> + Send + 'a>> {
    Box::pin(async move {
        let client = reqwest::Client::new();
        let url = format!("https://api.notion.com/v1/blocks/{}/children", block_id);

        let resp = client
            .get(&url)
            .header("Authorization", format!("Bearer {}", config.api_key))
            .header("Notion-Version", &config.version)
            .send()
            .await
            .map_err(|e| format!("Notion API error: {}", e))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            return Err(format!("Notion API error: {} - {}", status, text));
        }

        #[derive(Deserialize)]
        struct BlocksResponse {
            results: Vec<serde_json::Value>,
        }

        let data: BlocksResponse = resp.json().await.map_err(|e| format!("JSON parse error: {}", e))?;

        let mut blocks = Vec::new();
        for block_val in &data.results {
            let block_type = block_val
                .get("type")
                .and_then(|t| t.as_str())
                .unwrap_or("unknown")
                .to_string();

            let has_children = block_val
                .get("has_children")
                .and_then(|h| h.as_bool())
                .unwrap_or(false);

            let children = if has_children {
                let child_id = block_val.get("id").and_then(|i| i.as_str()).unwrap_or("");
                fetch_blocks_recursive(config, child_id).await.unwrap_or_default()
            } else {
                Vec::new()
            };

            blocks.push(NotionBlock {
                block_type,
                data: block_val.clone(),
                children,
            });
        }

        Ok(blocks)
    })
}

/// Convert a Notion block to Markdown
fn block_to_markdown(block: &NotionBlock, depth: usize) -> String {
    let indent = "  ".repeat(depth);
    let mut md = String::new();

    match block.block_type.as_str() {
        "paragraph" => {
            let text = extract_rich_text_from_block(&block.data, "paragraph");
            if text.is_empty() {
                md.push_str(&format!("{}\n\n", indent));
            } else {
                md.push_str(&format!("{}{}\n\n", indent, text));
            }
        }
        "heading_1" => {
            let text = extract_rich_text_from_block(&block.data, "heading_1");
            md.push_str(&format!("{}# {}\n\n", indent, text));
        }
        "heading_2" => {
            let text = extract_rich_text_from_block(&block.data, "heading_2");
            md.push_str(&format!("{}## {}\n\n", indent, text));
        }
        "heading_3" => {
            let text = extract_rich_text_from_block(&block.data, "heading_3");
            md.push_str(&format!("{}### {}\n\n", indent, text));
        }
        "bulleted_list_item" => {
            let text = extract_rich_text_from_block(&block.data, "bulleted_list_item");
            md.push_str(&format!("{}- {}\n", indent, text));
        }
        "numbered_list_item" => {
            let text = extract_rich_text_from_block(&block.data, "numbered_list_item");
            md.push_str(&format!("{}1. {}\n", indent, text));
        }
        "to_do" => {
            let text = extract_rich_text_from_block(&block.data, "to_do");
            let checked = block.data
                .get("to_do")
                .and_then(|t| t.get("checked"))
                .and_then(|c| c.as_bool())
                .unwrap_or(false);
            let check = if checked { "[x]" } else { "[ ]" };
            md.push_str(&format!("{}- {} {}\n", indent, check, text));
        }
        "code" => {
            let text = extract_rich_text_from_block(&block.data, "code");
            let language = block.data
                .get("code")
                .and_then(|c| c.get("language"))
                .and_then(|l| l.as_str())
                .unwrap_or("");
            md.push_str(&format!("{}{}```{}\n{}\n```\n\n", indent, indent, language, text));
        }
        "quote" => {
            let text = extract_rich_text_from_block(&block.data, "quote");
            md.push_str(&format!("{}> {}\n\n", indent, text));
        }
        "divider" => {
            md.push_str(&format!("{}---\n\n", indent));
        }
        "image" => {
            let alt = extract_rich_text_from_block(&block.data, "image");
            let url = block.data
                .get("image")
                .and_then(|img| {
                    img.get("file").and_then(|f| f.get("url")).or_else(|| img.get("external").and_then(|e| e.get("url")))
                })
                .and_then(|u| u.as_str())
                .unwrap_or("");
            md.push_str(&format!("{}![{}]({})\n\n", indent, alt, url));
        }
        _ => {
            // Unknown block type - try to extract any rich text
            let text = extract_rich_text_from_block(&block.data, &block.block_type);
            if !text.is_empty() {
                md.push_str(&format!("{}{}\n\n", indent, text));
            }
        }
    }

    // Handle nested children
    for child in &block.children {
        md.push_str(&block_to_markdown(child, depth + 1));
    }

    // Add extra newline after list groups
    if matches!(block.block_type.as_str(), "bulleted_list_item" | "numbered_list_item" | "to_do") {
        // Only add if no children (children already add newlines)
        if block.children.is_empty() {
            // Check if this is the last item by not adding extra newline here
            // The caller handles spacing between blocks
        }
    }

    md
}

/// Extract rich text content from a Notion block's data
fn extract_rich_text_from_block(block_data: &serde_json::Value, block_type: &str) -> String {
    block_data
        .get(block_type)
        .and_then(|bt| bt.get("rich_text"))
        .and_then(|rt| rt.as_array())
        .map(|arr| {
            arr.iter().filter_map(|t| {
                t.get("plain_text").and_then(|pt| pt.as_str())
            }).collect::<String>()
        })
        .unwrap_or_default()
}
