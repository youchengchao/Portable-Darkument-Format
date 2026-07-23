// Set PDF.js worker source
if (typeof pdfjsLib !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'pdfjs/pdf.worker.js';
}

let pdfDoc = null;
let currentScale = 1.0;
const scaleSteps = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0];
let pdfUrl = '';
let pageObserver = null;

// Structured Tab Session Model (Feature R3)
class TabSession {
  constructor(options = {}) {
    this.id = options.id || `tab_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    this.url = options.url || '';
    this.title = options.title || 'Untitled';
    this.pdfDoc = options.pdfDoc || null;
    this.arrayBuffer = options.arrayBuffer || null;
    this.numPages = options.numPages || 0;
    this.activePageNum = options.activePageNum || 1;
    this.currentScale = options.currentScale || 1.0;
    this.scrollTop = options.scrollTop || 0;
    this.scrollLeft = options.scrollLeft || 0;
    this.tocItems = options.tocItems || [];
    this.visitedPagesSet = options.visitedPagesSet || new Set();
    this.aspectRatio = options.aspectRatio || 1.414;
    this.isLoaded = options.isLoaded || false;
  }
}

// Multi-Tab Controller Manager (Feature R3)
const TabManager = {
  tabs: [],
  activeTabId: null,

  getActiveTab() {
    return this.tabs.find(t => t.id === this.activeTabId) || null;
  },

  createTab(url = '', title = 'New Tab', dataBuffer = null) {
    const session = new TabSession({
      id: `tab_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      url: url,
      title: title || 'New Tab',
      arrayBuffer: dataBuffer,
      isLoaded: false
    });
    this.tabs.push(session);
    this.switchToTab(session.id);
    return session;
  },

  switchTab(tabId) {
    return this.switchToTab(tabId);
  },

  switchToTab(tabId) {
    if (typeof ttsController !== 'undefined' && ttsController && typeof ttsController.stop === 'function') {
      ttsController.stop();
    }
    const outgoing = this.getActiveTab();
    if (outgoing) {
      const viewArea = typeof document !== 'undefined' ? document.getElementById('pdf-view-area') : null;
      if (viewArea) {
        outgoing.scrollTop = viewArea.scrollTop || 0;
        outgoing.scrollLeft = viewArea.scrollLeft || 0;
      }
      outgoing.currentScale = outgoing.currentScale || currentScale || 1.0;
      outgoing.activePageNum = outgoing.activePageNum || activePageNum || 1;
      outgoing.visitedPagesSet = visitedPagesSet || outgoing.visitedPagesSet;
      if (typeof currentTocItems !== 'undefined') outgoing.tocItems = currentTocItems || outgoing.tocItems;
      if (pdfDoc) outgoing.pdfDoc = pdfDoc;
      if (pdfUrl) outgoing.url = pdfUrl;
    }

    const incoming = this.tabs.find(t => t.id === tabId);
    if (!incoming) return;

    this.activeTabId = incoming.id;

    pdfDoc = incoming.pdfDoc;
    pdfUrl = incoming.url;
    activePageNum = incoming.activePageNum || 1;
    currentScale = incoming.currentScale || 1.0;
    if (typeof currentTocItems !== 'undefined') currentTocItems = incoming.tocItems || [];
    visitedPagesSet = incoming.visitedPagesSet || new Set();

    const displayTitle = incoming.title || 'PDF Document';
    if (typeof document !== 'undefined') {
      document.title = displayTitle;
      const titleEl = document.getElementById('doc-title');
      if (titleEl) titleEl.textContent = displayTitle;
      const totalPagesEl = document.getElementById('total-pages');
      if (totalPagesEl) totalPagesEl.textContent = incoming.numPages || 1;
      const currentPageEl = document.getElementById('current-page');
      if (currentPageEl) currentPageEl.textContent = activePageNum;
      const zoomValueEl = document.getElementById('zoom-value');
      if (zoomValueEl) zoomValueEl.textContent = `${Math.round(currentScale * 100)}%`;
    }

    this.renderTabBarUI();

    if (incoming.pdfDoc) {
      const dropzone = typeof document !== 'undefined' ? document.getElementById('dropzone-overlay') : null;
      if (dropzone) dropzone.classList.add('hidden');

      if (typeof createPagePlaceholders === 'function') {
        createPagePlaceholders(incoming.numPages, incoming.aspectRatio || 1.414, incoming.currentScale || 1.0);
      }
      if (typeof setupIntersectionObserver === 'function') {
        setupIntersectionObserver();
      }

      const viewArea = typeof document !== 'undefined' ? document.getElementById('pdf-view-area') : null;
      if (viewArea) {
        viewArea.scrollTop = incoming.scrollTop || 0;
        viewArea.scrollLeft = incoming.scrollLeft || 0;
      }

      if (typeof renderTocTree === 'function') {
        renderTocTree(incoming.tocItems);
      }
      if (typeof renderNotesDrawer === 'function') {
        renderNotesDrawer();
      }
    } else if (incoming.url) {
      if (typeof loadPdf === 'function') {
        loadPdf(incoming.url);
      }
    } else if (incoming.arrayBuffer) {
      if (typeof loadPdfFromData === 'function') {
        loadPdfFromData(incoming.arrayBuffer);
      }
    } else {
      const pagesContainer = typeof document !== 'undefined' ? document.getElementById('pages-container') : null;
      if (pagesContainer) pagesContainer.innerHTML = '';
      const dropzone = typeof document !== 'undefined' ? document.getElementById('dropzone-overlay') : null;
      if (dropzone) dropzone.classList.remove('hidden');
      if (typeof renderTocTree === 'function') renderTocTree([]);
      if (typeof renderNotesDrawer === 'function') renderNotesDrawer();
    }
  },

  closeTab(tabId) {
    if (typeof ttsController !== 'undefined' && ttsController && typeof ttsController.stop === 'function') {
      ttsController.stop();
    }
    const index = this.tabs.findIndex(t => t.id === tabId);
    if (index === -1) return;

    const tab = this.tabs[index];
    if (tab && tab.pdfDoc) {
      try {
        tab.pdfDoc.destroy();
      } catch (e) {}
      tab.pdfDoc = null;
      tab.arrayBuffer = null;
    }

    this.tabs.splice(index, 1);

    if (this.tabs.length === 0) {
      this.createTab('', 'PDF Dark Mode');
      return;
    }

    if (this.activeTabId === tabId) {
      const nextIndex = Math.min(index, this.tabs.length - 1);
      this.switchToTab(this.tabs[nextIndex].id);
    } else {
      this.renderTabBarUI();
    }
  },

  renderTabBarUI() {
    if (typeof document === 'undefined') return;
    const tabListEl = document.getElementById('tab-list');
    if (!tabListEl) return;

    tabListEl.innerHTML = '';

    this.tabs.forEach(tab => {
      const tabEl = document.createElement('div');
      tabEl.className = `tab-item${tab.id === this.activeTabId ? ' active' : ''}`;
      tabEl.dataset.tabId = tab.id;

      const iconEl = document.createElement('span');
      iconEl.className = 'tab-icon';
      iconEl.textContent = '📄';

      const titleEl = document.createElement('span');
      titleEl.className = 'tab-title';
      titleEl.textContent = tab.title || 'Untitled';
      titleEl.title = tab.title || 'Untitled';

      const closeBtn = document.createElement('button');
      closeBtn.className = 'tab-close-btn';
      closeBtn.textContent = '✕';
      closeBtn.title = 'Close tab';
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.closeTab(tab.id);
      });

      tabEl.appendChild(iconEl);
      tabEl.appendChild(titleEl);
      tabEl.appendChild(closeBtn);

      tabEl.addEventListener('click', () => {
        if (tab.id !== this.activeTabId) {
          this.switchToTab(tab.id);
        }
      });

      tabListEl.appendChild(tabEl);
    });

    const btnAddTab = document.getElementById('btn-add-tab');
    if (btnAddTab && !btnAddTab.dataset.bound) {
      btnAddTab.dataset.bound = 'true';
      btnAddTab.addEventListener('click', () => {
        const fileInputPdf = document.getElementById('file-input-pdf');
        if (fileInputPdf) fileInputPdf.click();
      });
    }
  }
};

// Annotation State
let currentTool = 'select'; // 'select', 'draw', 'text'
let currentColor = '#ef4444'; // default red
let currentThickness = 3;
let activePageNum = 1;
let visitedPagesSet = new Set();
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

    if (pdfUrl === 'pending_local') {
      const initialTab = TabManager.createTab('pending_local', 'Local PDF Document');
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.get(null, (res) => {
          applyThemeFilters(res);
          applyFocusSettings(res);
          const pending = res ? res.pendingLocalPdf : null;
          if (pending) {
            chrome.storage.local.remove('pendingLocalPdf');
          }
          if (pending && pending.data) {
            try {
              const filename = pending.name || 'Local PDF Document';
              initialTab.title = filename;
              if (docTitle) docTitle.textContent = filename;
              document.title = filename;
              
              const binaryString = atob(pending.data);
              const bytes = new Uint8Array(binaryString.length);
              for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
              }
              if (loadingSpinner) loadingSpinner.style.display = 'none';
              loadPdfFromData(bytes.buffer);
            } catch (err) {
              console.error('Failed to decode or process pending local PDF:', err);
              if (loadingSpinner) loadingSpinner.style.display = 'none';
              const dropzone = document.getElementById('dropzone-overlay');
              if (dropzone) dropzone.classList.remove('hidden');
            }
          } else {
            if (loadingSpinner) loadingSpinner.style.display = 'none';
            const dropzone = document.getElementById('dropzone-overlay');
            if (dropzone) dropzone.classList.remove('hidden');
          }
        });
      }
      setupEventListeners();
      return;
    }

    // Handle case where viewer.html is opened directly without a PDF URL
    if (!pdfUrl) {
      if (TabManager.tabs.length === 0) {
        TabManager.createTab('', 'PDF Dark Mode');
      }
      handleParameterlessStartup();
      return;
    }

    let filename = 'PDF Document';
    try {
      filename = decodeURIComponent(pdfUrl.substring(pdfUrl.lastIndexOf('/') + 1)) || 'PDF Document';
    } catch (e) {}

    TabManager.createTab(pdfUrl, filename);
    if (docTitle) docTitle.textContent = filename;
    document.title = filename;

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

// Handle parameterless startup DOM state and settings loading
function handleParameterlessStartup() {
  const docTitleEl = docTitle || (typeof document !== 'undefined' ? document.getElementById('doc-title') : null);
  const spinnerEl = loadingSpinner || (typeof document !== 'undefined' ? document.getElementById('loading-spinner') : null);
  const dropzone = typeof document !== 'undefined' ? document.getElementById('dropzone-overlay') : null;

  if (docTitleEl) docTitleEl.textContent = 'PDF Dark Mode';
  if (typeof document !== 'undefined') document.title = 'PDF Dark Mode';
  if (spinnerEl) spinnerEl.style.display = 'none';
  if (dropzone) dropzone.classList.remove('hidden');

  // Load stored theme settings even in empty dropzone state
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get(null, (settings) => {
      applyThemeFilters(settings);
      applyFocusSettings(settings);
    });
  }

  // Always setup UI listeners so Drag & Drop and File Picker work
  setupEventListeners();
}

// Helper to sanitize local file:// URLs (avoids double encoding and preserves drive letter colons)
function sanitizeFileUrl(url) {
  if (!url || typeof url !== 'string') return url;
  if (!url.startsWith('file:///')) return url;
  
  // Extract path part
  let path = url.substring(8);
  
  // Check if it starts with a drive letter, e.g. "C:" or "C%3A" or "C|"
  let drivePrefix = '';
  if (path.substring(1, 3) === ':/') {
    drivePrefix = path.substring(0, 2);
    path = path.substring(2);
  } else if (path[1] === '|' || path.substring(1, 3) === '|/') {
    drivePrefix = path.substring(0, 1) + ':';
    path = path.substring(2);
  } else if (path.substring(1, 5).toUpperCase() === '%3A/') {
    drivePrefix = path.substring(0, 1) + ':';
    path = path.substring(4);
  }
  
  // Sanitize the remaining path segments
  const sanitizedSegments = path.split('/')
    .map(seg => {
      try {
        return encodeURIComponent(decodeURIComponent(seg));
      } catch (e) {
        return seg;
      }
    });
    
  return 'file:///' + drivePrefix + sanitizedSegments.join('/');
}

// Load the PDF via PDF.js or local XMLHttp/Fetch diagnostic pipeline
function loadPdf(url) {
  if (!url) return;
  if (typeof pdfjsLib === 'undefined') return;
  if (loadingSpinner) loadingSpinner.style.display = 'flex';
  url = sanitizeFileUrl(url);

  const loadingTask = pdfjsLib.getDocument({
    url: url,
    cMapUrl: 'pdfjs/cmaps/',
    cMapPacked: true
  });

  loadingTask.promise.then(pdf => {
    pdfDoc = pdf;
    const activeTab = TabManager.getActiveTab();
    if (activeTab) {
      activeTab.pdfDoc = pdf;
      activeTab.numPages = pdf.numPages;
      activeTab.isLoaded = true;
      activeTab.url = url;
    }
    if (totalPagesEl) totalPagesEl.textContent = pdf.numPages;
    if (loadingSpinner) loadingSpinner.style.display = 'none';

    pdf.getPage(1).then(page => {
      const viewport = page.getViewport({ scale: 1.0 });
      const aspectRatio = viewport.height / viewport.width;
      if (activeTab) activeTab.aspectRatio = aspectRatio;
      const targetScale = activeTab ? (activeTab.currentScale || currentScale || 1.0) : (currentScale || 1.0);
      createPagePlaceholders(pdf.numPages, aspectRatio, targetScale);
      setupIntersectionObserver();
      restoreReadingPosition();
      loadTocOutline(pdf);
    });
  }).catch(error => {
    console.log('PDF.js Direct Load failed, trying Background Relay...', error);
    tryBackgroundRelay();
  });

  function tryBackgroundRelay() {
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      try {
        chrome.runtime.sendMessage({ action: 'read_file_bytes', url: url }, (res) => {
          if (chrome.runtime.lastError || !res || !res.success || !res.data) {
            showDropzoneFallback();
            return;
          }
          const binaryString = atob(res.data);
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          loadPdfFromData(bytes.buffer);
        });
      } catch (e) {
        showDropzoneFallback();
      }
    } else {
      showDropzoneFallback();
    }
  }

  function showDropzoneFallback() {
    if (loadingSpinner) loadingSpinner.style.display = 'none';
    const dropzone = document.getElementById('dropzone-overlay');
    if (dropzone) dropzone.classList.remove('hidden');
  }
}

function loadPdfFromData(arrayBuffer) {
  if (typeof pdfjsLib === 'undefined') return;

  const loadingTask = pdfjsLib.getDocument({
    data: arrayBuffer,
    cMapUrl: 'pdfjs/cmaps/',
    cMapPacked: true
  });
  
  loadingTask.promise.then(pdf => {
    pdfDoc = pdf;
    const activeTab = TabManager.getActiveTab();
    if (activeTab) {
      activeTab.pdfDoc = pdf;
      activeTab.numPages = pdf.numPages;
      activeTab.isLoaded = true;
      if (pdfUrl) activeTab.url = pdfUrl;
    }
    if (totalPagesEl) totalPagesEl.textContent = pdf.numPages;
    if (loadingSpinner) loadingSpinner.style.display = 'none';

    // Get viewport aspect ratio of the first page to create placeholder wrappers
    pdf.getPage(1).then(page => {
      const viewport = page.getViewport({ scale: 1.0 });
      const aspectRatio = viewport.height / viewport.width;
      if (activeTab) activeTab.aspectRatio = aspectRatio;
      const targetScale = activeTab ? (activeTab.currentScale || currentScale || 1.0) : (currentScale || 1.0);
      createPagePlaceholders(pdf.numPages, aspectRatio, targetScale);
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
function createPagePlaceholders(numPages, aspectRatio, targetScale = 1.0) {
  if (!pagesContainer) return;
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
  
  // Set page width based on target scale (default 1.0 if not specified)
  adjustZoom(targetScale);
}

// Render page content inside the canvas
function renderPage(pageNum) {
  const wrapper = typeof document !== 'undefined' ? document.getElementById(`page-wrapper-${pageNum}`) : null;
  if (!wrapper || wrapper.dataset.rendered === 'true') return;

  const targetTabId = TabManager.activeTabId;
  if (targetTabId && TabManager.activeTabId !== targetTabId) return;
  if (!pdfDoc) return;

  wrapper.dataset.rendered = 'true';
  
  // Show a loading text or small spinner in wrapper
  const loader = typeof document !== 'undefined' ? document.createElement('div') : null;
  if (loader) {
    loader.className = 'spinner';
    loader.style.position = 'absolute';
    loader.style.top = 'calc(50% - 20px)';
    loader.style.left = 'calc(50% - 20px)';
    wrapper.appendChild(loader);
  }

  pdfDoc.getPage(pageNum).then(page => {
    if (targetTabId && TabManager.activeTabId !== targetTabId) {
      wrapper.dataset.rendered = 'false';
      if (loader && loader.parentNode) loader.remove();
      return;
    }

    // Determine scale for canvas
    const viewport = page.getViewport({ scale: currentScale * 2 }); // Render at 2x scale for sharpness
    
    const canvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
    if (canvas) {
      canvas.className = 'pdf-page-canvas';
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      canvas.style.width = '100%';
      canvas.style.height = '100%';
    }

    const context = canvas ? canvas.getContext('2d') : null;
    const renderContext = {
      canvasContext: context,
      viewport: viewport
    };

    page.render(renderContext).promise.then(() => {
      if (targetTabId && TabManager.activeTabId !== targetTabId) {
        wrapper.dataset.rendered = 'false';
        if (loader && loader.parentNode) loader.remove();
        return;
      }

      // Remove loader and add canvas
      if (loader && loader.parentNode) loader.remove();
      if (canvas) wrapper.appendChild(canvas);
      
      // Render text layer for selection
      renderTextLayer(page, viewport, wrapper);
      
      // Create annotation layer overlay
      createAnnotationLayer(wrapper, viewport);

      // Tag diagram & image elements in page wrapper for color protection
      tagProtectedElements(wrapper);
    }).catch(err => {
      wrapper.dataset.rendered = 'false';
      if (loader && loader.parentNode) loader.remove();
    });
  }).catch(err => {
    console.error(`Error rendering page ${pageNum}:`, err);
    wrapper.dataset.rendered = 'false';
    if (loader && loader.parentNode) loader.remove();
  });
}

// Setup IntersectionObserver for lazy loading pages as they scroll
function setupIntersectionObserver() {
  if (pageObserver) {
    try {
      pageObserver.disconnect();
    } catch (e) {}
    pageObserver = null;
  }

  const options = {
    root: typeof document !== 'undefined' ? document.getElementById('pdf-view-area') : null,
    rootMargin: '200px 0px', // start loading before they scroll into view
    threshold: 0.1
  };

  if (typeof IntersectionObserver === 'undefined') return;

  pageObserver = new IntersectionObserver((entries) => {
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
  const wrappers = typeof document !== 'undefined' ? document.querySelectorAll('.page-wrapper') : [];
  wrappers.forEach(wrapper => pageObserver.observe(wrapper));
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

  if (typeof ttsController !== 'undefined' && ttsController && typeof ttsController.rebindSpans === 'function') {
    ttsController.rebindSpans();
  }
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
  if (typeof document === 'undefined' || !document.querySelectorAll) return;
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

    const activeTab = TabManager.getActiveTab();
    if (activeTab) {
      activeTab.scrollTop = scrollTop;
      activeTab.scrollLeft = scrollLeft;
      activeTab.activePageNum = page;
      activeTab.currentScale = zoom;
    }

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
      const activeTab = TabManager.getActiveTab();
      if (activeTab) activeTab.tocItems = processedTree;
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
  if (btnBack) {
    btnBack.addEventListener('click', () => {
      if (!pdfUrl) return;
      // Append native=true to PDF URL to bypass extension redirection loop
      const divider = pdfUrl.includes('?') ? '&' : '?';
      window.location.href = pdfUrl + divider + 'native=true';
    });
  }

  // Zoom In
  if (btnZoomIn) {
    btnZoomIn.addEventListener('click', () => {
      const currIdx = scaleSteps.indexOf(currentScale);
      if (currIdx < scaleSteps.length - 1) {
        adjustZoom(scaleSteps[currIdx + 1]);
        saveReadingPosition(true);
      }
    });
  }

  // Zoom Out
  if (btnZoomOut) {
    btnZoomOut.addEventListener('click', () => {
      const currIdx = scaleSteps.indexOf(currentScale);
      if (currIdx > 0) {
        adjustZoom(scaleSteps[currIdx - 1]);
        saveReadingPosition(true);
      }
    });
  }

  // Previous Page
  if (btnPrevPage) {
    btnPrevPage.addEventListener('click', () => {
      const currPage = parseInt(currentPageEl ? currentPageEl.textContent : '1');
      if (currPage > 1) {
        navigateToPage(currPage - 1);
      }
    });
  }

  // --- SEARCH BAR OVERLAY EVENT LISTENERS (Ctrl+F) ---
  setupSearchOverlayListeners();

  // --- GLOBAL KEYBOARD NAVIGATION LISTENERS ---
  setupKeyboardShortcuts();

  // --- FILE OPEN & DRAG AND DROP LISTENERS ---
  setupFileOpenAndDragDropListeners();

  // --- TEXT-TO-SPEECH (TTS) NARRATION LISTENERS ---
  if (typeof ttsController !== 'undefined' && ttsController) {
    ttsController.init();
  }



  // Next Page
  if (btnNextPage) {
    btnNextPage.addEventListener('click', () => {
      const currPage = parseInt(currentPageEl ? currentPageEl.textContent : '1');
      if (pdfDoc && currPage < pdfDoc.numPages) {
        navigateToPage(currPage + 1);
      }
    });
  }

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

  if (typeof window !== 'undefined') {
    window.addEventListener('visibilitychange', () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        saveReadingPosition(true);
      }
    });

    window.addEventListener('beforeunload', () => {
      saveReadingPosition(true);
      if (typeof ttsController !== 'undefined' && ttsController && typeof ttsController.stop === 'function') {
        ttsController.stop();
      }
    });
  }

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

  // Open native in-viewer Settings Modal
  if (btnSettings) {
    btnSettings.addEventListener('click', () => {
      openSettingsModal();
    });
  }

  setupSettingsModalListeners();


  // Listen to changes in chrome.storage.local
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local') {
      chrome.storage.local.get(null, (settings) => {
        // If mode is changed back to classic, we should reload this page back to original PDF!
        if (settings.mode === 'classic' && pdfUrl) {
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
  if (btnToggleAnnotate) {
    btnToggleAnnotate.addEventListener('click', () => {
      const isHidden = annotationBar ? annotationBar.classList.toggle('hidden') : true;
      btnToggleAnnotate.classList.toggle('active', !isHidden);
      
      // Default back to Select tool when toggled
      setTool('select');
    });
  }

  // Tool switches
  function setTool(tool) {
    currentTool = tool;
    const btnSelect = document.getElementById('btn-tool-select');
    const btnDraw = document.getElementById('btn-tool-draw');
    const btnText = document.getElementById('btn-tool-text');
    if (btnSelect) btnSelect.classList.toggle('active', tool === 'select');
    if (btnDraw) btnDraw.classList.toggle('active', tool === 'draw');
    if (btnText) btnText.classList.toggle('active', tool === 'text');
    updateToolsState();
  }

  const btnToolSelect = document.getElementById('btn-tool-select');
  const btnToolDraw = document.getElementById('btn-tool-draw');
  const btnToolText = document.getElementById('btn-tool-text');
  if (btnToolSelect) btnToolSelect.addEventListener('click', () => setTool('select'));
  if (btnToolDraw) btnToolDraw.addEventListener('click', () => setTool('draw'));
  if (btnToolText) btnToolText.addEventListener('click', () => setTool('text'));

  // Color picker
  const colorDots = typeof document !== 'undefined' && document.querySelectorAll ? document.querySelectorAll('.color-dot') : [];
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
  if (penSizeInput) {
    penSizeInput.addEventListener('input', (e) => {
      currentThickness = parseInt(e.target.value);
      if (penSizeVal) penSizeVal.textContent = `${currentThickness}px`;
    });
  }

  // Clear current page annotations
  const btnClearPage = document.getElementById('btn-clear-page');
  if (btnClearPage) {
    btnClearPage.addEventListener('click', () => {
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
  }

  // --- HIGHLIGHT & SIDE DRAWER EVENT LISTENERS ---
  setupHighlightSelectionListeners();
  renderNotesDrawer();

  // 4. Drag & Drop Fallback Event Listeners
  if (typeof window !== 'undefined') {
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

let searchMatches = [];
let activeMatchIdx = -1;

function setupSearchOverlayListeners() {
  if (typeof document === 'undefined') return;
  const searchBar = document.getElementById('search-bar');
  const searchInput = document.getElementById('search-input');
  const btnPrev = document.getElementById('btn-search-prev');
  const btnNext = document.getElementById('btn-search-next');
  const btnClose = document.getElementById('btn-close-search');

  if (!searchBar || !searchInput) return;

  searchInput.addEventListener('input', () => {
    performSearch(searchInput.value.trim());
  });

  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) {
        navigateSearchMatch(-1);
      } else {
        navigateSearchMatch(1);
      }
    } else if (e.key === 'Escape') {
      closeSearchBar();
    }
  });

  if (btnPrev) btnPrev.addEventListener('click', () => navigateSearchMatch(-1));
  if (btnNext) btnNext.addEventListener('click', () => navigateSearchMatch(1));
  if (btnClose) btnClose.addEventListener('click', closeSearchBar);
}

function openSearchBar() {
  if (typeof document === 'undefined') return;
  const searchBar = document.getElementById('search-bar');
  const searchInput = document.getElementById('search-input');
  if (searchBar) {
    searchBar.classList.remove('hidden');
    if (searchInput) {
      searchInput.focus();
      searchInput.select();
    }
  }
}

function closeSearchBar() {
  if (typeof document === 'undefined') return;
  const searchBar = document.getElementById('search-bar');
  if (searchBar) searchBar.classList.add('hidden');
  clearSearchMatches();
}

function clearSearchMatches() {
  if (typeof document === 'undefined') return;
  const oldMatches = document.querySelectorAll('.search-match');
  oldMatches.forEach(el => {
    const parent = el.parentNode;
    if (parent) {
      parent.replaceChild(document.createTextNode(el.textContent), el);
      parent.normalize();
    }
  });
  searchMatches = [];
  activeMatchIdx = -1;
  updateSearchCountUI();
}

function performSearch(query) {
  clearSearchMatches();
  if (!query || query.length === 0) return;

  const textSpans = document.querySelectorAll('.textLayer span');
  const lowerQuery = query.toLowerCase();

  textSpans.forEach(span => {
    const text = span.textContent;
    const lowerText = text.toLowerCase();
    if (lowerText.includes(lowerQuery)) {
      const parts = text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
      span.innerHTML = '';
      parts.forEach(part => {
        if (part.toLowerCase() === lowerQuery) {
          const matchSpan = document.createElement('span');
          matchSpan.className = 'search-match';
          matchSpan.textContent = part;
          span.appendChild(matchSpan);
          searchMatches.push(matchSpan);
        } else {
          span.appendChild(document.createTextNode(part));
        }
      });
    }
  });

  if (searchMatches.length > 0) {
    activeMatchIdx = 0;
    highlightActiveMatch();
  } else {
    updateSearchCountUI();
  }
}

function navigateSearchMatch(direction) {
  if (searchMatches.length === 0) return;
  activeMatchIdx += direction;
  if (activeMatchIdx >= searchMatches.length) activeMatchIdx = 0;
  if (activeMatchIdx < 0) activeMatchIdx = searchMatches.length - 1;
  highlightActiveMatch();
}

function highlightActiveMatch() {
  searchMatches.forEach(m => m.classList.remove('active-match'));
  if (activeMatchIdx >= 0 && activeMatchIdx < searchMatches.length) {
    const target = searchMatches[activeMatchIdx];
    target.classList.add('active-match');
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  updateSearchCountUI();
}

function updateSearchCountUI() {
  if (typeof document === 'undefined') return;
  const countEl = document.getElementById('search-count');
  if (!countEl) return;
  if (searchMatches.length === 0) {
    countEl.textContent = '0 / 0';
  } else {
    countEl.textContent = `${activeMatchIdx + 1} / ${searchMatches.length}`;
  }
}

function setupKeyboardShortcuts() {
  if (typeof document === 'undefined' || typeof window === 'undefined') return;

  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
      e.preventDefault();
      openSearchBar();
      return;
    }

    const activeEl = document.activeElement;
    if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable)) {
      return;
    }

    if (e.key === 'j' || e.key === 'J') {
      const currPage = parseInt(currentPageEl?.textContent || '1');
      if (pdfDoc && currPage < pdfDoc.numPages) navigateToPage(currPage + 1);
    } else if (e.key === 'k' || e.key === 'K') {
      const currPage = parseInt(currentPageEl?.textContent || '1');
      if (currPage > 1) navigateToPage(currPage - 1);
    }
  });
}



function openSettingsModal() {
  if (typeof document === 'undefined') return;
  const modal = document.getElementById('settings-modal');
  if (!modal) return;

  chrome.storage.local.get(null, (settings) => {
    const s = sanitizeSettings(settings);
    const themeSelect = document.getElementById('viewer-theme-select');
    const sliderBright = document.getElementById('viewer-slider-brightness');
    const sliderContrast = document.getElementById('viewer-slider-contrast');
    const brightVal = document.getElementById('viewer-bright-val');
    const contrastVal = document.getElementById('viewer-contrast-val');
    const protectToggle = document.getElementById('viewer-protect-toggle');
    const bionicToggle = document.getElementById('viewer-bionic-toggle');
    const rulerToggle = document.getElementById('viewer-ruler-toggle');

    if (themeSelect) themeSelect.value = s.theme || 'oled';
    if (sliderBright) sliderBright.value = s.brightness;
    if (brightVal) brightVal.textContent = `${s.brightness}%`;
    if (sliderContrast) sliderContrast.value = s.contrast;
    if (contrastVal) contrastVal.textContent = `${s.contrast}%`;
    if (protectToggle) protectToggle.checked = s.protectDiagrams !== false;
    if (bionicToggle) bionicToggle.checked = Boolean(settings.bionicReading);
    if (rulerToggle) rulerToggle.checked = Boolean(settings.readingRuler);

    modal.classList.remove('hidden');
  });
}

function closeSettingsModal() {
  if (typeof document === 'undefined') return;
  const modal = document.getElementById('settings-modal');
  if (modal) modal.classList.add('hidden');
}

function setupSettingsModalListeners() {
  if (typeof document === 'undefined') return;
  const btnClose = document.getElementById('btn-close-settings-modal');
  const backdrop = document.getElementById('settings-modal-backdrop');
  const themeSelect = document.getElementById('viewer-theme-select');
  const sliderBright = document.getElementById('viewer-slider-brightness');
  const sliderContrast = document.getElementById('viewer-slider-contrast');
  const brightVal = document.getElementById('viewer-bright-val');
  const contrastVal = document.getElementById('viewer-contrast-val');
  const protectToggle = document.getElementById('viewer-protect-toggle');
  const bionicToggle = document.getElementById('viewer-bionic-toggle');
  const rulerToggle = document.getElementById('viewer-ruler-toggle');

  if (btnClose) btnClose.addEventListener('click', closeSettingsModal);
  if (backdrop) backdrop.addEventListener('click', closeSettingsModal);

  if (themeSelect) {
    themeSelect.addEventListener('change', (e) => {
      chrome.storage.local.set({ theme: e.target.value });
    });
  }
  if (sliderBright) {
    sliderBright.addEventListener('input', (e) => {
      const val = parseInt(e.target.value);
      if (brightVal) brightVal.textContent = `${val}%`;
      chrome.storage.local.set({ brightness: val });
    });
  }
  if (sliderContrast) {
    sliderContrast.addEventListener('input', (e) => {
      const val = parseInt(e.target.value);
      if (contrastVal) contrastVal.textContent = `${val}%`;
      chrome.storage.local.set({ contrast: val });
    });
  }
  if (protectToggle) {
    protectToggle.addEventListener('change', (e) => {
      chrome.storage.local.set({ protectDiagrams: e.target.checked });
    });
  }
  if (bionicToggle) {
    bionicToggle.addEventListener('change', (e) => {
      chrome.storage.local.set({ bionicReading: e.target.checked });
    });
  }
  if (rulerToggle) {
    rulerToggle.addEventListener('change', (e) => {
      chrome.storage.local.set({ readingRuler: e.target.checked });
    });
  }
}

function loadPdfFileFromDisk(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(evt) {
    const arrayBuffer = evt.target.result;
    const activeTab = TabManager.getActiveTab();
    if (!activeTab || activeTab.isLoaded || activeTab.url) {
      // Opening a new tab for this file — do NOT set url to filename
      // so switchToTab uses the arrayBuffer path instead of loadPdf(url)
      const tab = TabManager.createTab('', file.name, arrayBuffer);
      tab.arrayBuffer = arrayBuffer;
      tab.title = file.name;
      // switchToTab (called by createTab) will detect arrayBuffer and
      // call loadPdfFromData — no need to call it again here
    } else {
      // Reuse the current empty tab
      activeTab.title = file.name;
      activeTab.url = '';
      activeTab.arrayBuffer = arrayBuffer;
      pdfUrl = '';
      if (docTitle) docTitle.textContent = file.name;
      if (typeof document !== 'undefined') document.title = file.name;
      TabManager.renderTabBarUI();
      const dropzone = typeof document !== 'undefined' ? document.getElementById('dropzone-overlay') : null;
      if (dropzone) dropzone.classList.add('hidden');
      loadPdfFromData(arrayBuffer);
    }
  };
  reader.readAsArrayBuffer(file);
}

// =========================================================================
// Feature R4: Text-to-Speech (TTS) Narration & Highlighting Controller
// =========================================================================
class TTSController {
  constructor() {
    this.synth = null;
    this.voices = [];
    this.selectedVoice = null;
    this.rate = 1.0;
    this.pitch = 1.0;
    this.sentences = [];
    this.currentIndex = 0;
    this.isPlaying = false;
    this.isPaused = false;
    this.utterance = null;
    this.isPanelOpen = false;
    this._stoppedAtEnd = false;
  }

  getSynth() {
    if (!this.synth) {
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        this.synth = window.speechSynthesis;
      } else if (typeof globalThis !== 'undefined' && globalThis.speechSynthesis) {
        this.synth = globalThis.speechSynthesis;
      } else if (typeof global !== 'undefined' && global.speechSynthesis) {
        this.synth = global.speechSynthesis;
      }
    }
    return this.synth;
  }

  init() {
    if (typeof document === 'undefined') return;

    this.populateVoices();
    const synth = this.getSynth();
    if (synth && typeof synth.onvoiceschanged !== 'undefined') {
      synth.onvoiceschanged = () => this.populateVoices();
    }

    const btnToggle = document.getElementById('btn-toggle-tts');
    const btnPlay = document.getElementById('tts-btn-play');
    const btnStop = document.getElementById('tts-btn-stop');
    const btnPrev = document.getElementById('tts-btn-prev');
    const btnNext = document.getElementById('tts-btn-next');
    const selectSpeed = document.getElementById('tts-select-speed');
    const selectVoice = document.getElementById('tts-select-voice');

    if (btnToggle) {
      btnToggle.onclick = () => this.togglePanel();
    }
    if (btnPlay) {
      btnPlay.onclick = () => {
        if (this.isPlaying && !this.isPaused) {
          this.pause();
        } else if (this.isPaused) {
          this.resume();
        } else {
          this.play();
        }
      };
    }
    if (btnStop) {
      btnStop.onclick = () => this.stop();
    }
    if (btnPrev) {
      btnPrev.onclick = () => this.prev();
    }
    if (btnNext) {
      btnNext.onclick = () => this.next();
    }
    if (selectSpeed) {
      selectSpeed.onchange = (e) => this.setRate(parseFloat(e.target.value));
    }
    if (selectVoice) {
      selectVoice.onchange = (e) => this.setVoice(e.target.value);
    }
  }

  togglePanel() {
    if (typeof document === 'undefined') return;
    const panel = document.getElementById('tts-panel');
    if (!panel) return;

    if (panel.classList.contains('hidden')) {
      panel.classList.remove('hidden');
      this.isPanelOpen = true;
      if (this.sentences.length === 0) {
        this.loadSentencesFromDOM();
      }
    } else {
      panel.classList.add('hidden');
      this.isPanelOpen = false;
      this.stop();
    }
  }

  populateVoices() {
    const synth = this.getSynth();
    if (!synth || typeof synth.getVoices !== 'function') return;

    this.voices = synth.getVoices() || [];
    if (typeof document === 'undefined') return;

    const selectVoice = document.getElementById('tts-select-voice');
    if (!selectVoice) return;

    selectVoice.innerHTML = '<option value="">Default Voice</option>';
    this.voices.forEach((voice) => {
      const option = document.createElement('option');
      const val = voice.voiceURI || voice.name;
      option.value = val;
      option.textContent = `${voice.name} (${voice.lang})${voice.default ? ' — Default' : ''}`;
      selectVoice.appendChild(option);
    });
  }

  extractSentencesFromDOM(container = document) {
    if (!container || typeof container.querySelectorAll !== 'function') {
      return [];
    }

    const spans = Array.from(container.querySelectorAll('.textLayer span'));
    if (spans.length === 0) {
      return [];
    }

    const sentences = [];
    let currentText = '';
    let currentSpans = [];

    spans.forEach(span => {
      const text = span.textContent || '';
      if (!text.trim()) return;

      const regex = /([^.!?\n]+[.!?\n]+|[^.!?\n]+$)/g;
      let match;
      let isFirstInSpan = true;

      while ((match = regex.exec(text)) !== null) {
        const chunk = match[0];
        if (!chunk) continue;
        if (!chunk.trim() && !currentText.trim()) continue;

        if (!isFirstInSpan && currentText.trim()) {
          sentences.push({
            text: currentText.trim(),
            spans: [...currentSpans]
          });
          currentText = '';
          currentSpans = [];
        }

        if (currentText && !/[\s.!?\n]$/.test(currentText) && !/^\s/.test(chunk)) {
          currentText += ' ';
        }
        currentText += chunk;
        if (chunk.trim() && !currentSpans.includes(span)) {
          currentSpans.push(span);
        }

        if (/[.!?\n]$/.test(chunk.trim())) {
          sentences.push({
            text: currentText.trim(),
            spans: [...currentSpans]
          });
          currentText = '';
          currentSpans = [];
        }

        isFirstInSpan = false;
      }
    });

    if (currentText.trim()) {
      sentences.push({
        text: currentText.trim(),
        spans: [...currentSpans]
      });
    }

    return sentences;
  }

  extractSentencesFromText(text) {
    if (!text || typeof text !== 'string') return [];
    const parts = text.split(/(?<=[.!?\n])\s+/);
    return parts
      .map(p => p.trim())
      .filter(p => p.length > 0)
      .map(sentenceText => ({
        text: sentenceText,
        spans: []
      }));
  }

  loadSentencesFromDOM(container = document) {
    this.sentences = this.extractSentencesFromDOM(container);
    this.currentIndex = 0;
    this._stoppedAtEnd = false;
    this.updateProgressUI();
    return this.sentences;
  }

  loadSentencesFromText(text) {
    this.sentences = this.extractSentencesFromText(text);
    this.currentIndex = 0;
    this._stoppedAtEnd = false;
    this.updateProgressUI();
    return this.sentences;
  }

  rebindSpans(container = document) {
    if (this.sentences.length === 0) return;
    const newSentences = this.extractSentencesFromDOM(container);
    if (newSentences.length === 0) return;

    for (let i = 0; i < this.sentences.length; i++) {
      if (newSentences[i] && newSentences[i].text === this.sentences[i].text) {
        this.sentences[i].spans = newSentences[i].spans;
      } else {
        const match = newSentences.find(s => s.text === this.sentences[i].text);
        if (match) {
          this.sentences[i].spans = match.spans;
        } else if (newSentences[i]) {
          this.sentences[i].spans = newSentences[i].spans;
        }
      }
    }
    if (this.isPlaying || this.isPaused || this.isPanelOpen) {
      this.highlightCurrentSentence();
    }
  }

  updateProgressUI() {
    if (typeof document === 'undefined' || typeof document.getElementById !== 'function') return;
    const progressEl = document.getElementById('tts-progress');
    if (progressEl) {
      const total = this.sentences.length;
      const current = total > 0 && (this.isPlaying || this.isPaused || this.currentIndex > 0) ? Math.min(this.currentIndex + 1, total) : 0;
      progressEl.textContent = `${current} / ${total}`;
    }

    const btnPlay = document.getElementById('tts-btn-play');
    if (btnPlay) {
      btnPlay.textContent = (this.isPlaying && !this.isPaused) ? '⏸' : '▶';
    }
  }

  highlightCurrentSentence() {
    if (typeof document !== 'undefined' && typeof document.querySelectorAll === 'function') {
      const existing = document.querySelectorAll('.tts-sentence-highlight');
      if (existing && existing.forEach) {
        existing.forEach(el => {
          if (el && el.classList && typeof el.classList.remove === 'function') {
            el.classList.remove('tts-sentence-highlight');
          }
        });
      }
    }

    if (this.currentIndex < 0 || this.currentIndex >= this.sentences.length) {
      return;
    }

    let currentSentence = this.sentences[this.currentIndex];
    if (currentSentence && currentSentence.spans && currentSentence.spans.length > 0) {
      const isDetached = currentSentence.spans.some(span => typeof document !== 'undefined' && document.body && typeof document.body.contains === 'function' && !document.body.contains(span));
      if (isDetached) {
        this.rebindSpans();
        currentSentence = this.sentences[this.currentIndex];
      }
    }

    if (currentSentence && currentSentence.spans && currentSentence.spans.length > 0) {
      currentSentence.spans.forEach(span => {
        if (span && span.classList && typeof span.classList.add === 'function') {
          span.classList.add('tts-sentence-highlight');
        }
      });

      const firstSpan = currentSentence.spans[0];
      if (firstSpan && typeof firstSpan.scrollIntoView === 'function') {
        firstSpan.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }

  play() {
    this._stoppedAtEnd = false;
    if (this.sentences.length === 0) {
      this.loadSentencesFromDOM();
    }

    if (this.sentences.length === 0) return;

    if (this.isPaused) {
      this.resume();
      return;
    }

    this.isPlaying = true;
    this.isPaused = false;
    this.speakCurrentSentence();
  }

  speakCurrentSentence() {
    const synth = this.getSynth();
    if (!synth) return;

    if (this.currentIndex < 0 || this.currentIndex >= this.sentences.length) {
      this.stop();
      return;
    }

    synth.cancel();

    this.highlightCurrentSentence();
    this.updateProgressUI();

    const sentence = this.sentences[this.currentIndex];
    if (!sentence || !sentence.text) {
      this.next();
      return;
    }

    const UtteranceClass = (typeof window !== 'undefined' && window.SpeechSynthesisUtterance) ||
                           (typeof globalThis !== 'undefined' && globalThis.SpeechSynthesisUtterance) ||
                           (typeof global !== 'undefined' && global.SpeechSynthesisUtterance) || null;

    if (!UtteranceClass) return;

    let utt = new UtteranceClass(sentence.text);
    if (typeof BrowserCompat !== 'undefined' && typeof BrowserCompat.protectUtterance === 'function') {
      utt = BrowserCompat.protectUtterance(utt);
    }
    utt.rate = this.rate;
    utt.pitch = this.pitch;
    if (this.selectedVoice) {
      utt.voice = this.selectedVoice;
    }

    utt.onstart = () => {
      this.isPlaying = true;
      this.isPaused = false;
      this.updateProgressUI();
    };

    utt.onend = () => {
      if (this.isPlaying && !this.isPaused) {
        if (this.currentIndex < this.sentences.length - 1) {
          this.currentIndex++;
          this.speakCurrentSentence();
        } else {
          this.stop();
          this._stoppedAtEnd = true;
        }
      }
    };

    utt.onerror = () => {
      this.stop();
    };

    this.utterance = utt;
    synth.speak(utt);
  }

  pause() {
    const synth = this.getSynth();
    if (synth && (this.isPlaying || synth.speaking)) {
      synth.pause();
      this.isPaused = true;
      this.isPlaying = false;
      this.updateProgressUI();
    }
  }

  resume() {
    const synth = this.getSynth();
    if (synth && this.isPaused) {
      if (this.utterance) {
        this.utterance.rate = this.rate;
      }
      synth.resume();
      this.isPaused = false;
      this.isPlaying = true;
      this.updateProgressUI();
    } else if (!this.isPlaying) {
      this.play();
    }
  }

  stop() {
    const synth = this.getSynth();
    if (synth) {
      synth.cancel();
    }
    this.isPlaying = false;
    this.isPaused = false;
    this.currentIndex = 0;
    this.utterance = null;
    this._stoppedAtEnd = false;
    if (typeof document !== 'undefined' && typeof document.querySelectorAll === 'function') {
      const existing = document.querySelectorAll('.tts-sentence-highlight');
      if (existing && existing.forEach) {
        existing.forEach(el => {
          if (el && el.classList && typeof el.classList.remove === 'function') {
            el.classList.remove('tts-sentence-highlight');
          }
        });
      }
    }
    this.updateProgressUI();
  }

  prev() {
    if (this.sentences.length === 0) return;
    this._stoppedAtEnd = false;
    const wasPlaying = this.isPlaying;
    this.currentIndex = Math.max(0, this.currentIndex - 1);
    this.highlightCurrentSentence();
    this.updateProgressUI();
    if (wasPlaying) {
      this.speakCurrentSentence();
    }
  }

  next() {
    if (this.sentences.length === 0) return;
    if (this._stoppedAtEnd) {
      this._stoppedAtEnd = false;
      this.currentIndex = 0;
      this.highlightCurrentSentence();
      this.updateProgressUI();
      return;
    }
    const wasPlaying = this.isPlaying;
    if (this.currentIndex < this.sentences.length - 1) {
      this.currentIndex++;
      this.highlightCurrentSentence();
      this.updateProgressUI();
      if (wasPlaying) {
        this.speakCurrentSentence();
      }
    } else {
      this.stop();
      this._stoppedAtEnd = true;
    }
  }

  setRate(rate) {
    this.rate = rate;
    const selectSpeed = (typeof document !== 'undefined' && typeof document.getElementById === 'function') ? document.getElementById('tts-select-speed') : null;
    if (selectSpeed && selectSpeed.value !== rate.toString()) {
      selectSpeed.value = rate.toString();
    }
    if (this.utterance) {
      this.utterance.rate = rate;
    }
    if (this.isPlaying && !this.isPaused) {
      this.speakCurrentSentence();
    }
  }

  setVoice(voiceURI) {
    if (this.voices.length === 0) {
      this.populateVoices();
    }
    const voice = this.voices.find(v => (v.voiceURI === voiceURI || v.name === voiceURI));
    this.selectedVoice = voice || null;
    const selectVoice = (typeof document !== 'undefined' && typeof document.getElementById === 'function') ? document.getElementById('tts-select-voice') : null;
    if (selectVoice && selectVoice.value !== voiceURI) {
      selectVoice.value = voiceURI;
    }
    if (this.isPlaying && !this.isPaused) {
      this.speakCurrentSentence();
    }
  }
}

const ttsController = new TTSController();

function setupFileOpenAndDragDropListeners() {
  if (typeof document === 'undefined') return;
  const btnOpenFile = document.getElementById('btn-open-file');
  const btnDropzoneOpen = document.getElementById('btn-dropzone-open');
  const fileInputPdf = document.getElementById('file-input-pdf');

  const triggerFilePicker = () => {
    if (fileInputPdf) fileInputPdf.click();
  };

  if (btnOpenFile) btnOpenFile.addEventListener('click', triggerFilePicker);
  if (btnDropzoneOpen) btnDropzoneOpen.addEventListener('click', triggerFilePicker);

  if (fileInputPdf) {
    fileInputPdf.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        loadPdfFileFromDisk(e.target.files[0]);
      }
      // Reset input value so re-selecting the same file triggers 'change' again
      e.target.value = '';
    });
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('dragover', (e) => {
      e.preventDefault();
    });

    window.addEventListener('drop', (e) => {
      e.preventDefault();
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) {
        const file = e.dataTransfer.files[0];
        if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
          loadPdfFileFromDisk(file);
        }
      }
    });
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    TabSession,
    TabManager,
    get pageObserver() { return pageObserver; },
    setupIntersectionObserver,
    renderPage,
    createPagePlaceholders,
    adjustZoom,
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
    exportFullPdfText,
    openSearchBar,
    closeSearchBar,
    performSearch,
    setupKeyboardShortcuts,
    openSettingsModal,
    closeSettingsModal,
    loadPdfFileFromDisk,
    setupFileOpenAndDragDropListeners,
    sanitizeFileUrl,
    loadPdf,
    setupEventListeners,
    handleParameterlessStartup,
    TTSController,
    ttsController
  };
}





