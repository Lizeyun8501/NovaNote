// NovaNote Web Clipper - Background Service Worker

// Handle messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'clip') {
    // Forward clip request to NovaNote server
    handleClip(message.data)
      .then(result => sendResponse({ success: true, data: result }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true; // Keep message channel open for async response
  }
});

async function handleClip(data) {
  const { serverUrl, title, content, folder, tags, sourceUrl } = data;

  const response = await fetch(`${serverUrl}/api/v1/clip`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title,
      content,
      folder,
      tags,
      source_url: sourceUrl,
    }),
  });

  if (!response.ok) {
    throw new Error(`Server error: ${response.status}`);
  }

  return await response.json();
}

// Context menu for right-click clipping
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus?.create({
    id: 'clip-page',
    title: 'Clip to NovaNote',
    contexts: ['page', 'selection'],
  });

  chrome.contextMenus?.create({
    id: 'clip-link',
    title: 'Clip Link to NovaNote',
    contexts: ['link'],
  });
});

chrome.contextMenus?.onClicked.addListener(async (info, tab) => {
  const serverUrl = (await chrome.storage?.local?.get(['novanoteServerUrl']))?.novanoteServerUrl || 'http://localhost:3000';

  if (info.menuItemId === 'clip-page') {
    const title = tab?.title || 'Untitled';
    const content = info.selectionText || '';
    const url = tab?.url || '';

    try {
      await fetch(`${serverUrl}/api/v1/clip`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          content: content || `Clipped from: ${url}`,
          folder: 'clippings',
          tags: ['web-clip'],
          source_url: url,
        }),
      });
    } catch (e) {
      console.error('Clip failed:', e);
    }
  } else if (info.menuItemId === 'clip-link') {
    const url = info.linkUrl || '';
    const title = `Link: ${url}`;

    try {
      await fetch(`${serverUrl}/api/v1/clip`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          content: `# ${title}\n\n${url}\n`,
          folder: 'reading-list',
          tags: ['bookmark'],
          source_url: url,
        }),
      });
    } catch (e) {
      console.error('Clip link failed:', e);
    }
  }
});