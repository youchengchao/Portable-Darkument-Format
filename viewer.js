// Set PDF.js worker source
if (typeof pdfjsLib !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'pdfjs/pdf.worker.js';
}

let pdfDoc = null;
let currentScale = 1.0;
const scaleSteps = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0];
let pdfUrl = '';

// Annotation State
let currentTool = 'select'; // 'select', 'draw', 'text'
let currentColor = '#ef4444'; // default red
let currentThickness = 3;
let activePageNum = 1;
const visitedPagesSet = new Set();
let lastReadingTick = Date.now();

function sendTrackReading(data) {
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
    try {
      chrome.runtime.sendMessage({
        action: 'track_reading',
        seconds: data.seconds || 0,
        pages: data.pages !== undefined ? data.pages : (data.page ? 1 : 0)
      }, () => {
        if (chrome.runtime.lastError) {}
      });
    } catch (e) {}
  }
}

// DOM Elements
const pagesContainer = typeof document !== 'undefined' ? document.getElementById('pages-container') : null;
const loadingSpinner = typeof document !== 'undefined' ? document.getElementById('loading-spinner') : null;
const docTitle = typeof document !== 'undefined' ? document.getElementById('doc-title') : null;
const totalPagesEl = typeof document !== 'undefined' ? document.getElementById('total-pages') : null;
const currentPageEl = typeof document !== 'undefined' ? document.getElementById('current-page') : null;
const zoomValueEl = typeof document !== 'undefined' ? document.getElementById('zoom-value') : null;

// Buttons
const btnBack = typeof document !== 'undefined' ? document.getElementById('btn-back') : null;
const btnZoomIn = typeof document !== 'undefined' ? document.getElementById('btn-zoom-in') : null;
const btnZoomOut = typeof document !== 'undefined' ? document.getElementById('btn-zoom-out') : null;
const btnPrevPage = typeof document !== 'undefined' ? document.getElementById('btn-prev-page') : null;
const btnNextPage = typeof document !== 'undefined' ? document.getElementById('btn-next-page') : null;
const btnSettings = typeof document !== 'undefined' ? document.getElementById('btn-settings') : null;

// Initialize settings and load PDF
if (typeof document !== 'undefined' && document.addEventListener) {
  document.addEventListener('DOMContentLoaded', () => {
    // Parse PDF url from query string
    const urlParams = new URLSearchParams(window.location.search);
    pdfUrl = urlParams.get('file');

    if (!pdfUrl) {
      showError('No PDF file specified.');
      return;
    }

    // Set document title
    try {
      const filename = decodeURIComponent(pdfUrl.substring(pdfUrl.lastIndexOf('/') + 1));
      if (docTitle) docTitle.textContent = filename || 'PDF Document';
      document.title = filename || 'PDF Document';
    } catch (e) {
      if (docTitle) docTitle.textContent = 'PDF Document';
    }

    // Load and apply themes dynamically
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(null, (settings) => {
        applyThemeFilters(settings);
        applyFocusSettings(settings);
      });
    }

    // Load the PDF
    loadPdf(pdfUrl);

    // Setup UI Listeners
    setupEventListeners();
  });
}

// Helper to sanitize local file:// URLs (avoids double encoding and preserves drive letter colons)
function sanitizeFileUrl(url) {
  if (!url.startsWith('file:///')) return url;
  
  // Extract path part
  let path = url.substring(8);
  
  // Check if it starts with a drive letter, e.g. "C:" or "C%3A"
  let drivePrefix = '';
  if (path.substring(1, 3) === ':/' || path.substring(1, 3) === ':|') {
    drivePrefix = path.substring(0, 2);
    path = path.substring(2);
  } else if (path.substring(1, 5).toUpperCase() === '%3A/') {
    drivePrefix = path.substring(0, 1) + ':';
    path = path.substring(4);
  }
  
  // Sanitize the remaining path segments
  const sanitizedSegments = path.split('/')
    .map(seg => encodeURIComponent(decodeURIComponent(seg)));
    
  return 'file:///' + drivePrefix + sanitizedSegments.join('/');
}

// Load the PDF via PDF.js or local XMLHttp/Fetch diagnostic pipeline
function loadPdf(url) {
  loadingSpinner.style.display = 'flex';
  url = sanitizeFileUrl(url);
  
  const debugLogs = [];
  function logDebug(msg) {
    console.log('[PDF-Dark-Diagnostics]', msg);
    debugLogs.push(msg);
  }

  logDebug(`Initiated load for PDF: "${url}"`);

  if (url.startsWith('file:///')) {
    logDebug('Local file URL detected. Starting recovery loading pipeline...');
    
    // Attempt Method 1: XMLHttpRequest
    logDebug('Attempting Method 1: XMLHttpRequest...');
    const xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.responseType = 'arraybuffer';
    
    xhr.onload = function() {
      logDebug(`XMLHttpRequest onload triggered. Status: ${xhr.status}, StatusText: ${xhr.statusText}`);
      if (xhr.status === 200 || xhr.status === 0) {
        if (xhr.response && xhr.response.byteLength > 0) {
          logDebug(`XMLHttpRequest successful! Loaded ${xhr.response.byteLength} bytes.`);
          loadPdfFromData(xhr.response);
        } else {
          logDebug('XMLHttpRequest returned an empty array buffer. Falling back to fetch.');
          tryFetchMethod();
        }
      } else {
        logDebug(`XMLHttpRequest failed with non-success status code.`);
        tryFetchMethod();
      }
    };
    
    xhr.onerror = function(err) {
      logDebug('XMLHttpRequest onerror triggered. This usually indicates a CORS/origin block.');
      tryFetchMethod();
    };
    
    try {
      xhr.send();
    } catch (e) {
      logDebug(`XMLHttpRequest send threw immediate error: ${e.message}`);
      tryFetchMethod();
    }
    
    // Attempt Method 2: Fetch
    function tryFetchMethod() {
      logDebug('Attempting Method 2: fetch()...');
      fetch(url)
        .then(res => {
          logDebug(`fetch() response received. Status: ${res.status}, Ok: ${res.ok}`);
          return res.arrayBuffer();
        })
        .then(arrayBuffer => {
          logDebug(`fetch() successful! Loaded ${arrayBuffer.byteLength} bytes.`);
          loadPdfFromData(arrayBuffer);
        })
        .catch(err => {
          logDebug(`fetch() failed with error: ${err.message}`);
          showFailureSummary();
        });
    }

    function showFailureSummary() {
      const summaryMsg = `
        <strong>Could not access the local file.</strong><br/>
        This is usually because the extension does not have permission to access local files.<br/><br/>
        
        <strong>Diagnostic Timeline:</strong>
        <pre style="background: rgba(0,0,0,0.5); border: 1px solid #3f3f46; color: #a1a1aa; padding: 10px; border-radius: 6px; font-family: monospace; font-size: 11px; max-height: 150px; overflow-y: auto; text-align: left; margin: 10px 0; line-height: 1.4;">${debugLogs.join('\n')}</pre>
        
        <strong>To fix this in Microsoft Edge:</strong><br/>
        1. Open Microsoft Edge and go to <code style="background: rgba(255,255,255,0.15); padding: 2px 4px; border-radius: 4px; font-family: monospace;">edge://extensions/</code><br/>
        2. Click on the <strong>Details</strong> button under the <strong>PDF Dark Mode</strong> extension.<br/>
        3. Scroll down and toggle the switch for <strong>"Allow access to file URLs"</strong> to <strong>ON</strong>.<br/>
        4. Refresh this tab to view your PDF.
      `;
      showError(summaryMsg, true);
    }
  } else {
    // For standard web URLs, load using PDF.js document loader
    logDebug('Web URL detected. Loading via native PDF.js network loader.');
    const loadingTask = pdfjsLib.getDocument({
      url: url,
      cMapUrl: 'https://unpkg.com/pdfjs-dist@3.11.174/cmaps/',
      cMapPacked: true
    });
    
    loadingTask.promise.then(pdf => {
      pdfDoc = pdf;
      totalPagesEl.textContent = pdf.numPages;
      loadingSpinner.style.display = 'none';

      pdf.getPage(1).then(page => {
        const viewport = page.getViewport({ scale: 1.0 });
        const aspectRatio = viewport.height / viewport.width;
        createPagePlaceholders(pdf.numPages, aspectRatio);
        setupIntersectionObserver();
        restoreReadingPosition();
        loadTocOutline(pdf);
      });
    }).catch(error => {
      console.error('Error loading PDF:', error);
      showError(`Error loading PDF: ${error.message}`);
    });
  }
}

function loadPdfFromData(arrayBuffer) {
  const loadingTask = pdfjsLib.getDocument({
    data: arrayBuffer,
    cMapUrl: 'https://unpkg.com/pdfjs-dist@3.11.174/cmaps/',
    cMapPacked: true
  });
  
  loadingTask.promise.then(pdf => {
    pdfDoc = pdf;
    totalPagesEl.textContent = pdf.numPages;
    loadingSpinner.style.display = 'none';

    // Get viewport aspect ratio of the first page to create placeholder wrappers
    pdf.getPage(1).then(page => {
      const viewport = page.getViewport({ scale: 1.0 });
      const aspectRatio = viewport.height / viewport.width;
      
      createPagePlaceholders(pdf.numPages, aspectRatio);
      setupIntersectionObserver();
      restoreReadingPosition();
      loadTocOutline(pdf);
    });
  }).catch(error => {
    console.error('Error rendering loaded PDF data:', error);
    showError(`Error rendering PDF data: ${error.message}`);
  });
}

// Create placeholder wrappers for pages to enable lazy loading scroll
function createPagePlaceholders(numPages, aspectRatio) {
  pagesContainer.innerHTML = '';
  
  for (let i = 1; i <= numPages; i++) {
    const pageWrapper = document.createElement('div');
    pageWrapper.id = `page-wrapper-${i}`;
    pageWrapper.className = 'page-wrapper';
    pageWrapper.style.width = '800px'; // default display width
    pageWrapper.style.height = `${800 * aspectRatio}px`;
    pageWrapper.dataset.pageNumber = i;
    pageWrapper.dataset.rendered = 'false';

    pagesContainer.appendChild(pageWrapper);
  }
  
  // Set default page width based on viewport width
  adjustZoom(1.0);
}

// Render page content inside the canvas
function renderPage(pageNum) {
  const wrapper = document.getElementById(`page-wrapper-${pageNum}`);
  if (!wrapper || wrapper.dataset.rendered === 'true') return;

  wrapper.dataset.rendered = 'true';
  
  // Show a loading text or small spinner in wrapper
  const loader = document.createElement('div');
  loader.className = 'spinner';
  loader.style.position = 'absolute';
  loader.style.top = 'calc(50% - 20px)';
  loader.style.left = 'calc(50% - 20px)';
  wrapper.appendChild(loader);

  pdfDoc.getPage(pageNum).then(page => {
    // Determine scale for canvas
    const viewport = page.getViewport({ scale: currentScale * 2 }); // Render at 2x scale for sharpness
    
    const canvas = document.createElement('canvas');
    canvas.className = 'pdf-page-canvas';
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    
    // Fit canvas inside wrapper
    canvas.style.width = '100%';
    canvas.style.height = '100%';

    const context = canvas.getContext('2d');
    const renderContext = {
      canvasContext: context,
      viewport: viewport
    };

    page.render(renderContext).promise.then(() => {
      // Remove loader and add canvas
      loader.remove();
      wrapper.appendChild(canvas);
      
      // Render text layer for selection
      renderTextLayer(page, viewport, wrapper);
      
      // Create annotation layer overlay
      createAnnotationLayer(wrapper, viewport);

      // Tag diagram & image elements in page wrapper for color protection
      tagProtectedElements(wrapper);
    });
  }).catch(err => {
    console.error(`Error rendering page ${pageNum}:`, err);
    wrapper.dataset.rendered = 'false';
    loader.remove();
  });
}

// Setup IntersectionObserver for lazy loading pages as they scroll
function setupIntersectionObserver() {
  const options = {
    root: document.getElementById('pdf-view-area'),
    rootMargin: '200px 0px', // start loading before they scroll into view
    threshold: 0.1
  };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const pageNum = parseInt(entry.target.dataset.pageNumber);
        renderPage(pageNum);
        
        // Update active page tracking globally
        activePageNum = pageNum;
        if (currentPageEl) currentPageEl.textContent = pageNum;

        // Track page view analytics for unvisited pages
        if (!visitedPagesSet.has(pageNum)) {
          visitedPagesSet.add(pageNum);
          sendTrackReading({ seconds: 0, pages: 1 });
        }
      }
    });
  }, options);

  // Observe all page wrappers
  const wrappers = document.querySelectorAll('.page-wrapper');
  wrappers.forEach(wrapper => observer.observe(wrapper));
}

// Zoom functionality
function adjustZoom(scale) {
  currentScale = scale;
  zoomValueEl.textContent = `${Math.round(scale * 100)}%`;

  const wrappers = document.querySelectorAll('.page-wrapper');
  wrappers.forEach(wrapper => {
    const width = 800 * scale;
    // Calculate aspect ratio
    const currentHeight = parseFloat(wrapper.style.height);
    const currentWidth = parseFloat(wrapper.style.width);
    const aspectRatio = currentHeight / currentWidth;
    
    wrapper.style.width = `${width}px`;
    wrapper.style.height = `${width * aspectRatio}px`;
    
    // If zoom changes, re-render currently visible pages to ensure sharpness
    if (wrapper.dataset.rendered === 'true') {
      wrapper.dataset.rendered = 'false';
      const canvas = wrapper.querySelector('canvas');
      if (canvas) canvas.remove();
      renderPage(parseInt(wrapper.dataset.pageNumber));
    }
  });
}

// Render PDF text layer for text selection/search
function renderTextLayer(page, viewport, wrapper) {
  // Remove existing text layer if any
  const oldLayer = wrapper.querySelector('.textLayer');
  if (oldLayer) oldLayer.remove();

  page.getTextContent().then(textContent => {
    const textLayerDiv = document.createElement('div');
    textLayerDiv.className = 'textLayer';
    
    // Set the scale factor CSS property required by PDF.js for text positioning
    textLayerDiv.style.setProperty('--scale-factor', viewport.scale);
    
    // Position text layer exactly on top of canvas and match dimensions
    textLayerDiv.style.position = 'absolute';
    textLayerDiv.style.top = '0';
    textLayerDiv.style.left = '0';
    textLayerDiv.style.width = `${viewport.width}px`;
    textLayerDiv.style.height = `${viewport.height}px`;
    
    // Calculate exact display scale factor dynamically to match wrapper size
    const displayWidth = wrapper.clientWidth || parseFloat(wrapper.style.width) || 800;
    const scaleFactor = displayWidth / viewport.width;
    textLayerDiv.style.transform = `scale(${scaleFactor})`;
    textLayerDiv.style.transformOrigin = '0 0';
    
    wrapper.appendChild(textLayerDiv);
    
    // Use pdfjsLib.renderTextLayer for version 3.11.174
    const task = pdfjsLib.renderTextLayer({
      textContentSource: textContent,
      container: textLayerDiv,
      viewport: viewport,
      textDivs: []
    });
    
    task.promise.then(() => {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.get(['bionicReading'], (res) => {
          if (res && res.bionicReading) {
            applyBionicReadingToViewer(true);
          }
        });
      }
    }).catch(err => {
      console.error('Error during text layer rendering:', err);
    });
  }).catch(err => {
    console.error('Error rendering page text layer:', err);
  });
}

// Find the page wrapper that occupies the most vertical space in the viewport
function getActivePageInViewport() {
  const wrappers = document.querySelectorAll('.page-wrapper');
  let activeWrapper = null;
  let maxVisibleHeight = 0;
  
  const viewArea = document.getElementById('pdf-view-area');
  const viewRect = viewArea.getBoundingClientRect();
  
  wrappers.forEach(wrapper => {
    const rect = wrapper.getBoundingClientRect();
    const visibleTop = Math.max(rect.top, viewRect.top);
    const visibleBottom = Math.min(rect.bottom, viewRect.bottom);
    
    if (visibleBottom > visibleTop) {
      const visibleHeight = visibleBottom - visibleTop;
      if (visibleHeight > maxVisibleHeight) {
        maxVisibleHeight = visibleHeight;
        activeWrapper = wrapper;
      }
    }
  });
  
  return activeWrapper;
}

// Create annotation layer overlay
function createAnnotationLayer(wrapper, viewport) {
  const pageNum = parseInt(wrapper.dataset.pageNumber);
  
  // Prevent duplicate annotation layers
  let annotLayer = wrapper.querySelector('.annotation-layer');
  if (annotLayer) {
    annotLayer.remove();
  }
  
  annotLayer = document.createElement('div');
  annotLayer.className = 'annotation-layer';
  
  const drawCanvas = document.createElement('canvas');
  drawCanvas.className = 'drawing-canvas';
  drawCanvas.width = viewport.width;
  drawCanvas.height = viewport.height;
  
  annotLayer.appendChild(drawCanvas);
  wrapper.appendChild(annotLayer);
  
  // Set initial tools pointer-events and styles
  if (currentTool === 'draw') {
    drawCanvas.style.pointerEvents = 'auto';
    annotLayer.style.pointerEvents = 'none';
  } else if (currentTool === 'text') {
    drawCanvas.style.pointerEvents = 'none';
    annotLayer.style.pointerEvents = 'auto';
  } else {
    drawCanvas.style.pointerEvents = 'none';
    annotLayer.style.pointerEvents = 'none';
  }
  
  // Setup drawing listener
  setupDrawingEvents(drawCanvas, pageNum);
  
  // Setup click listener for text annotations
  annotLayer.addEventListener('click', (e) => {
    if (currentTool !== 'text') return;
    if (e.target !== annotLayer) return;
    
    const rect = annotLayer.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;
    
    // Position text as percentages to keep it scalable during zoom
    const leftPercent = (clickX / rect.width) * 100;
    const topPercent = (clickY / rect.height) * 100;
    
    createTextAnnotation(annotLayer, leftPercent, topPercent);
  });
}

// Setup drawing listener for a page canvas
function setupDrawingEvents(canvas, pageNum) {
  const ctx = canvas.getContext('2d');
  let isDrawingPage = false;
  let lastX = 0;
  let lastY = 0;
  
  function startDraw(e) {
    if (currentTool !== 'draw') return;
    e.preventDefault();
    
    isDrawingPage = true;
    const coords = getCanvasCoords(e, canvas);
    lastX = coords.x;
    lastY = coords.y;
  }
  
  function draw(e) {
    if (!isDrawingPage || currentTool !== 'draw') return;
    e.preventDefault();
    
    const coords = getCanvasCoords(e, canvas);
    
    ctx.beginPath();
    ctx.moveTo(lastX, lastY);
    ctx.lineTo(coords.x, coords.y);
    ctx.strokeStyle = currentColor;
    ctx.lineWidth = currentThickness;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
    
    lastX = coords.x;
    lastY = coords.y;
  }
  
  function stopDraw() {
    isDrawingPage = false;
  }
  
  // Mouse
  canvas.addEventListener('mousedown', startDraw);
  canvas.addEventListener('mousemove', draw);
  canvas.addEventListener('mouseup', stopDraw);
  canvas.addEventListener('mouseout', stopDraw);
  
  // Touch
  canvas.addEventListener('touchstart', startDraw);
  canvas.addEventListener('touchmove', draw);
  canvas.addEventListener('touchend', stopDraw);
}

// Helper to get local canvas coords for events
function getCanvasCoords(e, canvas) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  
  const clientX = e.clientX || (e.touches && e.touches[0].clientX);
  const clientY = e.clientY || (e.touches && e.touches[0].clientY);
  
  return {
    x: (clientX - rect.left) * scaleX,
    y: (clientY - rect.top) * scaleY
  };
}

// Create a new text box on the page
function createTextAnnotation(annotLayer, leftPercent, topPercent, textContent = '') {
  const textDiv = document.createElement('div');
  textDiv.className = 'text-annotation';
  textDiv.style.left = `${leftPercent}%`;
  textDiv.style.top = `${topPercent}%`;
  textDiv.style.color = currentColor;
  textDiv.contentEditable = 'true';
  textDiv.textContent = textContent;
  
  // Purple border for active edit
  textDiv.style.borderColor = 'rgba(139, 92, 246, 0.4)';
  
  annotLayer.appendChild(textDiv);
  textDiv.focus();
  
  textDiv.addEventListener('blur', () => {
    if (textDiv.textContent.trim() === '') {
      textDiv.remove();
    } else {
      textDiv.style.borderColor = 'transparent';
      textDiv.contentEditable = 'false';
    }
  });
  
  textDiv.addEventListener('dblclick', (e) => {
    e.stopPropagation();
    if (currentTool === 'select' || currentTool === 'text') {
      textDiv.contentEditable = 'true';
      textDiv.style.borderColor = 'rgba(139, 92, 246, 0.4)';
      textDiv.focus();
    }
  });

  textDiv.addEventListener('mousedown', (e) => {
    e.stopPropagation();
  });
}

// Update tools active states for all page wrappers
function updateToolsState() {
  const wrappers = document.querySelectorAll('.page-wrapper');
  wrappers.forEach(wrapper => {
    wrapper.classList.remove('annotating-draw', 'annotating-text');
    
    const annotLayer = wrapper.querySelector('.annotation-layer');
    if (!annotLayer) return;
    
    const drawCanvas = annotLayer.querySelector('.drawing-canvas');
    
    if (currentTool === 'draw') {
      wrapper.classList.add('annotating-draw');
      if (drawCanvas) drawCanvas.style.pointerEvents = 'auto';
      annotLayer.style.pointerEvents = 'none';
    } else if (currentTool === 'text') {
      wrapper.classList.add('annotating-text');
      if (drawCanvas) drawCanvas.style.pointerEvents = 'none';
      annotLayer.style.pointerEvents = 'auto';
    } else {
      if (drawCanvas) drawCanvas.style.pointerEvents = 'none';
      annotLayer.style.pointerEvents = 'none';
    }
  });
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
    mode: 'enhanced',
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

// Check if element or tag is a diagram, image, svg, chart, or canvas container
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
    if (el && el.classList && el.classList.contains('pdf-page-canvas') && !el.classList.contains('diagram-canvas')) {
      return false;
    }
    return true;
  }

  if (el) {
    if (el.dataset && (el.dataset.isDiagram || el.dataset.diagram)) return true;
    if (el.classList && (
      el.classList.contains('protected-diagram') ||
      el.classList.contains('image-layer') ||
      el.classList.contains('diagram-container') ||
      el.classList.contains('svgLayer') ||
      el.classList.contains('imageLayer')
    )) {
      return true;
    }
    if (typeof el.getAttribute === 'function' && el.getAttribute('role') === 'img') return true;
  }

  return false;
}

// Return reverse inversion filter string for diagram protection
function getReverseFilter(protectDiagrams) {
  return protectDiagrams ? 'invert(1) hue-rotate(180deg)' : 'none';
}

// Tag protected elements in a DOM container
function tagProtectedElements(container) {
  const root = container || (typeof document !== 'undefined' ? document : null);
  if (!root || typeof root.querySelectorAll !== 'function') return [];

  const elements = root.querySelectorAll('img, svg, canvas:not(.pdf-page-canvas), [data-is-diagram="true"], [data-diagram="true"], .diagram-container, [role="img"], .imageLayer img, .svgLayer svg');
  const tagged = [];

  elements.forEach(el => {
    if (isProtectedElement(el)) {
      el.classList.add('protected-diagram');
      tagged.push(el);
    }
  });

  return tagged;
}

// Helper to get active theme background color for zero-flicker pre-render
function getThemeBgColor(theme) {
  switch (theme) {
    case 'oled':
    case 'dark':
      return '#000000';
    case 'sepia':
    case 'warm':
      return '#1e1b18';
    case 'slate':
    case 'cool':
      return '#0f172a';
    case 'mono':
      return '#121212';
    case 'classic':
      return '#000000';
    default:
      return '#000000';
  }
}

// Apply settings filters to the canvas & zero-flicker pre-render viewport background
function applyThemeFilters(rawSettings) {
  const settings = sanitizeSettings(rawSettings);
  let styleEl = typeof document !== 'undefined' ? document.getElementById('viewer-filter-style') : null;
  if (!styleEl && typeof document !== 'undefined' && document.head) {
    styleEl = document.createElement('style');
    styleEl.id = 'viewer-filter-style';
    document.head.appendChild(styleEl);
  }

  const badge = typeof document !== 'undefined' ? document.getElementById('theme-badge') : null;

  if (!rawSettings || settings.active === false) {
    if (typeof document !== 'undefined' && document.documentElement) {
      document.documentElement.style.setProperty('--theme-active-bg', '#ffffff');
    }
    if (styleEl) {
      styleEl.textContent = `
        .pdf-page-canvas { filter: none !important; }
        .protected-diagram, canvas.protected-diagram, svg.protected-diagram, img.protected-diagram { filter: none !important; }
      `;
    }
    if (badge) {
      badge.textContent = 'OFF';
      badge.style.color = '#a1a1aa';
      badge.style.borderColor = '#27273a';
      badge.style.backgroundColor = 'transparent';
    }
    return;
  }

  // Pre-apply theme dark background to avoid white screen flicker during load/scroll
  const themeBgHex = getThemeBgColor(settings.theme);
  if (typeof document !== 'undefined' && document.documentElement) {
    document.documentElement.style.setProperty('--theme-active-bg', themeBgHex);
  }

  const filterParts = [];
  
  // 5 Premium Color Schemes
  switch (settings.theme) {
    case 'oled':
    case 'dark':
      filterParts.push('invert(0.9) hue-rotate(180deg)');
      break;
    case 'sepia':
    case 'warm':
      filterParts.push('invert(0.9) hue-rotate(180deg) sepia(0.35)');
      break;
    case 'slate':
    case 'cool':
      filterParts.push('invert(0.9) hue-rotate(200deg)');
      break;
    case 'mono':
      filterParts.push('invert(0.9) hue-rotate(180deg) grayscale(1)');
      break;
    case 'classic':
      filterParts.push('invert(1)');
      break;
    default:
      filterParts.push('invert(0.9) hue-rotate(180deg)');
  }

  // Adjustments sliders
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
  const diagramFilterRule = getReverseFilter(protectDiagrams);

  if (styleEl) {
    styleEl.textContent = `
      .pdf-page-canvas { filter: ${filterString} !important; }
      .protected-diagram, canvas.protected-diagram, svg.protected-diagram, img.protected-diagram { filter: ${diagramFilterRule} !important; }
    `;
  }

  if (typeof document !== 'undefined') {
    tagProtectedElements(document);
  }
  
  if (badge) {
    badge.textContent = (settings.theme || 'oled').toUpperCase();
    badge.style.color = '#8b5cf6';
    badge.style.borderColor = 'rgba(139, 92, 246, 0.3)';
    badge.style.backgroundColor = 'rgba(139, 92, 246, 0.15)';
  }

  // Handle supporter status & gold accent theme
  const supporter = rawSettings ? rawSettings.supporter : null;
  const supporterBadge = typeof document !== 'undefined' ? document.getElementById('viewer-supporter-badge') : null;
  if (supporterBadge) {
    if (supporter && supporter.isSupporter) {
      supporterBadge.classList.remove('hidden');
    } else {
      supporterBadge.classList.add('hidden');
    }
  }

  if (typeof document !== 'undefined' && document.body) {
    if (supporter && supporter.goldAccent) {
      document.body.classList.add('theme-gold-accent');
    } else {
      document.body.classList.remove('theme-gold-accent');
    }
  }

  checkMilestonePrompt(rawSettings);
}

// -------------------------------------------------------------------------
// Bionic Reading & Line Focus Ruler Engine (Module 4)
// -------------------------------------------------------------------------

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

function applyBionicReadingToViewer(enabled) {
  if (typeof document === 'undefined') return;
  const textLayers = document.querySelectorAll('.textLayer');
  
  textLayers.forEach(layer => {
    if (enabled) {
      layer.classList.add('bionic-active');
    } else {
      layer.classList.remove('bionic-active');
    }

    const spans = layer.querySelectorAll('span');
    spans.forEach(span => {
      if (enabled) {
        if (span.dataset.originalText === undefined) {
          span.dataset.originalText = span.textContent;
        }
        span.innerHTML = transformTextToBionic(span.dataset.originalText);
      } else {
        if (span.dataset.originalText !== undefined) {
          span.textContent = span.dataset.originalText;
          delete span.dataset.originalText;
        }
      }
    });
  });
}

function updateReadingRuler(enabled, height = 40) {
  if (typeof document === 'undefined') return;
  const ruler = document.getElementById('reading-ruler');
  if (!ruler) return;

  if (enabled) {
    ruler.classList.remove('hidden');
    ruler.style.height = `${height}px`;
  } else {
    ruler.classList.add('hidden');
  }
}

let isRulerMouseTrackingBound = false;
function setupReadingRulerMouseTracking() {
  if (typeof document === 'undefined' || isRulerMouseTrackingBound) return;
  const viewArea = document.getElementById('pdf-view-area') || document.body;
  const ruler = document.getElementById('reading-ruler');
  if (!viewArea || !ruler) return;

  isRulerMouseTrackingBound = true;
  window.addEventListener('mousemove', (e) => {
    ruler.style.top = `${e.clientY}px`;
  });
}

function applyFocusSettings(settings) {
  if (!settings) return;
  const bionicActive = settings.bionicReading === true;
  const rulerActive = settings.readingRuler === true;
  const rulerH = typeof settings.rulerHeight === 'number' ? settings.rulerHeight : 40;

  const btnBionic = typeof document !== 'undefined' ? document.getElementById('btn-toggle-bionic') : null;
  const btnRuler = typeof document !== 'undefined' ? document.getElementById('btn-toggle-ruler') : null;

  if (btnBionic) btnBionic.classList.toggle('active', bionicActive);
  if (btnRuler) btnRuler.classList.toggle('active', rulerActive);

  applyBionicReadingToViewer(bionicActive);
  updateReadingRuler(rulerActive, rulerH);
  setupReadingRulerMouseTracking();
}

// Check and display non-intrusive thank-you prompts at reading milestones
function checkMilestonePrompt(settings) {
  if (typeof document === 'undefined') return;
  const toast = document.getElementById('milestone-toast');
  const desc = document.getElementById('milestone-desc');
  if (!toast) return;

  if (!settings) return;
  const supporter = settings.supporter || { isSupporter: false, goldAccent: false, promptDismissedCount: 0, lastPromptDate: '' };

  if (supporter.isSupporter) {
    toast.classList.add('hidden');
    return;
  }

  const todayStr = new Date().toISOString().split('T')[0];
  if ((supporter.promptDismissedCount || 0) >= 3 || supporter.lastPromptDate === todayStr) {
    toast.classList.add('hidden');
    return;
  }

  const analytics = settings.analytics || {};
  const stats = settings.readingStats || {};

  const streak = (typeof analytics.currentStreak === 'number' ? analytics.currentStreak : stats.streak) || 0;
  const pages = (typeof analytics.totalPagesRead === 'number' ? analytics.totalPagesRead : stats.totalPages) || 0;

  if (streak >= 7 || pages >= 50) {
    if (desc) {
      desc.textContent = "Glad PDF Dark Mode is helping your daily reading! Consider supporting development with a coffee ☕";
    }
    toast.classList.remove('hidden');
  }
}

// Show error screen with optional manual file picker fallback
function showError(message, showFilePicker = false) {
  let filePickerHtml = '';
  if (showFilePicker) {
    filePickerHtml = `
      <div style="margin-top: 16px; border-top: 1px dashed rgba(255,255,255,0.2); padding-top: 16px; text-align: center;">
        <p style="font-size: 11px; margin-bottom: 8px; color: #a1a1aa; line-height: 1.4;">
          Or, select the file manually to bypass browser local security restrictions:
        </p>
        <button id="btn-file-fallback" style="padding: 8px 16px; background: #8b5cf6; border: none; border-radius: 6px; color: white; cursor: pointer; font-weight: 600; font-size: 12px; transition: background 0.15s ease;">
          Choose PDF File
        </button>
        <input type="file" id="file-input-fallback" accept=".pdf" style="display: none;" />
        <p style="font-size: 10px; margin-top: 8px; color: #71717a;">
          Tip: You can also drag and drop the PDF file anywhere on this window!
        </p>
      </div>
    `;
  }

  loadingSpinner.innerHTML = `
    <div style="color: #ef4444; font-size: 28px; margin-bottom: 16px;">⚠️</div>
    <div style="color: #f3f4f6; text-align: left; max-width: 500px; margin: 0 auto; line-height: 1.6; font-size: 13px; background: #181825; border: 1px solid #ef4444; border-radius: 8px; padding: 16px;">
      ${message}
      ${filePickerHtml}
    </div>
  `;

  // Attach event listener if picker was shown
  if (showFilePicker) {
    const btn = document.getElementById('btn-file-fallback');
    const input = document.getElementById('file-input-fallback');
    if (btn && input) {
      btn.addEventListener('click', () => input.click());
      input.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
          loadLocalFile(file);
        }
      });
    }
  }
}

// Helper to read and load a local file via FileReader
function loadLocalFile(file) {
  loadingSpinner.style.display = 'flex';
  loadingSpinner.innerHTML = `
    <div class="spinner"></div>
    <p>Rendering document...</p>
  `;
  
  const reader = new FileReader();
  reader.onload = function(evt) {
    loadPdfFromData(evt.target.result);
  };
  reader.onerror = function() {
    showError('Failed to read the local file.');
  };
  reader.readAsArrayBuffer(file);
}

// -------------------------------------------------------------------------
// Reading Progress Memory Engine & Dark Table of Contents (Module 2)
// -------------------------------------------------------------------------

let savePositionTimeout = null;

function saveReadingPosition(immediate = false) {
  if (!pdfUrl) return;

  const doSave = () => {
    const viewArea = typeof document !== 'undefined' ? document.getElementById('pdf-view-area') : null;
    const scrollTop = viewArea ? Math.max(0, viewArea.scrollTop) : 0;
    const scrollLeft = viewArea ? Math.max(0, viewArea.scrollLeft) : 0;
    const page = activePageNum || 1;
    const zoom = currentScale || 1.0;

    const posData = {
      page: page,
      scrollTop: scrollTop,
      scrollLeft: scrollLeft,
      zoom: zoom,
      updatedAt: Date.now()
    };

    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get('readingPositions', (res) => {
        let positions = res ? res.readingPositions : null;
        if (typeof positions !== 'object' || positions === null) {
          positions = {};
        }
        positions[pdfUrl] = posData;
        chrome.storage.local.set({ readingPositions: positions });
      });
    }

    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      try {
        chrome.runtime.sendMessage({
          action: 'save_position',
          url: pdfUrl,
          page: page,
          scrollTop: scrollTop,
          scrollLeft: scrollLeft,
          zoom: zoom
        });
      } catch (e) {
        // Context invalidated safely ignored
      }
    }
  };

  if (immediate) {
    if (savePositionTimeout) clearTimeout(savePositionTimeout);
    doSave();
  } else {
    if (savePositionTimeout) clearTimeout(savePositionTimeout);
    savePositionTimeout = setTimeout(doSave, 250);
  }
}

function restoreReadingPosition() {
  if (!pdfUrl) return;

  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get('readingPositions', (res) => {
      let positions = res ? res.readingPositions : null;
      if (typeof positions !== 'object' || positions === null) {
        positions = {};
      }
      const pos = positions[pdfUrl];
      if (pos) {
        if (pos.zoom && pos.zoom !== currentScale) {
          adjustZoom(pos.zoom);
        }
        const viewArea = document.getElementById('pdf-view-area');
        if (viewArea) {
          if (typeof pos.scrollTop === 'number' && pos.scrollTop > 0) {
            viewArea.scrollTop = Math.max(0, pos.scrollTop);
          } else if (pos.page && pos.page > 1) {
            const pageEl = document.getElementById(`page-wrapper-${pos.page}`);
            if (pageEl) {
              pageEl.scrollIntoView();
            }
          }
          if (typeof pos.scrollLeft === 'number') {
            viewArea.scrollLeft = Math.max(0, pos.scrollLeft);
          }
        }
        if (pos.page) {
          activePageNum = pos.page;
          if (currentPageEl) currentPageEl.textContent = pos.page;
        }
      }
    });
  }
}

let currentTocItems = [];

async function resolveOutlinePage(pdf, item) {
  let pageNum = 1;
  if (typeof item.pageNumber === 'number' && item.pageNumber >= 1) {
    pageNum = item.pageNumber;
  } else if (item.dest) {
    try {
      let explicitDest = item.dest;
      if (typeof explicitDest === 'string' && pdf && typeof pdf.getDestination === 'function') {
        explicitDest = await pdf.getDestination(explicitDest);
      }
      if (Array.isArray(explicitDest) && explicitDest.length > 0) {
        const first = explicitDest[0];
        if (typeof first === 'number') {
          pageNum = first + 1;
        } else if (first && typeof first === 'object') {
          if (typeof first.num === 'number') {
            if (pdf && typeof pdf.getPageIndex === 'function') {
              try {
                const idx = await pdf.getPageIndex(first);
                pageNum = idx + 1;
              } catch (e) {
                pageNum = first.num || 1;
              }
            } else {
              pageNum = first.num || 1;
            }
          }
        }
      }
    } catch (err) {
      pageNum = 1;
    }
  }

  if (pdfDoc && pdfDoc.numPages) {
    pageNum = Math.min(Math.max(1, pageNum), pdfDoc.numPages);
  } else {
    pageNum = Math.max(1, pageNum);
  }

  const children = (item.items && Array.isArray(item.items)) ? await processOutlineItems(item.items) : [];

  return {
    title: item.title || 'Untitled',
    page: pageNum,
    items: children
  };
}

async function processOutlineItems(items) {
  if (!items || !Array.isArray(items)) return [];
  const results = [];
  for (const item of items) {
    const processed = await resolveOutlinePage(pdfDoc, item);
    results.push(processed);
  }
  return results;
}

function loadTocOutline(pdf) {
  if (!pdf || typeof pdf.getOutline !== 'function') {
    renderTocTree([]);
    return;
  }

  pdf.getOutline().then(outline => {
    if (!outline || !Array.isArray(outline) || outline.length === 0) {
      renderTocTree([]);
      return;
    }
    processOutlineItems(outline).then(processedTree => {
      currentTocItems = processedTree;
      renderTocTree(processedTree);
    }).catch(() => {
      renderTocTree([]);
    });
  }).catch(() => {
    renderTocTree([]);
  });
}

function renderTocTree(tocItems) {
  if (typeof document === 'undefined') return;
  const container = document.getElementById('toc-content');
  if (!container) return;

  if (!tocItems || !Array.isArray(tocItems) || tocItems.length === 0) {
    container.innerHTML = '<div class="toc-empty">No table of contents available</div>';
    return;
  }

  container.innerHTML = '';

  function createTocBranch(items, level = 0) {
    const branchUl = document.createElement('ul');
    branchUl.className = `toc-level-${level}`;

    items.forEach((item) => {
      const li = document.createElement('li');
      li.className = 'toc-item-node';

      const row = document.createElement('div');
      row.className = 'toc-item-row';
      row.dataset.page = item.page;

      const hasChildren = item.items && item.items.length > 0;

      if (hasChildren) {
        const toggleBtn = document.createElement('button');
        toggleBtn.className = 'toc-toggle-btn expanded';
        toggleBtn.innerHTML = '▼';
        toggleBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          const subTree = li.querySelector(':scope > ul');
          if (subTree) {
            const isHidden = subTree.classList.toggle('hidden');
            toggleBtn.innerHTML = isHidden ? '►' : '▼';
            toggleBtn.classList.toggle('expanded', !isHidden);
          }
        });
        row.appendChild(toggleBtn);
      } else {
        const spacer = document.createElement('span');
        spacer.className = 'toc-spacer';
        row.appendChild(spacer);
      }

      const titleSpan = document.createElement('span');
      titleSpan.className = 'toc-title';
      titleSpan.innerHTML = escapeHtml(item.title || 'Untitled');
      row.appendChild(titleSpan);

      const pageSpan = document.createElement('span');
      pageSpan.className = 'toc-page-num';
      pageSpan.textContent = item.page;
      row.appendChild(pageSpan);

      row.addEventListener('click', () => {
        navigateToPage(item.page);
      });

      li.appendChild(row);

      if (hasChildren) {
        const childUl = createTocBranch(item.items, level + 1);
        li.appendChild(childUl);
      }

      branchUl.appendChild(li);
    });

    return branchUl;
  }

  const rootTree = createTocBranch(tocItems, 0);
  container.appendChild(rootTree);

  updateActiveTocHighlight();
}

function navigateToPage(pageNum) {
  const targetPage = Math.min(Math.max(1, pageNum), pdfDoc ? pdfDoc.numPages : pageNum);
  const targetWrapper = document.getElementById(`page-wrapper-${targetPage}`);
  if (targetWrapper) {
    targetWrapper.scrollIntoView({ behavior: 'smooth' });
    activePageNum = targetPage;
    if (currentPageEl) currentPageEl.textContent = targetPage;
    saveReadingPosition(true);
    updateActiveTocHighlight();
  }
}

function updateActiveTocHighlight() {
  if (typeof document === 'undefined') return;
  const tocRows = document.querySelectorAll('.toc-item-row');
  if (!tocRows || tocRows.length === 0) return;

  let activeRow = null;
  for (const row of tocRows) {
    const page = parseInt(row.dataset.page, 10);
    if (activePageNum >= page) {
      activeRow = row;
    }
  }

  if (!activeRow && tocRows.length > 0) {
    activeRow = tocRows[0];
  }

  tocRows.forEach(r => r.classList.remove('active'));
  if (activeRow) {
    activeRow.classList.add('active');
  }
}

// Setup all click event listeners
function setupEventListeners() {
  // Exit to native viewer
  btnBack.addEventListener('click', () => {
    // Append native=true to PDF URL to bypass extension redirection loop
    const divider = pdfUrl.includes('?') ? '&' : '?';
    window.location.href = pdfUrl + divider + 'native=true';
  });

  // Zoom In
  btnZoomIn.addEventListener('click', () => {
    const currIdx = scaleSteps.indexOf(currentScale);
    if (currIdx < scaleSteps.length - 1) {
      adjustZoom(scaleSteps[currIdx + 1]);
      saveReadingPosition(true);
    }
  });

  // Zoom Out
  btnZoomOut.addEventListener('click', () => {
    const currIdx = scaleSteps.indexOf(currentScale);
    if (currIdx > 0) {
      adjustZoom(scaleSteps[currIdx - 1]);
      saveReadingPosition(true);
    }
  });

  // Previous Page
  btnPrevPage.addEventListener('click', () => {
    const currPage = parseInt(currentPageEl.textContent);
    if (currPage > 1) {
      navigateToPage(currPage - 1);
    }
  });

  // Next Page
  btnNextPage.addEventListener('click', () => {
    const currPage = parseInt(currentPageEl.textContent);
    if (currPage < pdfDoc.numPages) {
      navigateToPage(currPage + 1);
    }
  });

  // --- TOC DRAWER EVENT LISTENERS ---
  const btnToggleToc = document.getElementById('btn-toggle-toc');
  const btnCloseToc = document.getElementById('btn-close-toc');
  const tocDrawer = document.getElementById('toc-drawer');

  if (btnToggleToc && tocDrawer) {
    btnToggleToc.addEventListener('click', () => {
      const isHidden = tocDrawer.classList.toggle('hidden');
      btnToggleToc.classList.toggle('active', !isHidden);
    });
  }

  if (btnCloseToc && tocDrawer) {
    btnCloseToc.addEventListener('click', () => {
      tocDrawer.classList.add('hidden');
      if (btnToggleToc) btnToggleToc.classList.remove('active');
    });
  }

  // Position Auto-Save & TOC Active Highlight on Viewport Scroll
  const viewArea = document.getElementById('pdf-view-area');
  if (viewArea) {
    viewArea.addEventListener('scroll', () => {
      saveReadingPosition(false);
      updateActiveTocHighlight();
    });
  }

  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      saveReadingPosition(true);
    }
  });

  window.addEventListener('beforeunload', () => {
    saveReadingPosition(true);
  });

  // --- BIONIC READING & RULER TOOLBAR TOGGLE LISTENERS ---
  const btnToggleBionic = document.getElementById('btn-toggle-bionic');
  const btnToggleRuler = document.getElementById('btn-toggle-ruler');

  if (btnToggleBionic) {
    btnToggleBionic.addEventListener('click', () => {
      chrome.storage.local.get(['bionicReading'], (res) => {
        const nextState = !(res && res.bionicReading);
        chrome.storage.local.set({ bionicReading: nextState });
      });
    });
  }

  if (btnToggleRuler) {
    btnToggleRuler.addEventListener('click', () => {
      chrome.storage.local.get(['readingRuler'], (res) => {
        const nextState = !(res && res.readingRuler);
        chrome.storage.local.set({ readingRuler: nextState });
      });
    });
  }

  // Open settings extension popup trigger
  btnSettings.addEventListener('click', () => {
    if (chrome.runtime && chrome.runtime.sendMessage) {
      // Chrome extension popup doesn't open via programmatic APIs directly in standard tabs,
      // but we can alert the user to click the extension icon.
      alert('To adjust settings, click the PDF Dark extension icon in the toolbar.');
    }
  });

  // Listen to changes in chrome.storage.local
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local') {
      chrome.storage.local.get(null, (settings) => {
        // If mode is changed back to classic, we should reload this page back to original PDF!
        if (settings.mode === 'classic') {
          window.location.href = pdfUrl;
        } else {
          applyThemeFilters(settings);
          applyFocusSettings(settings);
        }
      });
    }
  });

  // --- MILESTONE DONATION TOAST LISTENERS ---
  const btnCloseToast = document.getElementById('btn-close-toast');
  const milestoneToast = document.getElementById('milestone-toast');
  if (btnCloseToast && milestoneToast) {
    btnCloseToast.addEventListener('click', () => {
      milestoneToast.classList.add('hidden');
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.get(['supporter'], (res) => {
          const supporter = res.supporter || { isSupporter: false, goldAccent: false, promptDismissedCount: 0, lastPromptDate: '' };
          supporter.promptDismissedCount = (supporter.promptDismissedCount || 0) + 1;
          supporter.lastPromptDate = new Date().toISOString().split('T')[0];
          chrome.storage.local.set({ supporter });
        });
      }
    });
  }

  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.action === 'trigger_donation_prompt') {
        const toast = document.getElementById('milestone-toast');
        const desc = document.getElementById('milestone-desc');
        if (toast) {
          chrome.storage.local.get(['supporter'], (res) => {
            const supporter = res.supporter || {};
            if (!supporter.isSupporter && (supporter.promptDismissedCount || 0) < 3) {
              if (desc && message.reason) {
                desc.textContent = "Glad PDF Dark Mode is helping your daily reading! Consider supporting development with a coffee ☕";
              }
              toast.classList.remove('hidden');
              if (sendResponse) sendResponse({ promptShown: true });
            }
          });
        }
        return true;
      }
    });
  }

  // --- ANNOTATION TOOLBAR EVENT LISTENERS ---
  const btnToggleAnnotate = document.getElementById('btn-toggle-annotate');
  const annotationBar = document.getElementById('annotation-bar');

  // Toggle sub-toolbar
  btnToggleAnnotate.addEventListener('click', () => {
    const isHidden = annotationBar.classList.toggle('hidden');
    btnToggleAnnotate.classList.toggle('active', !isHidden);
    
    // Default back to Select tool when toggled
    setTool('select');
  });

  // Tool switches
  function setTool(tool) {
    currentTool = tool;
    document.getElementById('btn-tool-select').classList.toggle('active', tool === 'select');
    document.getElementById('btn-tool-draw').classList.toggle('active', tool === 'draw');
    document.getElementById('btn-tool-text').classList.toggle('active', tool === 'text');
    updateToolsState();
  }

  document.getElementById('btn-tool-select').addEventListener('click', () => setTool('select'));
  document.getElementById('btn-tool-draw').addEventListener('click', () => setTool('draw'));
  document.getElementById('btn-tool-text').addEventListener('click', () => setTool('text'));

  // Color picker
  const colorDots = document.querySelectorAll('.color-dot');
  colorDots.forEach(dot => {
    dot.addEventListener('click', () => {
      colorDots.forEach(d => d.classList.remove('active'));
      dot.classList.add('active');
      currentColor = dot.dataset.color;
    });
  });

  // Thickness slider
  const penSizeInput = document.getElementById('pen-size');
  const penSizeVal = document.getElementById('pen-size-value');
  penSizeInput.addEventListener('input', (e) => {
    currentThickness = parseInt(e.target.value);
    penSizeVal.textContent = `${currentThickness}px`;
  });

  // Clear current page annotations
  document.getElementById('btn-clear-page').addEventListener('click', () => {
    const wrapper = getActivePageInViewport();
    if (wrapper) {
      // Clear drawings
      const canvas = wrapper.querySelector('.drawing-canvas');
      if (canvas) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
      // Clear text annotations
      const texts = wrapper.querySelectorAll('.text-annotation');
      texts.forEach(t => t.remove());
    }
  });

  // --- HIGHLIGHT & SIDE DRAWER EVENT LISTENERS ---
  setupHighlightSelectionListeners();
  renderNotesDrawer();

  // 4. Drag & Drop Fallback Event Listeners
  window.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  });

  window.addEventListener('drop', (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.type === 'application/pdf') {
      loadLocalFile(file);
    } else {
      alert('Please drop a valid PDF file.');
    }
  });
}

// -------------------------------------------------------------------------
// Highlight & Side Drawer Engine (Module 3)
// -------------------------------------------------------------------------

function exportHighlights(highlightsArray, format = 'markdown') {
  if (!highlightsArray || highlightsArray.length === 0) return '';

  if (format === 'markdown') {
    return highlightsArray.map(hl => {
      let out = `## Page ${hl.page}\n> ${hl.text}`;
      if (hl.note) out += `\n*Note: ${hl.note}*`;
      return out;
    }).join('\n\n');
  } else {
    return highlightsArray.map(hl => {
      let out = `Page ${hl.page}: "${hl.text}"`;
      if (hl.note) out += ` [Note: ${hl.note}]`;
      return out;
    }).join('\n');
  }
}

function truncateText(str, maxLen = 10000) {
  if (!str) return '';
  if (str.length > maxLen) {
    return str.substring(0, maxLen) + '...';
  }
  return str;
}

function saveHighlightToStorage(url, highlightObj, callback) {
  if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
    if (callback) callback(highlightObj);
    return;
  }
  chrome.storage.local.get(['highlights'], (result) => {
    const highlights = result.highlights || {};
    const list = highlights[url] || [];
    
    const existingIdx = list.findIndex(h => h.id === highlightObj.id);
    if (existingIdx >= 0) {
      list[existingIdx] = highlightObj;
    } else {
      list.push(highlightObj);
    }
    
    highlights[url] = list;
    chrome.storage.local.set({ highlights }, () => {
      if (callback) callback(highlightObj);
    });
  });
}

function removeHighlightFromStorage(url, highlightId, callback) {
  if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
    if (callback) callback();
    return;
  }
  chrome.storage.local.get(['highlights'], (result) => {
    const highlights = result.highlights || {};
    if (highlights[url]) {
      highlights[url] = highlights[url].filter(h => h.id !== highlightId);
      chrome.storage.local.set({ highlights }, () => {
        if (callback) callback();
      });
    } else if (callback) {
      callback();
    }
  });
}

function loadNotesForCurrentPdf(callback) {
  if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
    if (callback) callback([]);
    return;
  }
  chrome.storage.local.get(['highlights'], (result) => {
    const highlights = result.highlights || {};
    const list = highlights[pdfUrl] || [];
    const sorted = [...list].sort((a, b) => (a.page || 0) - (b.page || 0));
    if (callback) callback(sorted);
  });
}

function renderNotesDrawer() {
  if (typeof document === 'undefined') return;
  const notesListEl = document.getElementById('notes-list');
  if (!notesListEl) return;

  loadNotesForCurrentPdf((notes) => {
    if (!notes || notes.length === 0) {
      notesListEl.innerHTML = '<div class="notes-empty-state">No highlights or notes saved yet. Select text in the document to add a neon highlight.</div>';
      return;
    }

    notesListEl.innerHTML = '';
    notes.forEach((hl) => {
      const card = document.createElement('div');
      card.className = 'note-card';
      card.dataset.id = hl.id;

      const colorClass = hl.color || 'amber';
      card.innerHTML = `
        <div class="note-card-header">
          <span class="note-page-badge">
            <span class="color-indicator ${colorClass}"></span>
            Page ${hl.page || 1}
          </span>
          <button class="note-delete-btn" title="Delete highlight">🗑️</button>
        </div>
        <blockquote class="note-text-snippet ${colorClass}">${escapeHtml(hl.text)}</blockquote>
        <div class="note-user-content">
          ${hl.note ? `<span>${escapeHtml(hl.note)}</span>` : '<span style="opacity: 0.5; font-style: italic;">No note attached</span>'}
        </div>
      `;

      const deleteBtn = card.querySelector('.note-delete-btn');
      if (deleteBtn) {
        deleteBtn.addEventListener('click', () => {
          removeHighlightFromStorage(pdfUrl, hl.id, () => {
            renderNotesDrawer();
            removeHighlightElementFromDom(hl.id);
          });
        });
      }

      const userContentEl = card.querySelector('.note-user-content');
      if (userContentEl) {
        userContentEl.style.cursor = 'pointer';
        userContentEl.addEventListener('click', () => {
          const input = document.createElement('input');
          input.type = 'text';
          input.className = 'note-edit-input';
          input.value = hl.note || '';
          userContentEl.innerHTML = '';
          userContentEl.appendChild(input);
          input.focus();

          const saveEdit = () => {
            const newNote = input.value.trim();
            hl.note = newNote;
            saveHighlightToStorage(pdfUrl, hl, () => {
              renderNotesDrawer();
            });
          };

          input.addEventListener('blur', saveEdit);
          input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
              saveEdit();
            }
          });
        });
      }

      notesListEl.appendChild(card);
    });
  });
}

function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function removeHighlightElementFromDom(id) {
  if (typeof document === 'undefined') return;
  const els = document.querySelectorAll(`[data-highlight-id="${id}"]`);
  els.forEach(el => el.remove());
}

function triggerFileDownload(filename, content, contentType = 'text/plain') {
  if (typeof document === 'undefined') return;
  const blob = new Blob([content], { type: contentType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

let pendingSelectionText = '';
let pendingSelectionPage = 1;
let selectedColor = 'amber';

function setupHighlightSelectionListeners() {
  if (typeof document === 'undefined') return;

  const popover = document.getElementById('highlight-popover');
  const popoverInput = document.getElementById('popover-note-input');
  const popoverSaveBtn = document.getElementById('popover-btn-add');
  const colorDots = document.querySelectorAll('.popover-colors .neon-dot');

  colorDots.forEach(dot => {
    dot.addEventListener('click', () => {
      colorDots.forEach(d => d.classList.remove('selected'));
      dot.classList.add('selected');
      selectedColor = dot.dataset.color || 'amber';
    });
  });

  document.addEventListener('mouseup', (e) => {
    if (popover && popover.contains(e.target)) return;
    const toolbar = document.querySelector('.toolbar');
    if (toolbar && toolbar.contains(e.target)) return;
    const drawer = document.getElementById('notes-drawer');
    if (drawer && drawer.contains(e.target)) return;

    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) {
      if (popover) popover.classList.add('hidden');
      return;
    }

    const text = selection.toString().trim();
    if (!text) {
      if (popover) popover.classList.add('hidden');
      return;
    }

    let pageNum = 1;
    let node = selection.anchorNode;
    while (node && node !== document.body) {
      if (node.nodeType === 1 && node.dataset && node.dataset.pageNumber) {
        pageNum = parseInt(node.dataset.pageNumber);
        break;
      }
      if (node.nodeType === 1 && node.id && node.id.startsWith('page-wrapper-')) {
        pageNum = parseInt(node.id.replace('page-wrapper-', ''));
        break;
      }
      node = node.parentNode;
    }

    pendingSelectionText = truncateText(text);
    pendingSelectionPage = pageNum || parseInt(currentPageEl?.textContent || '1');

    if (popover) {
      try {
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        popover.style.left = `${Math.max(10, rect.left + window.scrollX + (rect.width / 2) - 90)}px`;
        popover.style.top = `${Math.max(10, rect.top + window.scrollY - 60)}px`;
        popover.classList.remove('hidden');
      } catch (err) {
        popover.classList.add('hidden');
      }
    }
  });

  if (popoverSaveBtn) {
    popoverSaveBtn.addEventListener('click', () => {
      if (!pendingSelectionText) return;
      const noteText = popoverInput ? popoverInput.value.trim() : '';
      const newHighlight = {
        id: `hl_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        page: pendingSelectionPage,
        text: pendingSelectionText,
        color: selectedColor || 'amber',
        note: noteText,
        timestamp: Date.now()
      };

      saveHighlightToStorage(pdfUrl, newHighlight, () => {
        renderNotesDrawer();
        if (popover) popover.classList.add('hidden');
        if (popoverInput) popoverInput.value = '';
        window.getSelection().removeAllRanges();
      });
    });
  }

  const btnToggleNotes = document.getElementById('btn-toggle-notes');
  const btnCloseDrawer = document.getElementById('btn-close-notes-drawer');
  const drawer = document.getElementById('notes-drawer');

  if (btnToggleNotes && drawer) {
    btnToggleNotes.addEventListener('click', () => {
      const isOpen = drawer.classList.toggle('open');
      btnToggleNotes.classList.toggle('active', isOpen);
      if (isOpen) {
        renderNotesDrawer();
      }
    });
  }

  if (btnCloseDrawer && drawer) {
    btnCloseDrawer.addEventListener('click', () => {
      drawer.classList.remove('open');
      if (btnToggleNotes) btnToggleNotes.classList.remove('active');
    });
  }

  const btnExportFullTxt = document.getElementById('btn-export-full-txt');
  const btnExportMd = document.getElementById('btn-export-md');
  const btnExportTxt = document.getElementById('btn-export-txt');

  if (btnExportFullTxt) {
    btnExportFullTxt.addEventListener('click', () => {
      exportFullPdfText();
    });
  }

  if (btnExportMd) {
    btnExportMd.addEventListener('click', () => {
      loadNotesForCurrentPdf((notes) => {
        const mdText = exportHighlights(notes, 'markdown');
        const docName = (docTitle?.textContent || 'notes').replace(/[^a-zA-Z0-9_-]/g, '_');
        triggerFileDownload(`${docName}_highlights.md`, mdText, 'text/markdown');
      });
    });
  }

  if (btnExportTxt) {
    btnExportTxt.addEventListener('click', () => {
      loadNotesForCurrentPdf((notes) => {
        const plainText = exportHighlights(notes, 'plaintext');
        const docName = (docTitle?.textContent || 'notes').replace(/[^a-zA-Z0-9_-]/g, '_');
        triggerFileDownload(`${docName}_highlights.txt`, plainText, 'text/plain');
      });
    });
  }
}

async function exportFullPdfText() {
  if (!pdfDoc) {
    alert('PDF document is still loading...');
    return;
  }
  let fullTextParts = [];
  for (let i = 1; i <= pdfDoc.numPages; i++) {
    try {
      const page = await pdfDoc.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map(item => item.str).join(' ');
      fullTextParts.push(`--- Page ${i} ---\n${pageText}`);
    } catch (e) {
      fullTextParts.push(`--- Page ${i} ---\n[Error reading text on page ${i}]`);
    }
  }
  const content = fullTextParts.join('\n\n');
  const docName = (docTitle?.textContent || 'document').replace(/[^a-zA-Z0-9_-]/g, '_');
  triggerFileDownload(`${docName}_fulltext.txt`, content, 'text/plain');
}


if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    clampNumber,
    sanitizeSettings,
    isProtectedElement,
    getReverseFilter,
    tagProtectedElements,
    getThemeBgColor,
    applyThemeFilters,
    checkMilestonePrompt,
    exportHighlights,
    saveReadingPosition,
    restoreReadingPosition,
    processOutlineItems,
    renderTocTree,
    loadTocOutline,
    navigateToPage,
    updateActiveTocHighlight,
    escapeHtml,
    sendTrackReading,
    transformWordToBionic,
    transformTextToBionic,
    applyBionicReadingToViewer,
    updateReadingRuler,
    applyFocusSettings,
    exportFullPdfText
  };
}


