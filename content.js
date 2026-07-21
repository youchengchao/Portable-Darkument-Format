// Helper to check if the current document is a PDF
function isPdf() {
  if (window.location.search.includes('native=true') || window.location.hash.includes('native=true')) {
    return false;
  }
  if (document.contentType === 'application/pdf') {
    return true;
  }
  // Check URL pathname
  try {
    const url = new URL(window.location.href);
    if (url.pathname.toLowerCase().endsWith('.pdf')) {
      return true;
    }
  } catch (e) {
    // Ignore invalid URLs
  }
  return false;
}

// Function to apply the classic dark theme CSS filters
function applyClassicTheme(settings) {
  let styleEl = document.getElementById('pdf-dark-style');
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = 'pdf-dark-style';
    (document.head || document.documentElement).appendChild(styleEl);
  }

  if (!settings.active || settings.mode !== 'classic') {
    styleEl.textContent = '';
    return;
  }

  const filterParts = [];
  
  // Base inversion theme
  switch (settings.theme) {
    case 'dark':
      filterParts.push('invert(0.9) hue-rotate(180deg)');
      break;
    case 'warm':
      filterParts.push('invert(0.9) hue-rotate(180deg) sepia(0.35)');
      break;
    case 'cool':
      filterParts.push('invert(0.9) hue-rotate(200deg)');
      break;
    case 'sepia':
      filterParts.push('sepia(0.7) contrast(0.95) brightness(0.95)');
      break;
    case 'mono':
      filterParts.push('invert(0.9) hue-rotate(180deg) grayscale(1)');
      break;
    default:
      filterParts.push('invert(0.9) hue-rotate(180deg)');
  }

  // Adjustments
  if (settings.brightness !== undefined && settings.brightness !== 100) {
    filterParts.push(`brightness(${settings.brightness / 100})`);
  }
  if (settings.contrast !== undefined && settings.contrast !== 100) {
    filterParts.push(`contrast(${settings.contrast / 100})`);
  }
  if (settings.grayscale !== undefined && settings.grayscale > 0) {
    filterParts.push(`grayscale(${settings.grayscale / 100})`);
  }

  const filterString = filterParts.join(' ');

  styleEl.textContent = `
    html {
      filter: ${filterString} !important;
      background-color: #121212 !important;
    }
    body {
      background-color: #121212 !important;
    }
    embed[type="application/pdf"], iframe[type="application/pdf"], object[type="application/pdf"] {
      background-color: #121212 !important;
    }
  `;
}

// Initial application
if (isPdf()) {
  chrome.storage.local.get(null, (settings) => {
    if (settings.active && settings.mode === 'enhanced') {
      chrome.runtime.sendMessage({ action: 'pdf_detected', url: window.location.href });
    } else {
      applyClassicTheme(settings);
    }
  });
}

// Listen for updates from the popup controls
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && isPdf()) {
    chrome.storage.local.get(null, (settings) => {
      if (settings.active && settings.mode === 'enhanced') {
        chrome.runtime.sendMessage({ action: 'pdf_detected', url: window.location.href });
      } else {
        applyClassicTheme(settings);
      }
    });
  }
});
