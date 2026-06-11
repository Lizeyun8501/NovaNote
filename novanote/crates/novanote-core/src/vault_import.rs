/// Sanitize a string to be a safe filename.
pub fn sanitize_filename(name: &str) -> String {
    name.chars()
        .map(|c| if c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == ' ' || c == '.' {
            c
        } else {
            '-'
        })
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

/// Clean Notion-exported markdown (remove duplicate frontmatter, etc.).
pub fn clean_notion_markdown(content: &str) -> String {
    let lines: Vec<&str> = content.lines().collect();
    if lines.len() < 3 {
        return content.to_string();
    }
    // Check if first 3 lines are all "---" (duplicate frontmatter from Notion export)
    if lines[0].trim() == "---" && lines[1].trim() == "---" && lines[2].trim() == "---" {
        // Skip the first two "---"
        let mut result = String::new();
        for (i, line) in lines.iter().enumerate() {
            if i == 0 || i == 1 {
                continue;
            }
            result.push_str(line);
            result.push('\n');
        }
        return result;
    }
    content.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sanitize_filename() {
        assert_eq!(sanitize_filename("hello world.md"), "hello world.md");
        assert_eq!(sanitize_filename("hello/world"), "hello-world");
    }

    #[test]
    fn test_clean_notion_markdown_no_op() {
        let content = "# Title\n\nContent\n";
        assert_eq!(clean_notion_markdown(content), content);
    }
}