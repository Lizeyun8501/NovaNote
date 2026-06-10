//! WeChat save assistant
//! Provides an HTTP endpoint that receives forwarded WeChat articles
//! and converts them to Markdown notes

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WeChatArticle {
    pub title: String,
    pub url: String,
    pub author: Option<String>,
    pub content_html: Option<String>,
    pub content_text: Option<String>,
    pub published_at: Option<String>,
}

/// Parse a WeChat article from its HTML content
pub fn parse_wechat_article(html: &str, url: &str) -> WeChatArticle {
    // Extract title from <h1> or <title> tag
    let title = extract_tag_content(html, "h1")
        .or_else(|| extract_tag_content(html, "title"))
        .unwrap_or_else(|| "WeChat Article".to_string());

    // Extract author
    let author = extract_meta_content(html, "author")
        .or_else(|| extract_meta_content(html, "og:article:author"));

    // Extract publish date
    let published_at = extract_meta_content(html, "article:published_time")
        .or_else(|| extract_meta_content(html, "og:article:published_time"));

    // Extract main content (simplified)
    let content_text = extract_article_body(html);
    let content_html = extract_tag_content_full(html, "div", "id", "js_content")
        .or_else(|| extract_tag_content_full(html, "article", "", ""));

    WeChatArticle {
        title,
        url: url.to_string(),
        author,
        content_html,
        content_text: Some(content_text),
        published_at,
    }
}

/// Convert a WeChat article to Markdown
pub fn wechat_to_markdown(article: &WeChatArticle) -> String {
    let mut md = String::new();

    // Frontmatter
    md.push_str("---\n");
    md.push_str(&format!("source: wechat\n"));
    md.push_str(&format!("url: \"{}\"\n", article.url));
    if let Some(ref author) = article.author {
        md.push_str(&format!("author: \"{}\"\n", author));
    }
    if let Some(ref date) = article.published_at {
        md.push_str(&format!("published_at: \"{}\"\n", date));
    }
    md.push_str("---\n\n");

    // Title
    md.push_str(&format!("# {}\n\n", article.title));

    // Meta
    if let Some(ref author) = article.author {
        md.push_str(&format!("> Author: {}\n", author));
    }
    md.push_str(&format!("> Source: [WeChat Article]({})\n\n", article.url));

    md.push_str("---\n\n");

    // Content
    if let Some(ref text) = article.content_text {
        md.push_str(text);
    }

    md.push('\n');
    md
}

fn extract_tag_content(html: &str, tag: &str) -> Option<String> {
    let open = format!("<{}>", tag);
    let close = format!("</{}>", tag);
    let start = html.find(&open)?;
    let end = html.find(&close)?;
    let content = &html[start + open.len()..end];
    Some(strip_html_tags(content).trim().to_string())
}

fn extract_meta_content(html: &str, name: &str) -> Option<String> {
    let pattern = format!("meta name=\"{}\" content=\"", name);
    let alt_pattern = format!("meta property=\"{}\" content=\"", name);

    for pat in [&pattern, &alt_pattern] {
        if let Some(start) = html.find(pat) {
            let content_start = start + pat.len();
            if let Some(end) = html[content_start..].find('"') {
                return Some(html[content_start..content_start + end].to_string());
            }
        }
    }
    None
}

fn extract_article_body(html: &str) -> String {
    // Try to find the WeChat article content div
    if let Some(content) = extract_tag_content_full(html, "div", "id", "js_content") {
        return strip_html_tags(&content);
    }
    if let Some(content) = extract_tag_content_full(html, "article", "", "") {
        return strip_html_tags(&content);
    }
    strip_html_tags(html)
}

fn extract_tag_content_full(html: &str, tag: &str, attr: &str, value: &str) -> Option<String> {
    let search = if attr.is_empty() {
        format!("<{}>", tag)
    } else {
        format!("<{} {}=\"{}\">", tag, attr, value)
    };
    let start = html.find(&search)?;
    let close = format!("</{}>", tag);
    let end = html[start..].find(&close)?;
    Some(html[start..start + end + close.len()].to_string())
}

fn strip_html_tags(html: &str) -> String {
    let mut result = String::new();
    let mut in_tag = false;
    for c in html.chars() {
        if c == '<' { in_tag = true; }
        else if c == '>' { in_tag = false; result.push(' '); }
        else if !in_tag { result.push(c); }
    }
    result.replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&nbsp;", " ")
        .lines()
        .map(|l| l.trim())
        .filter(|l| !l.is_empty())
        .collect::<Vec<_>>()
        .join("\n")
}
