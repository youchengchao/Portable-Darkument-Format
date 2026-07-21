// Set PDF.js worker source
pdfjsLib.GlobalWorkerOptions.workerSrc = 'pdfjs/pdf.worker.js';

let pdfDoc = null;
let currentScale = 1.0;
const scaleSteps = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0];
let pdfUrl = '';

// Annotation State
let currentTool = 'select'; // 'select', 'draw', 'text'
let currentColor = '#ef4444'; // default red
let currentThickness = 3;
let activePageNum = 1;

// DOM Elements
const pagesContainer = document.getElementById('pages-container');
const loadingSpinner = document.getElementById('loading-spinner');
const docTitle = document.getElementById('doc-title');
const totalPagesEl = document.getElementById('total-pages');
const currentPageEl = document.getElementById('current-page');
const zoomValueEl = document.getElementById('zoom-value');

// Buttons
const btnBack = document.getElementById('btn-back');
const btnZoomIn = document.getElementById('btn-zoom-in');
const btnZoomOut = document.getElementById('btn-zoom-out');
const btnPrevPage = document.getElementById('btn-prev-page');
const btnNextPage = document.getElementById('btn-next-page');
const btnSettings = document.getElementById('btn-settings');

// Initialize settings and load PDF
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
    docTitle.textContent = filename || 'PDF Document';
    document.title = filename || 'PDF Document';
  } catch (e) {
    docTitle.textContent = 'PDF Document';
  }

  // Load and apply themes dynamically
  chrome.storage.local.get(null, (settings) => {
    applyThemeFilters(settings);
  });

  // Load the PDF
  loadPdf(pdfUrl);

  // Setup UI Listeners
  setupEventListeners();
});

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
        currentPageEl.textContent = pageNum;
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
    
    task.promise.catch(err => {
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

// Apply settings filters to the canvas
function applyThemeFilters(settings) {
  let styleEl = document.getElementById('viewer-filter-style');
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = 'viewer-filter-style';
    document.head.appendChild(styleEl);
  }

  const badge = document.getElementById('theme-badge');

  if (!settings.active) {
    styleEl.textContent = `.pdf-page-canvas { filter: none !important; }`;
    badge.textContent = 'OFF';
    badge.style.color = '#a1a1aa';
    badge.style.borderColor = '#27273a';
    badge.style.backgroundColor = 'transparent';
    return;
  }

  const filterParts = [];
  
  // Base theme inversion filter
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

  // Adjustments sliders
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
  styleEl.textContent = `.pdf-page-canvas { filter: ${filterString} !important; }`;
  
  badge.textContent = settings.theme.toUpperCase();
  badge.style.color = '#8b5cf6';
  badge.style.borderColor = 'rgba(139, 92, 246, 0.3)';
  badge.style.backgroundColor = 'rgba(139, 92, 246, 0.15)';
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
    }
  });

  // Zoom Out
  btnZoomOut.addEventListener('click', () => {
    const currIdx = scaleSteps.indexOf(currentScale);
    if (currIdx > 0) {
      adjustZoom(scaleSteps[currIdx - 1]);
    }
  });

  // Previous Page
  btnPrevPage.addEventListener('click', () => {
    const currPage = parseInt(currentPageEl.textContent);
    if (currPage > 1) {
      const prevWrapper = document.getElementById(`page-wrapper-${currPage - 1}`);
      if (prevWrapper) {
        prevWrapper.scrollIntoView({ behavior: 'smooth' });
      }
    }
  });

  // Next Page
  btnNextPage.addEventListener('click', () => {
    const currPage = parseInt(currentPageEl.textContent);
    if (currPage < pdfDoc.numPages) {
      const nextWrapper = document.getElementById(`page-wrapper-${currPage + 1}`);
      if (nextWrapper) {
        nextWrapper.scrollIntoView({ behavior: 'smooth' });
      }
    }
  });

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
        }
      });
    }
  });

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
