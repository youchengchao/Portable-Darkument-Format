// Initialize settings on installation
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get([
    'active',
    'mode',
    'theme',
    'brightness',
    'contrast',
    'grayscale',
    'invertImages'
  ], (result) => {
    const defaults = {
      active: true,
      mode: 'enhanced', // Set 'enhanced' as default for robust PDF interception
      theme: 'dark',     // 'dark', 'warm', 'cool', 'sepia', 'mono'
      brightness: 90,    // percentage
      contrast: 100,     // percentage
      grayscale: 0,      // percentage
      invertImages: false
    };

    const updates = {};
    for (const key in defaults) {
      if (result[key] === undefined) {
        updates[key] = defaults[key];
      }
    }

    if (Object.keys(updates).length > 0) {
      chrome.storage.local.set(updates);
    }
  });
});

// Helper to check if URL is a PDF file based on path
function isPdfUrl(url) {
  try {
    const parsed = new URL(url);
    const pathname = parsed.pathname.toLowerCase();
    // Exclude cases where it's our own viewer
    if (url.includes('viewer.html')) {
      return false;
    }
    return pathname.endsWith('.pdf') || parsed.search.includes('pdf=true');
  } catch (e) {
    return false;
  }
}

// Redirect tab to custom viewer
function redirectToViewer(tabId, url) {
  const viewerPrefix = chrome.runtime.getURL('viewer.html');
  const isNative = url.includes('native=true');
  if (url.startsWith(viewerPrefix) || isNative) {
    return;
  }
  const viewerUrl = viewerPrefix + '?file=' + encodeURIComponent(url);
  chrome.tabs.update(tabId, { url: viewerUrl });
}

// 1. Intercept via webNavigation (URL checks - catches file:/// URLs)
chrome.webNavigation.onBeforeNavigate.addListener((details) => {
  // Only target main frame page load
  if (details.frameId === 0 && details.url) {
    chrome.storage.local.get(['active', 'mode'], (settings) => {
      if (settings.active && settings.mode === 'enhanced' && isPdfUrl(details.url)) {
        redirectToViewer(details.tabId, details.url);
      }
    });
  }
});

// 2. Intercept via webRequest Content-Type detection (for dynamic PDFs)
chrome.webRequest.onHeadersReceived.addListener(
  (details) => {
    // Only care about main frame document loads
    if (details.tabId !== -1 && details.type === 'main_frame' && details.url) {
      const contentTypeHeader = details.responseHeaders.find(
        h => h.name.toLowerCase() === 'content-type'
      );
      if (contentTypeHeader && contentTypeHeader.value.toLowerCase().includes('application/pdf')) {
        chrome.storage.local.get(['active', 'mode'], (settings) => {
          if (settings.active && settings.mode === 'enhanced') {
            redirectToViewer(details.tabId, details.url);
          }
        });
      }
    }
  },
  { urls: ['<all_urls>'] },
  ['responseHeaders']
);

// 3. Messaging receiver
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'pdf_detected') {
    const tabId = sender.tab ? sender.tab.id : null;
    if (tabId) {
      chrome.storage.local.get(['active', 'mode'], (settings) => {
        if (settings.active && settings.mode === 'enhanced') {
          redirectToViewer(tabId, message.url);
        }
      });
    }
  }
});
