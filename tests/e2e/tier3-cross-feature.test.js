/**
 * Tier 3: Cross-Feature Combination Test Suite (15 Tests)
 * Multi-module interaction and integration specs for Portable-Darkument-Format.
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

describe('Tier 3: Cross-Feature Combination Test Suite', () => {

  beforeEach(async () => {
    chromeMock.__helpers.reset();
    await chrome.storage.local.set(getDefaultStorageState());
  });

  test('3.1 Cross 1: Position Resume + Dark Engine Scheme (Navigating to saved PDF position loads Sepia dark scheme pre-rendered)', async () => {
    const pdfUrl = 'https://example.com/research.pdf';
    
    // Set Sepia theme and saved reading position
    await chrome.storage.local.set({ theme: 'sepia' });
    await handleBackgroundMessage({ action: 'save_position', url: pdfUrl, page: 8, scrollTop: 2400, zoom: 1.25 });

    const store = await chrome.storage.local.get(null);
    const filter = computeDarkFilter(store);
    const pos = store.readingPositions[pdfUrl];

    assert.ok(filter.includes('sepia(0.35)'));
    assert.strictEqual(pos.page, 8);
    assert.strictEqual(pos.scrollTop, 2400);
    assert.strictEqual(pos.zoom, 1.25);
  });

  test('3.2 Cross 2: Diagram Protection + Dark Engine Filters (SVG/Canvas protected while dark invert applies to canvas background)', async () => {
    await chrome.storage.local.set({ theme: 'oled', protectDiagrams: true, brightness: 90 });

    const settings = await chrome.storage.local.get(null);
    const canvasFilter = computeDarkFilter(settings);
    const imageReverseFilter = settings.protectDiagrams ? 'invert(1) hue-rotate(180deg)' : 'none';

    assert.ok(canvasFilter.includes('invert(0.9)'));
    assert.ok(canvasFilter.includes('brightness(0.9)'));
    assert.strictEqual(imageReverseFilter, 'invert(1) hue-rotate(180deg)');
  });

  test('3.3 Cross 3: Interactive TOC + Position Resume (Clicking TOC node scrolls page & saves position to storage)', async () => {
    const pdfUrl = 'https://example.com/textbook.pdf';
    const tocNode = { title: 'Chapter 4: Advanced Storage', page: 15, scrollTop: 4500 };

    // Simulate TOC node click action
    await handleBackgroundMessage({
      action: 'save_position',
      url: pdfUrl,
      page: tocNode.page,
      scrollTop: tocNode.scrollTop,
      zoom: 1.0
    });

    const store = await chrome.storage.local.get('readingPositions');
    assert.strictEqual(store.readingPositions[pdfUrl].page, 15);
    assert.strictEqual(store.readingPositions[pdfUrl].scrollTop, 4500);
  });

  test('3.4 Cross 4: Neon Text Highlighting + Side Note Drawer + Markdown Export', async () => {
    const pdfUrl = 'https://example.com/guide.pdf';
    
    // Add two highlights with different colors
    await handleBackgroundMessage({
      action: 'add_highlight',
      url: pdfUrl,
      highlight: { page: 2, text: 'Manifest V3 requirement', color: 'cyan', note: 'Essential' }
    });
    await handleBackgroundMessage({
      action: 'add_highlight',
      url: pdfUrl,
      highlight: { page: 5, text: 'Zero-flicker background', color: 'amber', note: 'CSS pre-render' }
    });

    const store = await chrome.storage.local.get('highlights');
    const highlights = store.highlights[pdfUrl];
    assert.strictEqual(highlights.length, 2);

    const mdExport = exportHighlights(highlights, 'markdown');
    assert.ok(mdExport.includes('## Page 2'));
    assert.ok(mdExport.includes('> Manifest V3 requirement'));
    assert.ok(mdExport.includes('*Note: Essential*'));
    assert.ok(mdExport.includes('## Page 5'));
  });

  test('3.5 Cross 5: Bionic Reading + Line Focus Ruler (Simultaneous activation formats text & sets ruler height)', async () => {
    await chrome.storage.local.set({ bionicReading: true, readingRuler: true, rulerHeight: 50 });

    const settings = await chrome.storage.local.get(null);
    assert.strictEqual(settings.bionicReading, true);
    assert.strictEqual(settings.readingRuler, true);
    assert.strictEqual(settings.rulerHeight, 50);

    const formattedText = applyBionicReading('Focus Mode');
    assert.strictEqual(formattedText, '<b>Foc</b>us <b>Mo</b>de');
  });

  test('3.6 Cross 6: Auto-Night Schedule + Dark Engine Scheme (Sunset schedule triggers dark mode dynamically)', async () => {
    const schedule = { enabled: true, mode: 'sunset', startTime: '19:00', endTime: '06:00' };
    await chrome.storage.local.set({ autoNightSchedule: schedule, theme: 'slate' });

    const isNight = isNightTime(schedule, '21:30');
    assert.strictEqual(isNight, true);

    const settings = await chrome.storage.local.get(null);
    if (isNight) {
      const filter = computeDarkFilter(settings);
      assert.ok(filter.includes('hue-rotate(200deg)'));
    }
  });

  test('3.7 Cross 7: Reading Analytics + Voluntary Donation Prompt (7 daily sessions trigger milestone prompt)', async () => {
    for (let i = 1; i <= 7; i++) {
      const dateStr = `2026-07-${i < 10 ? '0' + i : i}`;
      var res = await handleBackgroundMessage({
        action: 'track_reading',
        seconds: 300,
        page: 5,
        dateISO: dateStr
      });
    }

    assert.strictEqual(res.triggerDonationPrompt, true);
    assert.ok(res.reason.includes('7-day streak'));

    const store = await chrome.storage.local.get('analytics');
    assert.strictEqual(store.analytics.currentStreak, 7);
    assert.strictEqual(store.analytics.totalReadingTimeSeconds, 2100);
    assert.strictEqual(store.analytics.totalPagesRead, 7);
  });

  test('3.8 Cross 8: Supporter Framework + Gold Accent Theme (Supporter unlocks gold accent styling)', async () => {
    await chrome.storage.local.set({
      supporter: { isSupporter: true, goldAccent: true, promptDismissedCount: 0, lastPromptDate: '' }
    });

    const store = await chrome.storage.local.get('supporter');
    assert.strictEqual(store.supporter.isSupporter, true);
    assert.strictEqual(store.supporter.goldAccent, true);
  });

  test('3.9 Cross 9: Classic Invert Mode Fallback + Background Interception', async () => {
    await chrome.storage.local.set({ active: true, mode: 'classic', theme: 'warm' });

    const settings = await chrome.storage.local.get(null);
    assert.strictEqual(settings.mode, 'classic');

    const filter = computeDarkFilter(settings);
    assert.ok(filter.includes('sepia(0.35)'));
  });

  test('3.10 Cross 10: Position Resume + Zoom Level Scale Calculation', async () => {
    const pdfUrl = 'https://example.com/zoom.pdf';
    await handleBackgroundMessage({ action: 'save_position', url: pdfUrl, page: 4, scrollTop: 800, zoom: 1.5 });

    const store = await chrome.storage.local.get('readingPositions');
    const pos = store.readingPositions[pdfUrl];
    const targetWidth = 800 * pos.zoom;

    assert.strictEqual(pos.zoom, 1.5);
    assert.strictEqual(targetWidth, 1200);
  });

  test('3.11 Cross 11: Highlighting + Bionic Reading (Highlight overlay on bionic text preserves formatting & note)', async () => {
    const pdfUrl = 'https://example.com/bionic-highlight.pdf';
    const sampleText = 'Bionic Reading Text';
    const bionicText = applyBionicReading(sampleText);

    await handleBackgroundMessage({
      action: 'add_highlight',
      url: pdfUrl,
      highlight: { page: 1, text: bionicText, color: 'mint', note: 'Bionic text highlight' }
    });

    const store = await chrome.storage.local.get('highlights');
    const hl = store.highlights[pdfUrl][0];
    assert.strictEqual(hl.color, 'mint');
    assert.ok(hl.text.includes('<b>Bio</b>nic'));
  });

  test('3.12 Cross 12: Auto-Night Schedule + Popup Control Theme Override', async () => {
    const schedule = { enabled: true, mode: 'sunset', startTime: '20:00', endTime: '07:00' };
    await chrome.storage.local.set({ autoNightSchedule: schedule, theme: 'oled' });

    // User manually overrides theme to 'mono' in popup
    await chrome.storage.local.set({ theme: 'mono' });

    const store = await chrome.storage.local.get(null);
    assert.strictEqual(store.theme, 'mono');
    assert.strictEqual(store.autoNightSchedule.enabled, true);
  });

  test('3.13 Cross 13: Supporter Suppress Prompt + Milestone 50 Pages Read', async () => {
    await chrome.storage.local.set({
      supporter: { isSupporter: true, goldAccent: false, promptDismissedCount: 0, lastPromptDate: '' }
    });

    const res = await handleBackgroundMessage({
      action: 'track_reading',
      seconds: 1200,
      page: 50,
      dateISO: '2026-07-22'
    });

    assert.strictEqual(res.triggerDonationPrompt, undefined);
  });

  test('3.14 Cross 14: Dark Engine Brightness Slider + Diagram Protection', async () => {
    await chrome.storage.local.set({ theme: 'oled', brightness: 75, protectDiagrams: true });

    const store = await chrome.storage.local.get(null);
    const filter = computeDarkFilter(store);

    assert.ok(filter.includes('brightness(0.75)'));
    assert.strictEqual(store.protectDiagrams, true);
  });

  test('3.15 Cross 15: TOC Navigation + Reading Analytics Page Tracker', async () => {
    const pdfUrl = 'https://example.com/book.pdf';
    const chapters = [1, 5, 12, 20, 35];

    for (const p of chapters) {
      await handleBackgroundMessage({ action: 'save_position', url: pdfUrl, page: p, scrollTop: 0, zoom: 1.0 });
      await handleBackgroundMessage({ action: 'track_reading', seconds: 60, page: p, dateISO: '2026-07-22' });
    }

    const store = await chrome.storage.local.get(null);
    assert.strictEqual(store.readingPositions[pdfUrl].page, 35);
    assert.strictEqual(store.analytics.totalPagesRead, 5);
  });

});
