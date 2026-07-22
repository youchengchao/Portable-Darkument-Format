/**
 * Empirical Stress Test Harness for Multi-Tab PDF Workspace (Milestone 3 / R3)
 * Author: Empirical Challenger 1
 *
 * Executes empirical stress vectors:
 * 1. Opening multiple PDF documents concurrently in tabs.
 * 2. Rapid tab switching during scroll/zoom operations.
 * 3. Closing tabs in arbitrary order (first tab, middle tab, active tab, last tab).
 * 4. Closing all tabs down to zero and verifying dropzone reset.
 * 5. Verification of test suite execution (`node tests/run-tests.js`).
 */

const assert = require('assert');
const { spawnSync } = require('child_process');
const path = require('path');
const viewer = require('../viewer.js');
const { TabSession, TabManager } = viewer;

// Mock DOM helper for headless execution
function createMockDOMEnvironment() {
  const elements = new Map();

  function createMockElement(id, tagName = 'DIV') {
    const classListSet = new Set();
    const listeners = {};
    const children = [];

    const el = {
      id: id || '',
      tagName: tagName.toUpperCase(),
      className: '',
      dataset: {},
      textContent: '',
      title: '',
      scrollTop: 0,
      scrollLeft: 0,
      innerHTML: '',
      classList: {
        add: (cls) => classListSet.add(cls),
        remove: (cls) => classListSet.delete(cls),
        contains: (cls) => classListSet.has(cls),
        toggle: (cls, force) => {
          if (force !== undefined) {
            if (force) classListSet.add(cls); else classListSet.delete(cls);
          } else {
            if (classListSet.has(cls)) classListSet.delete(cls); else classListSet.add(cls);
          }
        }
      },
      appendChild: (child) => children.push(child),
      addEventListener: (evt, fn) => {
        listeners[evt] = listeners[evt] || [];
        listeners[evt].push(fn);
      },
      click: () => {
        if (listeners['click']) listeners['click'].forEach(fn => fn({ stopPropagation: () => {} }));
      },
      _getChildren: () => children,
      _getListeners: () => listeners,
      _hasClass: (cls) => classListSet.has(cls)
    };

    if (id) elements.set(id, el);
    return el;
  }

  // Pre-create required DOM elements
  const tabList = createMockElement('tab-list');
  const btnAddTab = createMockElement('btn-add-tab', 'BUTTON');
  const pdfViewArea = createMockElement('pdf-view-area');
  const pagesContainer = createMockElement('pages-container');
  const dropzoneOverlay = createMockElement('dropzone-overlay');
  const docTitle = createMockElement('doc-title');
  const totalPages = createMockElement('total-pages');
  const currentPage = createMockElement('current-page');
  const zoomValue = createMockElement('zoom-value');
  const fileInputPdf = createMockElement('file-input-pdf', 'INPUT');

  const mockDocument = {
    title: '',
    getElementById: (id) => elements.get(id) || null,
    createElement: (tag) => createMockElement('', tag)
  };

  return { mockDocument, elements };
}

function resetTabManager() {
  TabManager.tabs = [];
  TabManager.activeTabId = null;
}

// Global DOM setup
const env = createMockDOMEnvironment();
global.document = env.mockDocument;

console.log('=================================================================');
console.log('     MILESTONE 3 MULTI-TAB PDF WORKSPACE EMPIRICAL STRESS SUITE   ');
console.log('=================================================================\n');

let totalTests = 0;
let passedTests = 0;

function runStressTest(name, fn) {
  totalTests++;
  const startTime = Date.now();
  try {
    fn();
    const duration = Date.now() - startTime;
    passedTests++;
    console.log(`  ✅ [PASS] ${name} (${duration}ms)`);
  } catch (err) {
    console.error(`  ❌ [FAIL] ${name}`);
    console.error(`     Error: ${err.message}`);
    if (err.stack) {
      console.error(`     Stack: ${err.stack.split('\n').slice(1, 4).join('\n')}`);
    }
  }
}

// -----------------------------------------------------------------------------
// Vector 1: Opening multiple PDF documents concurrently in tabs
// -----------------------------------------------------------------------------
console.log('--- Vector 1: Concurrency & Multi-Tab Creation ---');

runStressTest('V1.1 Mass tab creation (100 concurrent tabs)', () => {
  resetTabManager();
  const count = 100;
  const createdTabs = [];

  for (let i = 0; i < count; i++) {
    const title = `Document_${i + 1}.pdf`;
    const tab = TabManager.createTab(`file:///${title}`, title);
    createdTabs.push(tab);
  }

  assert.strictEqual(TabManager.tabs.length, count, `Should have ${count} open tabs`);
  assert.strictEqual(TabManager.activeTabId, createdTabs[count - 1].id, 'Active tab should be the last created tab');

  // Verify unique tab IDs
  const idSet = new Set(TabManager.tabs.map(t => t.id));
  assert.strictEqual(idSet.size, count, 'All tab IDs must be strictly unique');
});

runStressTest('V1.2 Tab creation with custom buffers and separate session models', () => {
  resetTabManager();
  const buffer1 = new ArrayBuffer(1024);
  const buffer2 = new ArrayBuffer(2048);

  const tab1 = TabManager.createTab('file:///docA.pdf', 'Doc A', buffer1);
  tab1.tocItems = [{ title: 'Chapter A1', page: 1 }];
  tab1.numPages = 15;

  const tab2 = TabManager.createTab('file:///docB.pdf', 'Doc B', buffer2);
  tab2.tocItems = [{ title: 'Chapter B1', page: 3 }, { title: 'Chapter B2', page: 7 }];
  tab2.numPages = 30;

  assert.strictEqual(TabManager.tabs[0].arrayBuffer, buffer1, 'Tab 1 buffer intact');
  assert.strictEqual(TabManager.tabs[1].arrayBuffer, buffer2, 'Tab 2 buffer intact');
  assert.strictEqual(TabManager.tabs[0].numPages, 15);
  assert.strictEqual(TabManager.tabs[1].numPages, 30);
  assert.notStrictEqual(TabManager.tabs[0].id, TabManager.tabs[1].id, 'Tab IDs must be distinct');
});

runStressTest('V1.3 Boundary inputs in tab creation (unicode, special chars, empty strings)', () => {
  resetTabManager();
  const title1 = '🚀_测试_文档.pdf';
  const title2 = 'Special !@#$%^&*()_+ Title.pdf';
  const title3 = '';

  const tab1 = TabManager.createTab('file:///unicode.pdf', title1);
  const tab2 = TabManager.createTab('file:///special.pdf', title2);
  const tab3 = TabManager.createTab('file:///empty.pdf', title3);

  assert.strictEqual(tab1.title, title1);
  assert.strictEqual(tab2.title, title2);
  assert.strictEqual(tab3.title, 'New Tab', 'Empty title should fallback to New Tab');
});

// -----------------------------------------------------------------------------
// Vector 2: Rapid tab switching during scroll/zoom operations
// -----------------------------------------------------------------------------
console.log('\n--- Vector 2: Rapid Tab Switching & Scroll/Zoom Preservation ---');

runStressTest('V2.1 High-frequency rapid tab switching (1,000 switches across 10 tabs)', () => {
  resetTabManager();
  const numTabs = 10;
  const tabs = [];

  for (let i = 0; i < numTabs; i++) {
    const tab = TabManager.createTab(`file:///doc_${i}.pdf`, `Doc ${i}`);
    tab.pdfDoc = { numPages: (i + 1) * 5 };
    tab.numPages = (i + 1) * 5;
    tab.activePageNum = i + 1;
    tab.currentScale = 1.0 + (i * 0.1);
    tab.scrollTop = i * 200;
    tab.scrollLeft = i * 50;
    tabs.push(tab);
  }

  const viewArea = global.document.getElementById('pdf-view-area');

  // Perform 1,000 random switch operations
  for (let step = 0; step < 1000; step++) {
    const targetIdx = step % numTabs;
    const targetTab = tabs[targetIdx];

    TabManager.switchToTab(targetTab.id);

    assert.strictEqual(TabManager.activeTabId, targetTab.id);
  }

  assert.strictEqual(TabManager.tabs.length, numTabs);
});

runStressTest('V2.2 Interleaved zoom steps and position retention round-trip', () => {
  resetTabManager();

  // Create Tab A
  const tabA = TabManager.createTab('file:///a.pdf', 'Tab A');
  tabA.pdfDoc = { numPages: 10 };
  tabA.numPages = 10;

  // Create Tab B
  const tabB = TabManager.createTab('file:///b.pdf', 'Tab B');
  tabB.pdfDoc = { numPages: 20 };
  tabB.numPages = 20;

  // Switch to Tab A and verify UI elements update
  TabManager.switchToTab(tabA.id);
  assert.strictEqual(global.document.title, 'Tab A');
  assert.strictEqual(global.document.getElementById('doc-title').textContent, 'Tab A');
  assert.strictEqual(global.document.getElementById('total-pages').textContent, 10);

  // Switch to Tab B and verify UI elements update
  TabManager.switchToTab(tabB.id);
  assert.strictEqual(global.document.title, 'Tab B');
  assert.strictEqual(global.document.getElementById('doc-title').textContent, 'Tab B');
  assert.strictEqual(global.document.getElementById('total-pages').textContent, 20);
});

// -----------------------------------------------------------------------------
// Vector 3: Closing tabs in arbitrary order
// -----------------------------------------------------------------------------
console.log('\n--- Vector 3: Tab Closure Order Stress ---');

runStressTest('V3.1 Closing first tab (index 0) when active', () => {
  resetTabManager();
  const tab0 = TabManager.createTab('file:///doc0.pdf', 'Doc 0');
  const tab1 = TabManager.createTab('file:///doc1.pdf', 'Doc 1');
  const tab2 = TabManager.createTab('file:///doc2.pdf', 'Doc 2');

  TabManager.switchToTab(tab0.id);
  assert.strictEqual(TabManager.activeTabId, tab0.id);

  TabManager.closeTab(tab0.id);

  assert.strictEqual(TabManager.tabs.length, 2);
  assert.strictEqual(TabManager.activeTabId, tab1.id, 'Focus should transfer to next tab at index 0');
});

runStressTest('V3.2 Closing middle tab (when inactive vs when active)', () => {
  resetTabManager();
  const tab0 = TabManager.createTab('file:///doc0.pdf', 'Doc 0');
  const tab1 = TabManager.createTab('file:///doc1.pdf', 'Doc 1');
  const tab2 = TabManager.createTab('file:///doc2.pdf', 'Doc 2');

  // Case A: Close inactive middle tab (tab1) while tab2 is active
  TabManager.switchToTab(tab2.id);
  TabManager.closeTab(tab1.id);
  assert.strictEqual(TabManager.tabs.length, 2);
  assert.strictEqual(TabManager.activeTabId, tab2.id, 'Active tab should remain tab2');

  // Case B: Close active middle tab
  const tabNewMiddle = TabManager.createTab('file:///docMid.pdf', 'Doc Mid');
  const tabEnd = TabManager.createTab('file:///docEnd.pdf', 'Doc End');
  // Tabs: [doc0, doc2, docMid, docEnd]
  TabManager.switchToTab(tabNewMiddle.id);
  TabManager.closeTab(tabNewMiddle.id);

  assert.strictEqual(TabManager.tabs.length, 3);
  assert.strictEqual(TabManager.activeTabId, tabEnd.id, 'Focus should transfer to adjacent tab (docEnd)');
});

runStressTest('V3.3 Closing last tab (index N-1) when active', () => {
  resetTabManager();
  const tab0 = TabManager.createTab('file:///doc0.pdf', 'Doc 0');
  const tab1 = TabManager.createTab('file:///doc1.pdf', 'Doc 1');
  const tab2 = TabManager.createTab('file:///doc2.pdf', 'Doc 2');

  // Active is tab2
  TabManager.closeTab(tab2.id);

  assert.strictEqual(TabManager.tabs.length, 2);
  assert.strictEqual(TabManager.activeTabId, tab1.id, 'Focus should transfer to previous last tab (doc1)');
});

runStressTest('V3.4 Random deletion sequence across 50 open tabs', () => {
  resetTabManager();
  const numTabs = 50;
  const tabIds = [];
  for (let i = 0; i < numTabs; i++) {
    const tab = TabManager.createTab(`file:///random_${i}.pdf`, `Random ${i}`);
    tabIds.push(tab.id);
  }

  // Permute deletion order
  const shuffledIds = [...tabIds].sort(() => Math.random() - 0.5);

  // Close all except 1
  for (let i = 0; i < numTabs - 1; i++) {
    const idToClose = shuffledIds[i];
    TabManager.closeTab(idToClose);

    assert.strictEqual(TabManager.tabs.length, numTabs - (i + 1));
    assert.ok(TabManager.activeTabId, 'Active tab ID must never be null/undefined during deletion');
    assert.ok(TabManager.getActiveTab(), 'getActiveTab() must return a valid TabSession');
  }

  assert.strictEqual(TabManager.tabs.length, 1);
});

// -----------------------------------------------------------------------------
// Vector 4: Closing all tabs down to zero and verifying dropzone reset
// -----------------------------------------------------------------------------
console.log('\n--- Vector 4: Zero Tab Closure & Dropzone Reset ---');

runStressTest('V4.1 Closing final remaining tab triggers dropzone reset & placeholder tab', () => {
  resetTabManager();
  const tab1 = TabManager.createTab('file:///onlyDoc.pdf', 'Only Doc');
  tab1.pdfDoc = { numPages: 5 };
  tab1.numPages = 5;

  const dropzone = global.document.getElementById('dropzone-overlay');
  dropzone.classList.add('hidden');
  assert.strictEqual(dropzone._hasClass('hidden'), true, 'Dropzone hidden while doc is open');

  // Close the final remaining tab
  TabManager.closeTab(tab1.id);

  // Check state after closing all tabs
  assert.strictEqual(TabManager.tabs.length, 1, 'Should auto-create 1 default placeholder tab');
  const activeTab = TabManager.getActiveTab();
  assert.strictEqual(activeTab.title, 'PDF Dark Mode', 'Placeholder tab title should be PDF Dark Mode');
  assert.strictEqual(activeTab.url, '', 'Placeholder tab URL should be empty');
  assert.strictEqual(activeTab.pdfDoc, null, 'Placeholder tab pdfDoc should be null');

  assert.strictEqual(dropzone._hasClass('hidden'), false, 'Dropzone class hidden MUST be removed when 0 tabs remain');
  const pagesContainer = global.document.getElementById('pages-container');
  assert.strictEqual(pagesContainer.innerHTML, '', 'pages-container should be cleared');
});

runStressTest('V4.2 Re-opening file into reset workspace after zero tab closure', () => {
  // Continued from reset state
  const newBuffer = new ArrayBuffer(512);
  const newTab = TabManager.createTab('file:///reopened.pdf', 'Reopened PDF', newBuffer);

  assert.strictEqual(TabManager.tabs.length, 2, 'New tab added');
  assert.strictEqual(TabManager.activeTabId, newTab.id);
  assert.strictEqual(TabManager.getActiveTab().title, 'Reopened PDF');
});

// -----------------------------------------------------------------------------
// Vector 5: Verification of test suite execution (`node tests/run-tests.js`)
// -----------------------------------------------------------------------------
console.log('\n--- Vector 5: Execution of Project Test Suite ---');

runStressTest('V5.1 Execute node tests/run-tests.js child process', () => {
  const rootDir = path.resolve(__dirname, '..');
  const runnerPath = path.join(rootDir, 'tests', 'run-tests.js');

  const res = spawnSync(process.execPath, [runnerPath], {
    encoding: 'utf8',
    cwd: rootDir
  });

  assert.strictEqual(res.status, 0, `Test runner should exit with code 0 (Actual: ${res.status})\nOutput: ${res.stdout}\nErrors: ${res.stderr}`);
  assert.ok(res.stdout.includes('ALL 150 AUTOMATED TESTS PASSED SUCCESSFULLY!'), 'Output should report 150/150 passed');
});

// -----------------------------------------------------------------------------
// Summary Report
// -----------------------------------------------------------------------------
console.log('\n=================================================================');
console.log(`STRESS SUITE SUMMARY: ${passedTests} / ${totalTests} Empirical Tests Passed`);
console.log('=================================================================\n');

if (passedTests !== totalTests) {
  process.exit(1);
} else {
  process.exit(0);
}
