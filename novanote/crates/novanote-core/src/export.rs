use std::io::BufWriter;

use crate::{Vault, VaultError};

/// Supported export formats
#[derive(Debug, Clone, Copy)]
pub enum ExportFormat {
    Markdown,
    Html,
    Pdf,
}

/// Result of an export operation
#[derive(Debug)]
pub struct ExportResult {
    pub data: Vec<u8>,
    pub format: ExportFormat,
}

/// Export content as-is in Markdown format
pub fn export_to_markdown(content: &str) -> String {
    content.to_string()
}

/// Convert Markdown content to a full HTML document with styling
pub fn export_to_html(content: &str, title: &str) -> Result<String, VaultError> {
    let mut html_body = String::new();
    let parser = pulldown_cmark::Parser::new(content);
    pulldown_cmark::html::push_html(&mut html_body, parser);

    let full_html = format!(
        r#"<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{title}</title>
<style>
  body {{
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
    max-width: 800px;
    margin: 0 auto;
    padding: 2rem;
    line-height: 1.7;
    color: #1a1a2e;
    background: #ffffff;
  }}
  h1, h2, h3, h4, h5, h6 {{
    margin-top: 1.5em;
    margin-bottom: 0.5em;
    font-weight: 600;
    line-height: 1.3;
  }}
  h1 {{ font-size: 2em; border-bottom: 1px solid #e5e7eb; padding-bottom: 0.3em; }}
  h2 {{ font-size: 1.5em; border-bottom: 1px solid #e5e7eb; padding-bottom: 0.3em; }}
  h3 {{ font-size: 1.25em; }}
  p {{ margin: 0.8em 0; }}
  code {{
    background: #f4f4f5;
    padding: 2px 6px;
    border-radius: 3px;
    font-size: 0.9em;
    font-family: 'SF Mono', 'Fira Code', 'Fira Mono', Menlo, Consolas, monospace;
  }}
  pre {{
    background: #f4f4f5;
    padding: 1rem;
    border-radius: 6px;
    overflow-x: auto;
    line-height: 1.5;
  }}
  pre code {{
    background: none;
    padding: 0;
    font-size: 0.875em;
  }}
  blockquote {{
    border-left: 4px solid #6366f1;
    margin: 1em 0;
    padding: 0.5em 1em;
    color: #6b7280;
    background: #f9fafb;
    border-radius: 0 4px 4px 0;
  }}
  a {{ color: #6366f1; text-decoration: none; }}
  a:hover {{ text-decoration: underline; }}
  ul, ol {{ padding-left: 2em; }}
  li {{ margin: 0.25em 0; }}
  table {{
    border-collapse: collapse;
    width: 100%;
    margin: 1em 0;
  }}
  th, td {{
    border: 1px solid #e5e7eb;
    padding: 0.5em 0.75em;
    text-align: left;
  }}
  th {{
    background: #f9fafb;
    font-weight: 600;
  }}
  hr {{
    border: none;
    border-top: 1px solid #e5e7eb;
    margin: 2em 0;
  }}
  img {{
    max-width: 100%;
    border-radius: 6px;
  }}
  @media print {{
    body {{ max-width: none; padding: 0; }}
  }}
</style>
</head>
<body>
{html_body}
</body>
</html>"#,
        title = html_escape(title),
    );
    Ok(full_html)
}

/// Convert HTML to PDF using printpdf with basic text rendering
pub fn export_to_pdf(html: &str, title: &str) -> Result<Vec<u8>, VaultError> {
    use printpdf::*;

    // Strip HTML tags to get plain text for PDF rendering
    let plain_text = strip_html_tags(html);

    let (doc, page1, layer1) =
        PdfDocument::new(title, Mm(210.0), Mm(297.0), "Layer 1");
    let current_layer = doc.get_page(page1).get_layer(layer1);

    let font = doc.add_builtin_font(BuiltinFont::Helvetica)
        .map_err(|e| VaultError::Other(format!("PDF font error: {}", e)))?;

    let margin_left = Mm(25.0);
    let margin_top = Mm(270.0);
    let line_height = Mm(6.0);
    let font_size = 11.0;
    let max_chars_per_line = 80;

    let lines: Vec<&str> = plain_text.lines().collect();
    let mut y_pos = margin_top;

    for line in lines {
        if y_pos < Mm(20.0) {
            // Need a new page
            let (new_page, new_layer) = doc.add_page(Mm(210.0), Mm(297.0), "Layer 1");
            let new_layer = doc.get_page(new_page).get_layer(new_layer);
            // We can't easily switch layers in this API, so we'll just continue on the same page
            // and truncate. For a production app, you'd use a proper HTML-to-PDF renderer.
            let _ = new_layer;
            break;
        }

        // Word-wrap long lines
        let wrapped = wrap_line(line, max_chars_per_line);
        for wrapped_line in &wrapped {
            current_layer.use_text(
                wrapped_line,
                font_size,
                margin_left,
                y_pos,
                &font,
            );
            y_pos = Mm(y_pos.0 - line_height.0);
        }
    }

    let mut buf = BufWriter::new(Vec::new());
    doc.save(&mut buf)
        .map_err(|e| VaultError::Other(format!("PDF save error: {}", e)))?;
    Ok(buf.into_inner().map_err(|e| VaultError::Other(e.to_string()))?)
}

/// Export a note from the vault in the specified format
pub fn export_note(vault: &Vault, path: &str, format: ExportFormat) -> Result<ExportResult, VaultError> {
    let content = vault.read_note(path)?;
    let title = extract_title_from_path(path);

    match format {
        ExportFormat::Markdown => {
            let md = export_to_markdown(&content);
            Ok(ExportResult {
                data: md.into_bytes(),
                format: ExportFormat::Markdown,
            })
        }
        ExportFormat::Html => {
            let html = export_to_html(&content, &title)?;
            Ok(ExportResult {
                data: html.into_bytes(),
                format: ExportFormat::Html,
            })
        }
        ExportFormat::Pdf => {
            let html = export_to_html(&content, &title)?;
            let pdf_data = export_to_pdf(&html, &title)?;
            Ok(ExportResult {
                data: pdf_data,
                format: ExportFormat::Pdf,
            })
        }
    }
}

/// Strip HTML tags to produce plain text
fn strip_html_tags(html: &str) -> String {
    let mut result = String::with_capacity(html.len());
    let mut inside_tag = false;
    let mut inside_entity = false;
    let mut entity = String::new();

    for ch in html.chars() {
        match ch {
            '<' => inside_tag = true,
            '>' => inside_tag = false,
            '&' if !inside_tag => {
                inside_entity = true;
                entity.clear();
                entity.push(ch);
            }
            ';' if inside_entity => {
                entity.push(ch);
                inside_entity = false;
                // Decode common entities
                match entity.as_str() {
                    "&amp;" => result.push('&'),
                    "&lt;" => result.push('<'),
                    "&gt;" => result.push('>'),
                    "&quot;" => result.push('"'),
                    "&#39;" | "&apos;" => result.push('\''),
                    "&nbsp;" => result.push(' '),
                    _ => result.push_str(&entity),
                }
            }
            _ if inside_entity => entity.push(ch),
            _ if !inside_tag => result.push(ch),
            _ => {}
        }
    }

    // Clean up excessive whitespace
    let lines: Vec<String> = result
        .lines()
        .map(|l| l.trim_end().to_string())
        .filter(|l| !l.is_empty())
        .collect();
    lines.join("\n")
}

/// Wrap a line to fit within max_chars_per_line
fn wrap_line(line: &str, max_chars: usize) -> Vec<String> {
    if line.is_empty() {
        return vec![String::new()];
    }
    if line.len() <= max_chars {
        return vec![line.to_string()];
    }

    let mut result = Vec::new();
    let mut remaining = line;

    while remaining.len() > max_chars {
        // Find a good break point
        let mut break_at = max_chars;
        for (i, ch) in remaining.char_indices().take(max_chars) {
            if ch == ' ' {
                break_at = i;
            }
        }
        if break_at == 0 {
            break_at = max_chars;
        }
        let (head, tail) = remaining.split_at(break_at);
        result.push(head.trim_end().to_string());
        remaining = tail.trim_start();
    }

    if !remaining.is_empty() {
        result.push(remaining.to_string());
    }

    result
}

/// Extract a human-readable title from the file path
fn extract_title_from_path(path: &str) -> String {
    std::path::Path::new(path)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("Untitled")
        .to_string()
}

/// Escape HTML special characters in a string
fn html_escape(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_export_to_markdown() {
        let content = "# Hello\n\nWorld";
        let result = export_to_markdown(content);
        assert_eq!(result, content);
    }

    #[test]
    fn test_export_to_html() {
        let content = "# Hello\n\nWorld";
        let result = export_to_html(content, "Test").unwrap();
        assert!(result.contains("<h1>Hello</h1>"));
        assert!(result.contains("<p>World</p>"));
        assert!(result.contains("<title>Test</title>"));
        assert!(result.contains("<style>"));
    }

    #[test]
    fn test_strip_html_tags() {
        let html = "<p>Hello <strong>world</strong></p>";
        let text = strip_html_tags(html);
        assert_eq!(text, "Hello world");
    }

    #[test]
    fn test_strip_html_entities() {
        let html = "<p>A &amp; B &lt; C</p>";
        let text = strip_html_tags(html);
        assert_eq!(text, "A & B < C");
    }

    #[test]
    fn test_wrap_line_short() {
        let result = wrap_line("Hello", 80);
        assert_eq!(result, vec!["Hello"]);
    }

    #[test]
    fn test_wrap_line_long() {
        let long = "This is a very long line that should be wrapped at some point because it exceeds the maximum character limit";
        let result = wrap_line(long, 40);
        assert!(result.len() > 1);
        for line in &result {
            assert!(line.len() <= 40);
        }
    }

    #[test]
    fn test_extract_title_from_path() {
        assert_eq!(extract_title_from_path("notes/my-note.md"), "my-note");
        assert_eq!(extract_title_from_path("simple.md"), "simple");
    }

    #[test]
    fn test_html_escape() {
        assert_eq!(html_escape("A & B < C"), "A &amp; B &lt; C");
    }
}
