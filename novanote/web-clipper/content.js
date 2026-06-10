// NovaNote Web Clipper - Content Script
// Runs on every page, provides selection detection

// Listen for messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'getSelection') {
    const selection = window.getSelection();
    sendResponse({
      hasSelection: selection && selection.toString().trim().length > 0,
      text: selection ? selection.toString() : '',
    });
  }
  return false;
});