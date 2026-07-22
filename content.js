// Helper to check if the current document is a PDF
function isPdf() {
  if (typeof window === 'undefined' || !window.location) return false;
  if (window.location.search.includes('native=true') || window.location.hash.includes('native=true')) {
    return false;
  }
  if (typeof document !== 'undefined' && document.contentType === 'application/pdf') {
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

// Clamp number helper
function clampNumber(val, min, max, defaultVal) {
  if (val === null || val === undefined || typeof val !== 'number' || isNaN(val)) {
    return defaultVal;
  }
  return Math.max(min, Math.min(max, val));
}

// Sanitize settings object with full fallbacks for edge cases
function sanitizeSettings(rawSettings) {
  const safe = {
    active: false,
    mode: 'classic',
    theme: 'oled',
    brightness: 100,
    contrast: 100,
    grayscale: 0,
    protectDiagrams: true
  };

  if (!rawSettings || typeof rawSettings !== 'object') {
    return safe;
  }

  if (typeof rawSettings.active === 'boolean') {
    safe.active = rawSettings.active;
  } else if (rawSettings.active !== undefined) {
    safe.active = Boolean(rawSettings.active);
  }

  if (typeof rawSettings.mode === 'string' && ['classic', 'enhanced'].includes(rawSettings.mode.toLowerCase())) {
    safe.mode = rawSettings.mode.toLowerCase();
  }

  if (typeof rawSettings.theme === 'string') {
    const t = rawSettings.theme.toLowerCase();
    if (['oled', 'sepia', 'slate', 'mono', 'classic', 'dark', 'warm', 'cool'].includes(t)) {
      safe.theme = t;
    }
  }

  safe.brightness = clampNumber(rawSettings.brightness, 0, 200, 100);
  safe.contrast = clampNumber(rawSettings.contrast, 0, 200, 100);
  safe.grayscale = clampNumber(rawSettings.grayscale, 0, 100, 0);

  if (rawSettings.protectDiagrams !== undefined) {
    safe.protectDiagrams = Boolean(rawSettings.protectDiagrams);
  }

  return safe;
}

function isProtectedElement(elementOrTagName) {
  if (!elementOrTagName) return false;

  let tagName = '';
  let el = null;

  if (typeof elementOrTagName === 'string') {
    tagName = elementOrTagName.toLowerCase();
  } else if (typeof elementOrTagName === 'object') {
    el = elementOrTagName;
    tagName = (el.tagName || '').toLowerCase();
  }

  const validTags = ['img', 'svg', 'canvas', 'image'];
  if (validTags.includes(tagName)) {
    return true;
  }

  if (el) {
    if (el.dataset && (el.dataset.isDiagram || el.dataset.diagram)) return true;
    if (el.classList && (
      el.classList.contains('protected-diagram') ||
      el.classList.contains('image-layer') ||
      el.classList.contains('diagram-container')
    )) {
      return true;
    }
    if (typeof el.getAttribute === 'function' && el.getAttribute('role') === 'img') return true;
  }

  return false;
}

function getReverseFilter(protectDiagrams) {
  return protectDiagrams ? 'invert(1) hue-rotate(180deg)' : 'none';
}

function tagProtectedElements(container) {
  const root = container || (typeof document !== 'undefined' ? document : null);
  if (!root || typeof root.querySelectorAll !== 'function') return [];

  const elements = root.querySelectorAll('img, svg, canvas:not(#pdf-view-area canvas), [data-is-diagram="true"], [data-diagram="true"], .diagram-container, [role="img"]');
  const tagged = [];

  elements.forEach(el => {
    if (isProtectedElement(el)) {
      el.classList.add('protected-diagram');
      tagged.push(el);
    }
  });

  return tagged;
}

// Function to apply the classic dark theme CSS filters
function applyClassicTheme(rawSettings) {
  const settings = sanitizeSettings(rawSettings);
  let styleEl = typeof document !== 'undefined' ? document.getElementById('pdf-dark-style') : null;
  if (!styleEl && typeof document !== 'undefined' && (document.head || document.documentElement)) {
    styleEl = document.createElement('style');
    styleEl.id = 'pdf-dark-style';
    (document.head || document.documentElement).appendChild(styleEl);
  }

  if (!rawSettings || !settings.active || settings.mode !== 'classic') {
    if (styleEl) styleEl.textContent = '';
    return;
  }

  const filterParts = [];
  
  // Base inversion theme
  switch (settings.theme) {
    case 'dark':
    case 'oled':
      filterParts.push('invert(0.9) hue-rotate(180deg)');
      break;
    case 'warm':
    case 'sepia':
      filterParts.push('invert(0.9) hue-rotate(180deg) sepia(0.35)');
      break;
    case 'cool':
    case 'slate':
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
  if (settings.brightness !== 100) {
    filterParts.push(`brightness(${settings.brightness / 100})`);
  }
  if (settings.contrast !== 100) {
    filterParts.push(`contrast(${settings.contrast / 100})`);
  }
  if (settings.grayscale > 0) {
    filterParts.push(`grayscale(${settings.grayscale / 100})`);
  }

  const filterString = filterParts.join(' ');
  const protectDiagrams = settings.protectDiagrams !== false;
  const diagramFilter = getReverseFilter(protectDiagrams);

  if (styleEl) {
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
      img, svg, canvas:not(#pdf-view-area canvas), .protected-diagram {
        filter: ${diagramFilter} !important;
      }
    `;
  }

  if (typeof document !== 'undefined') {
    tagProtectedElements(document);
  }

  if (rawSettings) {
    applyBionicReading(document, rawSettings.bionicReading === true);
    updateContentReadingRuler(rawSettings.readingRuler === true, rawSettings.rulerHeight || 40);
  }
}

// Bionic Reading & Reading Ruler Content Script Helpers
function transformWordToBionic(word) {
  if (!word || word.trim().length === 0) return word;
  const match = word.match(/^(\s*[\W_]*)([\w\u00C0-\u024F]+)([\W_]*\s*)$/);
  if (!match) {
    const len = word.length;
    const highlightLen = Math.max(1, Math.ceil(len * 0.45));
    const prefix = word.substring(0, highlightLen);
    const suffix = word.substring(highlightLen);
    return `<b class="bionic-bold">${prefix}</b>${suffix}`;
  }
  const [, leading, core, trailing] = match;
  const len = core.length;
  const highlightLen = Math.max(1, Math.ceil(len * 0.45));
  const prefix = core.substring(0, highlightLen);
  const suffix = core.substring(highlightLen);
  return `${leading}<b class="bionic-bold">${prefix}</b>${suffix}${trailing}`;
}

function transformTextToBionic(text) {
  if (!text) return '';
  return text.split(' ').map(transformWordToBionic).join(' ');
}

function applyBionicReading(container, enabled = true) {
  if (typeof document === 'undefined') return;
  const root = container || document;
  const targets = root.querySelectorAll ? root.querySelectorAll('p, span, h1, h2, h3, h4, h5, h6, div.textLayer span') : [];

  targets.forEach(el => {
    if (enabled) {
      if (el.dataset.originalText === undefined) {
        el.dataset.originalText = el.textContent;
      }
      el.innerHTML = transformTextToBionic(el.dataset.originalText);
    } else {
      if (el.dataset.originalText !== undefined) {
        el.textContent = el.dataset.originalText;
        delete el.dataset.originalText;
      }
    }
  });
}

function updateContentReadingRuler(enabled, height = 40) {
  if (typeof document === 'undefined') return;
  let ruler = document.getElementById('reading-ruler-content');
  if (!ruler && enabled && document.body) {
    ruler = document.createElement('div');
    ruler.id = 'reading-ruler-content';
    ruler.style.cssText = `
      position: fixed;
      left: 0;
      right: 0;
      height: ${height}px;
      pointer-events: none;
      z-index: 999999;
      background: rgba(139, 92, 246, 0.18);
      border-top: 2px solid rgba(139, 92, 246, 0.6);
      border-bottom: 2px solid rgba(139, 92, 246, 0.6);
      box-shadow: 0 0 15px rgba(139, 92, 246, 0.25);
      transform: translateY(-50%);
      transition: height 0.1s ease, opacity 0.15s ease;
    `;
    document.body.appendChild(ruler);

    window.addEventListener('mousemove', (e) => {
      if (ruler) ruler.style.top = `${e.clientY}px`;
    });
  }

  if (ruler) {
    if (enabled) {
      ruler.style.display = 'block';
      ruler.style.height = `${height}px`;
    } else {
      ruler.style.display = 'none';
    }
  }
}

// Initial application
if (typeof chrome !== 'undefined' && chrome.storage && isPdf()) {
  chrome.storage.local.get(null, (settings) => {
    if (settings.active && settings.mode === 'enhanced') {
      chrome.runtime.sendMessage({ action: 'pdf_detected', url: window.location.href });
    } else {
      applyClassicTheme(settings);
    }
  });
}

// Listen for updates from the popup controls
if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
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
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    isPdf,
    clampNumber,
    sanitizeSettings,
    isProtectedElement,
    getReverseFilter,
    tagProtectedElements,
    applyClassicTheme,
    transformWordToBionic,
    transformTextToBionic,
    applyBionicReading,
    updateContentReadingRuler
  };
}
