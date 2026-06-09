//! Email to note import module
//! Parses .eml files and converts them to formatted Markdown notes

use serde::{Deserialize, Serialize};

/// Parsed email structure
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParsedEmail {
    /// Sender address
    pub from: String,
    /// Recipient addresses (comma-separated)
    pub to: String,
    /// CC recipients
    pub cc: String,
    /// Email subject
    pub subject: String,
    /// Sent date as ISO 8601 string
    pub date: String,
    /// Plain text body
    pub body_text: String,
    /// HTML body (if available)
    pub body_html: Option<String>,
    /// Attachment filenames
    pub attachments: Vec<String>,
}

/// Parse a .eml file from its raw content and convert to ParsedEmail
pub fn parse_eml_content(raw_content: &[u8]) -> Result<ParsedEmail, String> {
    let mail = mailparse::parse_mail(raw_content).map_err(|e| format!("Failed to parse email: {}", e))?;

    let from = extract_header(&mail, "From");
    let to = extract_header(&mail, "To");
    let cc = extract_header(&mail, "Cc");
    let subject = extract_header(&mail, "Subject");
    let date_header = extract_header(&mail, "Date");

    // Try to parse date into ISO 8601
    let date = parse_email_date(&date_header).unwrap_or(date_header);

    // Extract text body
    let body_text = get_text_body(&mail);
    let body_html = get_html_body(&mail);

    // Extract attachment names
    let attachments: Vec<String> = mail.subparts.iter()
        .filter(|p| p.get_content_disposition().disposition == mailparse::DispositionType::Attachment)
        .filter_map(|p| {
            p.get_content_disposition()
                .params
                .get("filename")
                .cloned()
        })
        .collect();

    Ok(ParsedEmail {
        from,
        to,
        cc,
        subject,
        date,
        body_text,
        body_html,
        attachments,
    })
}

/// Parse a .eml file from disk
pub fn parse_eml_file(path: &std::path::Path) -> Result<ParsedEmail, String> {
    let content = std::fs::read(path)
        .map_err(|e| format!("Failed to read email file: {}", e))?;
    parse_eml_content(&content)
}

/// Convert a ParsedEmail to formatted Markdown note
pub fn email_to_markdown(email: &ParsedEmail) -> String {
    let mut md = String::new();

    // Frontmatter
    md.push_str("---\n");
    md.push_str(&format!("type: email\n"));
    md.push_str(&format!("from: \"{}\"\n", escape_yaml(&email.from)));
    md.push_str(&format!("to: \"{}\"\n", escape_yaml(&email.to)));
    if !email.cc.is_empty() {
        md.push_str(&format!("cc: \"{}\"\n", escape_yaml(&email.cc)));
    }
    md.push_str(&format!("date: \"{}\"\n", email.date));
    if !email.attachments.is_empty() {
        md.push_str(&format!("attachments: [{}]\n", email.attachments.iter()
            .map(|a| format!("\"{}\"", a))
            .collect::<Vec<_>>()
            .join(", ")));
    }
    md.push_str("---\n\n");

    // Title
    md.push_str(&format!("# {}\n\n", email.subject));

    // Metadata as blockquote
    md.push_str("> **From:** ");
    md.push_str(&email.from);
    md.push_str("\n>\n");

    md.push_str("> **To:** ");
    md.push_str(&email.to);
    md.push_str("\n>\n");

    if !email.cc.is_empty() {
        md.push_str("> **CC:** ");
        md.push_str(&email.cc);
        md.push_str("\n>\n");
    }

    md.push_str("> **Date:** ");
    md.push_str(&email.date);
    md.push_str("\n\n---\n\n");

    // Body content
    if !email.body_text.is_empty() {
        md.push_str(&email.body_text);
    } else if let Some(ref html) = email.body_html {
        // Simple HTML to text: strip tags
        let text = strip_html_tags(html);
        md.push_str(&text);
    }

    md.push_str("\n");

    md
}

/// Extract a header value from the parsed mail
fn extract_header(mail: &mailparse::ParsedMail, name: &str) -> String {
    mail.headers.iter()
        .find(|h| h.get_key().eq_ignore_ascii_case(name))
        .map(|h| h.get_value())
        .unwrap_or_default()
}

/// Extract the plain text body from a parsed mail
fn get_text_body(mail: &mailparse::ParsedMail) -> String {
    // Check if this part is text/plain
    if mail.ctype.mimetype == "text/plain" {
        return mail.get_body().unwrap_or_default();
    }

    // Check subparts
    for subpart in &mail.subparts {
        if subpart.ctype.mimetype == "text/plain" {
            return subpart.get_body().unwrap_or_default();
        }
    }

    // As last resort, check multipart/alternative for text/plain
    if mail.ctype.mimetype.starts_with("multipart/") {
        for subpart in &mail.subparts {
            let body = get_text_body(subpart);
            if !body.is_empty() {
                return body;
            }
        }
    }

    String::new()
}

/// Extract the HTML body from a parsed mail
fn get_html_body(mail: &mailparse::ParsedMail) -> Option<String> {
    if mail.ctype.mimetype == "text/html" {
        return Some(mail.get_body().unwrap_or_default());
    }

    for subpart in &mail.subparts {
        if subpart.ctype.mimetype == "text/html" {
            return Some(subpart.get_body().unwrap_or_default());
        }
    }

    if mail.ctype.mimetype.starts_with("multipart/") {
        for subpart in &mail.subparts {
            if let Some(body) = get_html_body(subpart) {
                return Some(body);
            }
        }
    }

    None
}

/// Try to parse an email date string to ISO 8601
fn parse_email_date(date_str: &str) -> Option<String> {
    // Handle common email date formats
    // e.g. "Mon, 15 Jan 2024 10:30:00 +0000"
    // Try chrono parsing with various formats
    let formats = [
        "%a, %d %b %Y %H:%M:%S %z",
        "%a, %d %b %Y %H:%M:%S %Z",
        "%d %b %Y %H:%M:%S %z",
        "%a, %d %b %Y %H:%M:%S",
    ];

    for fmt in &formats {
        if let Ok(dt) = chrono::DateTime::parse_from_str(date_str.trim(), fmt) {
            return Some(dt.to_rfc3339());
        }
    }

    // If all parsing fails, return the original trimmed string
    if !date_str.trim().is_empty() {
        Some(date_str.trim().to_string())
    } else {
        None
    }
}

/// Strip HTML tags from a string, keeping text content
fn strip_html_tags(html: &str) -> String {
    // Simple tag stripper - replace common tags with whitespace
    let mut result = String::new();
    let mut in_tag = false;

    for c in html.chars() {
        if c == '<' {
            in_tag = true;
        } else if c == '>' {
            in_tag = false;
            // Add newline after block-level tags
            result.push('\n');
        } else if !in_tag {
            result.push(c);
        }
    }

    // Decode common HTML entities
    result = result.replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&nbsp;", " ");

    // Collapse multiple blank lines
    let mut cleaned = String::new();
    let mut prev_blank = false;
    for line in result.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            if !prev_blank {
                cleaned.push('\n');
                prev_blank = true;
            }
        } else {
            cleaned.push_str(trimmed);
            cleaned.push('\n');
            prev_blank = false;
        }
    }

    cleaned.trim().to_string()
}

/// Escape special YAML characters in a string value
fn escape_yaml(s: &str) -> String {
    if s.contains('"') || s.contains('\n') || s.contains(':') || s.contains('#') {
        format!("\"{}\"", s.replace('\\', "\\\\").replace('"', "\\\""))
    } else {
        s.to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_simple_eml() {
        let eml = b"From: sender@example.com\r\n\
                     To: recipient@example.com\r\n\
                     Subject: Test Email\r\n\
                     Date: Mon, 15 Jan 2024 10:30:00 +0000\r\n\
                     Content-Type: text/plain; charset=utf-8\r\n\
                     \r\n\
                     This is a test email body.\n\
                     Hello world!";

        let email = parse_eml_content(eml).unwrap();
        assert_eq!(email.from, "sender@example.com");
        assert_eq!(email.to, "recipient@example.com");
        assert_eq!(email.subject, "Test Email");
        assert!(email.date.contains("2024-01-15"));
        assert!(email.body_text.contains("Hello world!"));
    }

    #[test]
    fn test_parse_multipart_eml() {
        let eml = b"From: alice@example.com\r\n\
                     To: bob@example.com\r\n\
                     Subject: Multipart Test\r\n\
                     Date: Tue, 20 Feb 2024 15:00:00 +0800\r\n\
                     MIME-Version: 1.0\r\n\
                     Content-Type: multipart/alternative; boundary=\"boundary123\"\r\n\
                     \r\n\
                     --boundary123\r\n\
                     Content-Type: text/plain; charset=utf-8\r\n\
                     \r\n\
                     Plain text body\r\n\
                     --boundary123\r\n\
                     Content-Type: text/html; charset=utf-8\r\n\
                     \r\n\
                     <html><body><p>HTML body</p></body></html>\r\n\
                     --boundary123--";

        let email = parse_eml_content(eml).unwrap();
        assert_eq!(email.from, "alice@example.com");
        assert!(email.body_text.contains("Plain text body"));
        assert!(email.body_html.is_some());
    }

    #[test]
    fn test_email_to_markdown() {
        let email = ParsedEmail {
            from: "sender@example.com".to_string(),
            to: "recipient@example.com".to_string(),
            cc: String::new(),
            subject: "Hello World".to_string(),
            date: "2024-01-15T10:30:00+00:00".to_string(),
            body_text: "This is the email body.\n\nBest regards,\nSender".to_string(),
            body_html: None,
            attachments: vec![],
        };

        let md = email_to_markdown(&email);
        assert!(md.contains("# Hello World"));
        assert!(md.contains("type: email"));
        assert!(md.contains("sender@example.com"));
        assert!(md.contains("This is the email body."));
    }

    #[test]
    fn test_strip_html_tags() {
        let html = "<p>Hello <b>world</b></p><p>Second paragraph</p>";
        let text = strip_html_tags(html);
        assert!(text.contains("Hello"));
        assert!(text.contains("world"));
        assert!(text.contains("Second paragraph"));
    }
}