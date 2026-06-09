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
