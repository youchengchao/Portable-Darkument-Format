/**
 * Tier 4: Real-World Application Workload Scenarios (8 Tests)
 * End-to-end user journey and complex workload validation for Portable-Darkument-Format.
 */

const assert = require('node:assert');
const { test, describe, beforeEach } = require('node:test');
const {
  chromeMock,
  getDefaultStorageState,
  handleBackgroundMessage,
  computeDarkFilter,
  applyBionicReading,
  isNightTime,
  exportHighlights
} = require('../helpers/test-utils');

describe('Tier 4: Real-World Application Workload Scenarios', () => {

  beforeEach(async () => {
    chromeMock.__helpers.reset();
    await chrome.storage.local.set(getDefaultStorageState());
  });

  test('4.1 Scenario 1: End-to-End Reading Session Workflow (Launch, pre-render, navigation & position resume)', async () => {
    const pdfUrl = 'https://example.com/books/quantum_computing.pdf';

    // 1. Initial navigation interception check
    const isPdf = pdfUrl.endsWith('.pdf');
    assert.strictEqual(isPdf, true);

    const viewerUrl = chrome.runtime.getURL('viewer.html') + '?file=' + encodeURIComponent(pdfUrl);
    assert.ok(viewerUrl.includes('viewer.html?file='));

    // 2. Pre-render dark background styling
    const settings = await chrome.storage.local.get(null);
    assert.strictEqual(settings.theme, 'oled');
    const filter = computeDarkFilter(settings);
    assert.ok(filter.includes('invert(0.9)'));

    // 3. User reads to page 12 and sets zoom to 1.25x
    await handleBackgroundMessage({
      action: 'save_position',
      url: pdfUrl,
      page: 12,
      scrollTop: 3600,
      scrollLeft: 0,
      zoom: 1.25
    });

    // 4. Reopening document restores position instantly
    const store = await chrome.storage.local.get('readingPositions');
    const savedPos = store.readingPositions[pdfUrl];
    assert.ok(savedPos);
    assert.strictEqual(savedPos.page, 12);
    assert.strictEqual(savedPos.scrollTop, 3600);
    assert.strictEqual(savedPos.zoom, 1.25);
  });

  test('4.2 Scenario 2: Research & Note-Taking Workflow (TOC navigation, multi-color highlights & Markdown export)', async () => {
    const pdfUrl = 'https://example.com/papers/deep_learning.pdf';

    // 1. Jump to Section 3 via TOC
    const tocNode = { title: '3. Neural Network Architectures', page: 8 };
    await handleBackgroundMessage({ action: 'save_position', url: pdfUrl, page: tocNode.page, scrollTop: 1800, zoom: 1.0 });

    // 2. Add multi-color highlights with notes
    await handleBackgroundMessage({
      action: 'add_highlight',
      url: pdfUrl,
      highlight: { page: 8, text: 'Transformer attention mechanism', color: 'cyan', note: 'Key innovation' }
    });
    await handleBackgroundMessage({
      action: 'add_highlight',
      url: pdfUrl,
      highlight: { page: 9, text: 'Gradient clipping threshold = 1.0', color: 'amber', note: 'Hyperparameter' }
    });
    await handleBackgroundMessage({
      action: 'add_highlight',
      url: pdfUrl,
      highlight: { page: 12, text: 'Residual connection skip paths', color: 'rose', note: 'Prevents vanishing gradient' }
    });

    // 3. Side Note drawer verification & Markdown export
    const store = await chrome.storage.local.get('highlights');
    const notes = store.highlights[pdfUrl];
    assert.strictEqual(notes.length, 3);

    const markdownExport = exportHighlights(notes, 'markdown');
    assert.ok(markdownExport.includes('## Page 8'));
    assert.ok(markdownExport.includes('> Transformer attention mechanism'));
    assert.ok(markdownExport.includes('*Note: Key innovation*'));
    assert.ok(markdownExport.includes('## Page 9'));
    assert.ok(markdownExport.includes('## Page 12'));
  });

  test('4.3 Scenario 3: Eye-Care Night Reading Session Workflow (Auto-night schedule, Sepia theme, Bionic Reading & Ruler)', async () => {
    // 1. Setup Sunset Schedule (20:00 - 07:00)
    const schedule = { enabled: true, mode: 'sunset', startTime: '20:00', endTime: '07:00' };
    await chrome.storage.local.set({ autoNightSchedule: schedule, theme: 'sepia', bionicReading: true, readingRuler: true, rulerHeight: 45 });

    // 2. Verify night schedule evaluation at 21:30
    const isNight = isNightTime(schedule, '21:30');
    assert.strictEqual(isNight, true);

    // 3. Verify Sepia dark filter
    const settings = await chrome.storage.local.get(null);
    const filter = computeDarkFilter(settings);
    assert.ok(filter.includes('sepia(0.35)'));

    // 4. Verify Bionic Reading formatting
    const formatted = applyBionicReading('Cognitive Load Reduction');
    assert.strictEqual(formatted, '<b>Cogni</b>tive <b>Lo</b>ad <b>Reduc</b>tion');

    // 5. Track 45 minutes reading time
    await handleBackgroundMessage({ action: 'track_reading', seconds: 2700, page: 15, dateISO: '2026-07-22' });
    const store = await chrome.storage.local.get('analytics');
    assert.strictEqual(store.analytics.totalReadingTimeSeconds, 2700);
  });

  test('4.4 Scenario 4: Dynamic PDF WebRequest Interception Workflow (Content-Type detection & viewer loading)', async () => {
    // 1. WebRequest header interception details
    const details = {
      tabId: 1,
      type: 'main_frame',
      url: 'https://example.com/api/generate-report?id=99',
      responseHeaders: [
        { name: 'Content-Type', value: 'application/pdf' },
        { name: 'Cache-Control', value: 'no-cache' }
      ]
    };

    const isPdfHeader = details.responseHeaders.some(
      h => h.name.toLowerCase() === 'content-type' && h.value.toLowerCase().includes('application/pdf')
    );
    assert.strictEqual(isPdfHeader, true);

    // 2. Background worker handles redirection decision
    const settings = await chrome.storage.local.get(null);
    const shouldRedirect = settings.active && settings.mode === 'enhanced' && isPdfHeader;
    assert.strictEqual(shouldRedirect, true);

    const redirectTarget = chrome.runtime.getURL('viewer.html') + '?file=' + encodeURIComponent(details.url);
    await chrome.tabs.update(details.tabId, { url: redirectTarget });

    const tab = await chrome.tabs.get(details.tabId);
    assert.strictEqual(tab.url, redirectTarget);
  });

  test('4.5 Scenario 5: 7-Day Habit Formation & Supporter Conversion Workflow (Streak accumulation & Supporter conversion)', async () => {
    // 1. Read every day for 7 days
    for (let day = 1; day <= 7; day++) {
      const dateISO = `2026-07-${day < 10 ? '0' + day : day}`;
      var res = await handleBackgroundMessage({ action: 'track_reading', seconds: 600, page: 5, dateISO });
    }

    // 2. Milestone donation prompt triggered on day 7
    assert.strictEqual(res.triggerDonationPrompt, true);
    assert.ok(res.reason.includes('7-day streak'));

    // 3. User converts to supporter and enables gold accent
    await chrome.storage.local.set({
      supporter: { isSupporter: true, goldAccent: true, promptDismissedCount: 0, lastPromptDate: '' }
    });

    const supporterStore = await chrome.storage.local.get('supporter');
    assert.strictEqual(supporterStore.supporter.isSupporter, true);
    assert.strictEqual(supporterStore.supporter.goldAccent, true);

    // 4. Day 8 reading session does not show donation prompt
    const day8Res = await handleBackgroundMessage({ action: 'track_reading', seconds: 600, page: 5, dateISO: '2026-07-08' });
    assert.strictEqual(day8Res.triggerDonationPrompt, undefined);
  });

  test('4.6 Scenario 6: Mode Switching & Native PDF Fallback Workflow (Enhanced -> Classic -> Disabled)', async () => {
    // 1. User starts in Enhanced mode
    let settings = await chrome.storage.local.get(null);
    assert.strictEqual(settings.mode, 'enhanced');

    // 2. User switches to Classic mode via Popup
    await chrome.storage.local.set({ mode: 'classic', theme: 'dark' });
    settings = await chrome.storage.local.get(null);
    assert.strictEqual(settings.mode, 'classic');

    const classicFilter = computeDarkFilter(settings);
    assert.ok(classicFilter.includes('invert(0.9)'));

    // 3. User turns off master toggle
    await chrome.storage.local.set({ active: false });
    settings = await chrome.storage.local.get(null);
    assert.strictEqual(settings.active, false);
    assert.strictEqual(computeDarkFilter(settings), 'none');
  });

  test('4.7 Scenario 7: Complex Multi-Tab PDF Reading Workload (3 tabs open, global setting update broadcast)', async () => {
    // Setup 3 active tabs
    chromeMock.__helpers.setTab(1, { id: 1, active: true, url: 'https://example.com/doc1.pdf' });
    chromeMock.__helpers.setTab(2, { id: 2, active: false, url: 'https://example.com/doc2.pdf' });
    chromeMock.__helpers.setTab(3, { id: 3, active: false, url: 'https://example.com/doc3.pdf' });

    // Save position in each tab
    await handleBackgroundMessage({ action: 'save_position', url: 'https://example.com/doc1.pdf', page: 2, scrollTop: 100, zoom: 1.0 });
    await handleBackgroundMessage({ action: 'save_position', url: 'https://example.com/doc2.pdf', page: 14, scrollTop: 2000, zoom: 1.5 });
    await handleBackgroundMessage({ action: 'save_position', url: 'https://example.com/doc3.pdf', page: 33, scrollTop: 5000, zoom: 2.0 });

    // Popup changes global theme to Slate
    await chrome.storage.local.set({ theme: 'slate', brightness: 85 });

    const store = await chrome.storage.local.get(null);
    assert.strictEqual(store.theme, 'slate');
    assert.strictEqual(store.brightness, 85);

    // Verify all 3 positions preserved independently
    assert.strictEqual(store.readingPositions['https://example.com/doc1.pdf'].page, 2);
    assert.strictEqual(store.readingPositions['https://example.com/doc2.pdf'].page, 14);
    assert.strictEqual(store.readingPositions['https://example.com/doc3.pdf'].page, 33);
  });

  test('4.8 Scenario 8: High-Density Document Annotation & Dual Export Workflow (20 highlights, Markdown & PlainText export)', async () => {
    const pdfUrl = 'https://example.com/spec_v3.pdf';

    // Add 20 highlights across pages 1 to 20
    for (let i = 1; i <= 20; i++) {
      const color = ['amber', 'cyan', 'mint', 'rose'][(i - 1) % 4];
      await handleBackgroundMessage({
        action: 'add_highlight',
        url: pdfUrl,
        highlight: {
          id: `hl_${i}`,
          page: i,
          text: `Specification rule item ${i}`,
          color,
          note: `Compliance check note for item ${i}`
        }
      });
    }

    const store = await chrome.storage.local.get('highlights');
    const highlightsList = store.highlights[pdfUrl];
    assert.strictEqual(highlightsList.length, 20);

    // Markdown export check
    const mdExport = exportHighlights(highlightsList, 'markdown');
    assert.ok(mdExport.includes('## Page 1'));
    assert.ok(mdExport.includes('## Page 20'));
    assert.ok(mdExport.includes('> Specification rule item 20'));

    // Plain text export check
    const plainExport = exportHighlights(highlightsList, 'plaintext');
    assert.ok(plainExport.includes('Page 1: "Specification rule item 1"'));
    assert.ok(plainExport.includes('Page 20: "Specification rule item 20"'));
  });

});
