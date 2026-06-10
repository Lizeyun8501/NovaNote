// NovaNote Web Clipper - Popup Script

document.addEventListener('DOMContentLoaded', () => {
  const clipBtn = document.getElementById('clipBtn');
  const titleInput = document.getElementById('title');
  const tagsInput = document.getElementById('tags');
  const folderSelect = document.getElementById('folder');
  const serverUrlInput = document.getElementById('serverUrl');
  const statusDiv = document.getElementById('status');
  const modeButtons = document.querySelectorAll('.clip-mode');

  let clipMode = 'full';

  // Load saved server URL
  chrome.storage?.local?.get(['novanoteServerUrl'], (result) => {
    if (result.novanoteServerUrl) {
      serverUrlInput.value = result.novanoteServerUrl;
    }
  });

  // Save server URL on change
  serverUrlInput.addEventListener('change', () => {
    chrome.storage?.local?.set({ novanoteServerUrl: serverUrlInput.value });
  });

  // Mode selection
  modeButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      modeButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      clipMode = btn.dataset.mode;
    });
  });

  // Get current tab info
  chrome.tabs?.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
      titleInput.value = tabs[0].title || '';
    }
  });

  // Clip button handler
  clipBtn.addEventListener('click', async () => {
    clipBtn.disabled = true;
    statusDiv.className = 'status';
    statusDiv.textContent = '';

    try {
      const serverUrl = serverUrlInput.value.trim();
      const title = titleInput.value.trim();
      const tags = tagsInput.value.split(',').map(t => t.trim()).filter(Boolean);
      const folder = folderSelect.value;

      // Get page content
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      let content = '';
      let url = '';
      let description = '';

      if (tab) {
        url = tab.url || '';

        if (clipMode === 'bookmark') {
          // Bookmark mode: just save URL and meta
          description = tab.title || '';
          content = `# ${title}\n\n> [!bookmark] Bookmark\n> **URL:** ${url}\n> **Saved:** ${new Date().toISOString()}\n\n${description ? `> ${description}\n` : ''}`;
        } else {
          // Full page or selection mode: extract content from page
          const results = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: extractPageContent,
            args: [clipMode],
          });

          if (results && results[0]) {
            content = results[0].result;
          }

          if (!content) {
            throw new Error('No content extracted from page');
          }

          // Format as Markdown note
          const tagsLine = tags.length > 0 ? `\ntags: [${tags.map(t => `"${t}"`).join(', ')}]` : '';
          content = `---\nsource: "${url}"\ntype: web-clip\nclipped_at: "${new Date().toISOString()}"${tagsLine}\n---\n\n# ${title}\n\n${content}`;
        }

        // Send to NovaNote server
        const response = await fetch(`${serverUrl}/api/v1/clip`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title,
            content,
            folder,
            tags,
            source_url: url,
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Server error: ${response.status} - ${errorText}`);
        }

        statusDiv.className = 'status success';
        statusDiv.textContent = 'Clipped successfully!';
      }
    } catch (err) {
      statusDiv.className = 'status error';
      statusDiv.textContent = `Error: ${err.message}`;
    } finally {
      clipBtn.disabled = false;
    }
  });
});

// This function runs in the context of the web page
function extractPageContent(mode) {
  if (mode === 'selection') {
    const selection = window.getSelection();
    if (selection && selection.toString().trim()) {
      return selection.toString();
    }
    // Fallback to full page if no selection
  }

  // Full page extraction: convert DOM to simplified Markdown
  function domToMarkdown(element) {
    let md = '';

    for (const node of element.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        md += node.textContent;
        continue;
      }

      if (node.nodeType !== Node.ELEMENT_NODE) continue;

      const tag = node.tagName.toLowerCase();

      // Skip hidden elements, scripts, styles, nav, footer
      if (['script', 'style', 'nav', 'footer', 'header', 'aside', 'noscript', 'svg', 'iframe'].includes(tag)) {
        continue;
      }

      // Skip hidden elements
      const style = window.getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden') continue;

      switch (tag) {
        case 'h1': md += `\n# ${node.textContent.trim()}\n\n`; break;
        case 'h2': md += `\n## ${node.textContent.trim()}\n\n`; break;
        case 'h3': md += `\n### ${node.textContent.trim()}\n\n`; break;
        case 'h4': md += `\n#### ${node.textContent.trim()}\n\n`; break;
        case 'h5': md += `\n##### ${node.textContent.trim()}\n\n`; break;
        case 'h6': md += `\n###### ${node.textContent.trim()}\n\n`; break;
        case 'p': md += `${domToMarkdown(node)}\n\n`; break;
        case 'br': md += '\n'; break;
        case 'strong': case 'b': md += `**${node.textContent}**`; break;
        case 'em': case 'i': md += `*${node.textContent}*`; break;
        case 'code': md += `\`${node.textContent}\``; break;
        case 'pre': md += `\n\`\`\`\n${node.textContent}\n\`\`\`\n\n`; break;
        case 'blockquote': md += `> ${node.textContent.trim().replace(/\n/g, '\n> ')}\n\n`; break;
        case 'ul': case 'ol':
          const items = node.querySelectorAll(':scope > li');
          items.forEach((li, i) => {
            const prefix = tag === 'ol' ? `${i + 1}. ` : '- ';
            md += `${prefix}${li.textContent.trim()}\n`;
          });
          md += '\n';
          break;
        case 'a':
          const href = node.getAttribute('href') || '';
          md += `[${node.textContent}](${href})`;
          break;
        case 'img':
          const src = node.getAttribute('src') || '';
          const alt = node.getAttribute('alt') || '';
          md += `![${alt}](${src})\n\n`;
          break;
        case 'hr': md += '\n---\n\n'; break;
        case 'table':
          const rows = node.querySelectorAll('tr');
          rows.forEach((row, rowIdx) => {
            const cells = row.querySelectorAll('th, td');
            const cellTexts = Array.from(cells).map(c => c.textContent.trim());
            md += `| ${cellTexts.join(' | ')} |\n`;
            if (rowIdx === 0) {
              md += `| ${cellTexts.map(() => '---').join(' | ')} |\n`;
            }
          });
          md += '\n';
          break;
        default:
          md += domToMarkdown(node);
          break;
      }
    }

    return md;
  }

  // Find the main content area
  const article = document.querySelector('article') ||
    document.querySelector('[role="main"]') ||
    document.querySelector('main') ||
    document.querySelector('.post-content') ||
    document.querySelector('.article-content') ||
    document.body;

  let content = domToMarkdown(article);

  // Clean up excessive whitespace
  content = content.replace(/\n{3,}/g, '\n\n').trim();

  return content;
}