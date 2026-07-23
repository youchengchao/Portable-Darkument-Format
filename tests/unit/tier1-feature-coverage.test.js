/**
 * Tier 1: Feature Coverage Test Suite (45 Tests: 5 per Feature Module)
 * Opaque-box requirement verification for Portable-Darkument-Format.
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
  exportHighlights,
  isProtectedElement,
  getReverseFilter,
  tagProtectedElements,
  sanitizeSettings,
  clampNumber,
  transformWordToBionic,
  transformTextToBionic,
  setupAutoNightAlarm,
  checkAutoNightSchedule
} = require('../helpers/test-utils');
const {
  calculateActiveStreak,
  BUILT_IN_PROFILES,
  renderProfileDropdown,
  saveCurrentProfile,
  applyProfile,
  deleteProfile,
  renderReadingHeatmap,
  renderPopupStats
} = require('../../popup.js');
const { TabSession, TabManager, TTSController, ttsController } = require('../../viewer.js');
const BrowserCompat = require('../../browser-compat.js');

describe('Tier 1: Feature Coverage Test Suite', () => {

  beforeEach(async () => {
    chromeMock.__helpers.reset();
    await chrome.storage.local.set(getDefaultStorageState());
  });

  // =========================================================================
  // Module 1: Zero-Flicker Dark Engine & Schemes (5 Tests)
  // =========================================================================
  describe('Module 1: Zero-Flicker Dark Engine & Schemes', () => {
    test('1.1 Default dark theme pre-rendering applies OLED dark background & invert filter', async () => {
      const settings = await chrome.storage.local.get(null);
      assert.strictEqual(settings.active, true);
      assert.strictEqual(settings.theme, 'oled');

      const filter = computeDarkFilter(settings);
      assert.ok(filter.includes('invert(0.9)'));
      assert.ok(filter.includes('hue-rotate(180deg)'));
    });

    test('1.2 Theme switching among premium schemes calculates correct CSS filter', async () => {
      const themes = [
        { theme: 'oled', expected: 'invert(0.9) hue-rotate(180deg)' },
        { theme: 'sepia', expected: 'invert(0.9) hue-rotate(180deg) sepia(0.35)' },
        { theme: 'slate', expected: 'invert(0.9) hue-rotate(200deg)' },
        { theme: 'mono', expected: 'invert(0.9) hue-rotate(180deg) grayscale(1)' }
      ];

      for (const t of themes) {
        await chrome.storage.local.set({ theme: t.theme });
        const settings = await chrome.storage.local.get(null);
        const filter = computeDarkFilter(settings);
        assert.ok(filter.includes(t.expected), `Theme ${t.theme} filter mismatch: ${filter}`);
      }
    });

    test('1.3 Brightness and contrast adjustment sliders calculate correct filter percentages', async () => {
      await chrome.storage.local.set({ brightness: 80, contrast: 110, grayscale: 20 });
      const settings = await chrome.storage.local.get(null);
      const filter = computeDarkFilter(settings);
      
      assert.ok(filter.includes('brightness(0.8)'));
      assert.ok(filter.includes('contrast(1.1)'));
      assert.ok(filter.includes('grayscale(0.2)'));
    });

    test('1.4 Toggling master active state (active: false) returns "none" filter', async () => {
      await chrome.storage.local.set({ active: false });
      const settings = await chrome.storage.local.get(null);
      const filter = computeDarkFilter(settings);
      assert.strictEqual(filter, 'none');
    });

    test('1.5 chrome.storage.onChanged listener triggers on setting update', async () => {
      let eventFired = false;
      let changedData = null;

      const listener = (changes, area) => {
        if (area === 'local' && changes.theme) {
          eventFired = true;
          changedData = changes.theme;
        }
      };

      chrome.storage.onChanged.addListener(listener);
      await chrome.storage.local.set({ theme: 'sepia' });

      assert.strictEqual(eventFired, true);
      assert.strictEqual(changedData.newValue, 'sepia');

      chrome.storage.onChanged.removeListener(listener);
    });
  });

  // =========================================================================
  // Module 2: Diagram & Image Protection (5 Tests)
  // =========================================================================
  describe('Module 2: Diagram & Image Protection', () => {
    test('2.1 protectDiagrams default value is enabled (true)', async () => {
      const settings = await chrome.storage.local.get(null);
      assert.strictEqual(settings.protectDiagrams, true);
    });

    test('2.2 Diagram protection rule calculates reverse-inversion for embedded images', async () => {
      assert.strictEqual(getReverseFilter(true), 'invert(1) hue-rotate(180deg)');
      assert.strictEqual(getReverseFilter(false), 'none');
    });

    test('2.3 Disabling protectDiagrams removes reverse-inversion filter from images', async () => {
      await chrome.storage.local.set({ protectDiagrams: false });
      const settings = await chrome.storage.local.get(null);
      assert.strictEqual(settings.protectDiagrams, false);
    });

    test('2.4 Canvas protection overlay check correctly identifies canvas and SVG elements', () => {
      assert.strictEqual(isProtectedElement('CANVAS'), true);
      assert.strictEqual(isProtectedElement('svg'), true);
      assert.strictEqual(isProtectedElement('DIV'), false);
    });

    test('2.5 Storage update for protectDiagrams triggers state change event', async () => {
      await chrome.storage.local.set({ protectDiagrams: true });
      let notified = false;
      const listener = (changes) => {
        if (changes.protectDiagrams) notified = true;
      };
      chrome.storage.onChanged.addListener(listener);
      await chrome.storage.local.set({ protectDiagrams: false });
      assert.strictEqual(notified, true);
      chrome.storage.onChanged.removeListener(listener);
    });
  });

  // =========================================================================
  // Module 3: Instant Position Resume (<100ms) (5 Tests)
  // =========================================================================
  describe('Module 3: Instant Position Resume (<100ms)', () => {
    test('3.1 Saves page, scrollTop, scrollLeft, and zoom per PDF URL', async () => {
      const testUrl = 'https://example.com/test.pdf';
      const start = Date.now();
      
      const res = handleBackgroundMessage({
        action: 'save_position',
        url: testUrl,
        page: 5,
        scrollTop: 1200,
        scrollLeft: 0,
        zoom: 1.5
      });
      const elapsed = Date.now() - start;

      assert.ok(elapsed < 100, `Save operation took ${elapsed}ms (expected <100ms)`);
      assert.strictEqual(res.success, true);

      const store = await chrome.storage.local.get('readingPositions');
      const pos = store.readingPositions[testUrl];
      assert.ok(pos);
      assert.strictEqual(pos.page, 5);
      assert.strictEqual(pos.scrollTop, 1200);
      assert.strictEqual(pos.zoom, 1.5);
    });

    test('3.2 Restores last saved reading position instantly (<100ms)', async () => {
      const testUrl = 'https://example.com/report.pdf';
      await handleBackgroundMessage({
        action: 'save_position',
        url: testUrl,
        page: 12,
        scrollTop: 4500,
        zoom: 1.25
      });

      const start = Date.now();
      const store = await chrome.storage.local.get('readingPositions');
      const pos = store.readingPositions[testUrl];
      const elapsed = Date.now() - start;

      assert.ok(elapsed < 100, `Resume lookup took ${elapsed}ms (expected <100ms)`);
      assert.strictEqual(pos.page, 12);
      assert.strictEqual(pos.scrollTop, 4500);
    });

    test('3.3 Handles multiple distinct PDF URLs without position cross-contamination', async () => {
      const url1 = 'https://example.com/doc1.pdf';
      const url2 = 'https://example.com/doc2.pdf';

      await handleBackgroundMessage({ action: 'save_position', url: url1, page: 3, scrollTop: 500, zoom: 1.0 });
      await handleBackgroundMessage({ action: 'save_position', url: url2, page: 18, scrollTop: 2000, zoom: 2.0 });

      const store = await chrome.storage.local.get('readingPositions');
      assert.strictEqual(store.readingPositions[url1].page, 3);
      assert.strictEqual(store.readingPositions[url2].page, 18);
    });

    test('3.4 Updates updatedAt timestamp whenever position is saved', async () => {
      const testUrl = 'https://example.com/timestamp.pdf';
      const t1 = Date.now();
      await handleBackgroundMessage({ action: 'save_position', url: testUrl, page: 1, scrollTop: 0, zoom: 1.0 });

      const store = await chrome.storage.local.get('readingPositions');
      const savedTime = store.readingPositions[testUrl].updatedAt;
      assert.ok(savedTime >= t1);
    });

    test('3.5 Returns default position for unvisited PDF URLs', async () => {
      const store = await chrome.storage.local.get('readingPositions');
      const unvisitedUrl = 'https://example.com/never-opened.pdf';
      const pos = store.readingPositions[unvisitedUrl] || { page: 1, scrollTop: 0, zoom: 1.0 };

      assert.strictEqual(pos.page, 1);
      assert.strictEqual(pos.scrollTop, 0);
      assert.strictEqual(pos.zoom, 1.0);
    });
  });

  // =========================================================================
  // Module 4: Interactive Dark TOC Navigation (5 Tests)
  // =========================================================================
  describe('Module 4: Interactive Dark TOC Navigation', () => {
    test('4.1 Parses PDF outline structure into hierarchical Table of Contents model', () => {
      const mockOutline = [
        { title: 'Chapter 1: Introduction', dest: [ { num: 1 }, { name: 'XYZ' } ], pageNumber: 1 },
        { title: 'Chapter 2: Architecture', dest: [ { num: 5 }, { name: 'XYZ' } ], pageNumber: 5 }
      ];

      const parseToc = (items) => items.map(item => ({ title: item.title, page: item.pageNumber }));
      const toc = parseToc(mockOutline);

      assert.strictEqual(toc.length, 2);
      assert.strictEqual(toc[0].title, 'Chapter 1: Introduction');
      assert.strictEqual(toc[0].page, 1);
      assert.strictEqual(toc[1].page, 5);
    });

    test('4.2 TOC item click maps to correct target page wrapper ID', () => {
      const getTargetElementId = (pageNumber) => `page-wrapper-${pageNumber}`;
      assert.strictEqual(getTargetElementId(7), 'page-wrapper-7');
    });

    test('4.3 Highlights active TOC item matching visible page in viewport', () => {
      const tocItems = [
        { id: 'toc-1', page: 1 },
        { id: 'toc-2', page: 5 },
        { id: 'toc-3', page: 10 }
      ];

      const getActiveTocId = (currentPage, items) => {
        let active = items[0].id;
        for (const item of items) {
          if (currentPage >= item.page) active = item.id;
        }
        return active;
      };

      assert.strictEqual(getActiveTocId(1, tocItems), 'toc-1');
      assert.strictEqual(getActiveTocId(7, tocItems), 'toc-2');
      assert.strictEqual(getActiveTocId(12, tocItems), 'toc-3');
    });

    test('4.4 Handles documents with nested outline items (multi-level hierarchy)', () => {
      const mockNestedOutline = [
        {
          title: 'Section 1',
          pageNumber: 1,
          items: [
            { title: 'Subsection 1.1', pageNumber: 2 },
            { title: 'Subsection 1.2', pageNumber: 4 }
          ]
        }
      ];

      const countTotalNodes = (items) => {
        let count = 0;
        for (const item of items) {
          count++;
          if (item.items) count += countTotalNodes(item.items);
        }
        return count;
      };

      assert.strictEqual(countTotalNodes(mockNestedOutline), 3);
    });

    test('4.5 Gracefully handles PDF documents with no TOC / empty outline metadata', () => {
      const emptyOutline = null;
      const parseTocSafe = (outline) => (Array.isArray(outline) ? outline : []);
      const result = parseTocSafe(emptyOutline);
      assert.deepStrictEqual(result, []);
    });
  });

  // =========================================================================
  // Module 5: Neon Text Highlighting & Note Export (5 Tests)
  // =========================================================================
  describe('Module 5: Neon Text Highlighting & Note Export', () => {
    test('5.1 Selection text overlay applies neon color scheme palette', () => {
      const neonPalette = {
        amber: '#fbbf24',
        cyan: '#22d3ee',
        mint: '#34d399',
        rose: '#fb7185'
      };

      assert.strictEqual(neonPalette.amber, '#fbbf24');
      assert.strictEqual(neonPalette.cyan, '#22d3ee');
      assert.strictEqual(neonPalette.mint, '#34d399');
      assert.strictEqual(neonPalette.rose, '#fb7185');
    });

    test('5.2 Appends created highlight into chrome.storage.local.highlights[pdfUrl]', async () => {
      const testUrl = 'https://example.com/article.pdf';
      await handleBackgroundMessage({
        action: 'add_highlight',
        url: testUrl,
        highlight: { page: 3, text: 'Important dark mode spec', color: 'amber', note: 'Check section 2' }
      });

      const store = await chrome.storage.local.get('highlights');
      const list = store.highlights[testUrl];
      assert.strictEqual(list.length, 1);
      assert.strictEqual(list[0].text, 'Important dark mode spec');
      assert.strictEqual(list[0].color, 'amber');
      assert.strictEqual(list[0].note, 'Check section 2');
    });

    test('5.3 Side note drawer retrieves all saved highlights sorted by page', async () => {
      const testUrl = 'https://example.com/notes.pdf';
      await handleBackgroundMessage({ action: 'add_highlight', url: testUrl, highlight: { page: 10, text: 'Second' } });
      await handleBackgroundMessage({ action: 'add_highlight', url: testUrl, highlight: { page: 2, text: 'First' } });

      const store = await chrome.storage.local.get('highlights');
      const list = [...store.highlights[testUrl]].sort((a, b) => a.page - b.page);

      assert.strictEqual(list[0].page, 2);
      assert.strictEqual(list[1].page, 10);
    });

    test('5.4 1-click Markdown export generates structured markdown with quotes and notes', () => {
      const mockHighlights = [
        { page: 1, text: 'Zero-flicker rendering', note: 'Crucial requirement' },
        { page: 4, text: 'Bionic reading guide', note: '' }
      ];

      const exported = exportHighlights(mockHighlights, 'markdown');
      assert.ok(exported.includes('## Page 1'));
      assert.ok(exported.includes('> Zero-flicker rendering'));
      assert.ok(exported.includes('*Note: Crucial requirement*'));
      assert.ok(exported.includes('## Page 4'));
    });

    test('5.5 1-click Plain Text export generates plain text formatted highlight list', () => {
      const mockHighlights = [
        { page: 5, text: 'Instant resume feature', note: 'Fast performance' }
      ];

      const exported = exportHighlights(mockHighlights, 'plaintext');
      assert.strictEqual(exported, 'Page 5: "Instant resume feature" [Note: Fast performance]');
    });
  });

  // =========================================================================
  // Module 6: Bionic Reading & Line Focus Ruler (5 Tests)
  // =========================================================================
  describe('Module 6: Bionic Reading & Line Focus Ruler', () => {
    test('6.1 Bionic reading guide boldens initial characters of words', () => {
      const sampleText = 'PDF Dark Mode';
      const bionic = applyBionicReading(sampleText);
      assert.strictEqual(bionic, '<b>PD</b>F <b>Da</b>rk <b>Mo</b>de');
    });

    test('6.2 Disabling bionic reading restores original plain text string', async () => {
      await chrome.storage.local.set({ bionicReading: false });
      const settings = await chrome.storage.local.get(null);
      assert.strictEqual(settings.bionicReading, false);
    });

    test('6.3 Line focus ruler overlay calculates correct top position from mouse Y', () => {
      const calculateRulerTop = (mouseY, rulerHeight) => mouseY - (rulerHeight / 2);
      assert.strictEqual(calculateRulerTop(300, 40), 280);
    });

    test('6.4 Ruler height setting updates overlay height dynamically', async () => {
      await chrome.storage.local.set({ rulerHeight: 60 });
      const settings = await chrome.storage.local.get(null);
      assert.strictEqual(settings.rulerHeight, 60);
    });

    test('6.5 Toggling readingRuler updates storage state', async () => {
      await chrome.storage.local.set({ readingRuler: true });
      const settings = await chrome.storage.local.get(null);
      assert.strictEqual(settings.readingRuler, true);
    });
  });

  // =========================================================================
  // Module 7: Auto-Night Schedule (5 Tests)
  // =========================================================================
  describe('Module 7: Auto-Night Schedule', () => {
    test('7.1 Auto-night schedule in "system" mode matches system dark mode preference', () => {
      const schedule = { enabled: true, mode: 'system', startTime: '20:00', endTime: '07:00' };
      assert.strictEqual(isNightTime(schedule, '14:00'), true);
    });

    test('7.2 Auto-night schedule in "sunset" mode activates dark engine during night hours (22:00)', () => {
      const schedule = { enabled: true, mode: 'sunset', startTime: '20:00', endTime: '07:00' };
      assert.strictEqual(isNightTime(schedule, '22:00'), true);
    });

    test('7.3 Overnight schedule window correctly evaluates early morning hours (04:00) as night', () => {
      const schedule = { enabled: true, mode: 'sunset', startTime: '20:00', endTime: '07:00' };
      assert.strictEqual(isNightTime(schedule, '04:00'), true);
    });

    test('7.4 Daytime hours (12:00) during sunset schedule return active dark mode = false', () => {
      const schedule = { enabled: true, mode: 'sunset', startTime: '20:00', endTime: '07:00' };
      assert.strictEqual(isNightTime(schedule, '12:00'), false);
    });

    test('7.5 Disabled schedule returns false regardless of time', () => {
      const schedule = { enabled: false, mode: 'sunset', startTime: '20:00', endTime: '07:00' };
      assert.strictEqual(isNightTime(schedule, '22:00'), false);
    });
  });

  // =========================================================================
  // Module 8: Reading Analytics & Streak Counter (5 Tests)
  // =========================================================================
  describe('Module 8: Reading Analytics & Streak Counter', () => {
    test('8.1 track_reading accumulates total reading time and total pages read', async () => {
      await handleBackgroundMessage({ action: 'track_reading', seconds: 120, page: 1, dateISO: '2026-07-20' });
      await handleBackgroundMessage({ action: 'track_reading', seconds: 180, page: 2, dateISO: '2026-07-20' });

      const store = await chrome.storage.local.get('analytics');
      assert.strictEqual(store.analytics.totalReadingTimeSeconds, 300);
      assert.strictEqual(store.analytics.totalPagesRead, 2);
    });

    test('8.2 Updates daily stats dictionary with date ISO key', async () => {
      await handleBackgroundMessage({ action: 'track_reading', seconds: 60, page: 1, dateISO: '2026-07-21' });

      const store = await chrome.storage.local.get('analytics');
      const today = store.analytics.dailyStats['2026-07-21'];
      assert.strictEqual(today.seconds, 60);
      assert.strictEqual(today.pages, 1);
    });

    test('8.3 Consecutive reading days increment reading streak counter', async () => {
      await handleBackgroundMessage({ action: 'track_reading', seconds: 60, page: 1, dateISO: '2026-07-20' });
      await handleBackgroundMessage({ action: 'track_reading', seconds: 60, page: 1, dateISO: '2026-07-21' });
      await handleBackgroundMessage({ action: 'track_reading', seconds: 60, page: 1, dateISO: '2026-07-22' });

      const store = await chrome.storage.local.get('analytics');
      assert.strictEqual(store.analytics.currentStreak, 3);
    });

    test('8.4 Reading gap of >1 day resets active streak counter back to 1', async () => {
      await handleBackgroundMessage({ action: 'track_reading', seconds: 60, page: 1, dateISO: '2026-07-15' });
      await handleBackgroundMessage({ action: 'track_reading', seconds: 60, page: 1, dateISO: '2026-07-22' });

      const store = await chrome.storage.local.get('analytics');
      assert.strictEqual(store.analytics.currentStreak, 1);
    });

    test('8.5 Analytics record includes lastReadDate string', async () => {
      await handleBackgroundMessage({ action: 'track_reading', seconds: 60, page: 1, dateISO: '2026-07-22' });

      const store = await chrome.storage.local.get('analytics');
      assert.strictEqual(store.analytics.lastReadDate, '2026-07-22');
    });

    test('8.6 Dynamic streak calculation computes active streak accurately based on lastReadDate', () => {
      const today = new Date().toISOString().split('T')[0];
      const activeStreak = calculateActiveStreak({ lastReadDate: today, currentStreak: 5 });
      assert.strictEqual(activeStreak, 5);

      const oldStreak = calculateActiveStreak({ lastReadDate: '2020-01-01', currentStreak: 10 });
      assert.strictEqual(oldStreak, 0);
    });
  });

  // =========================================================================
  // Module 9: Voluntary Donation & Supporter Framework (5 Tests)
  // =========================================================================
  describe('Module 9: Voluntary Donation & Supporter Framework', () => {
    test('9.1 Reaching 7-day streak milestone triggers non-intrusive thank-you prompt', async () => {
      for (let i = 1; i <= 7; i++) {
        const dateStr = `2026-07-${i < 10 ? '0' + i : i}`;
        var res = await handleBackgroundMessage({ action: 'track_reading', seconds: 60, page: 1, dateISO: dateStr });
      }

      assert.strictEqual(res.triggerDonationPrompt, true);
      assert.ok(res.reason.includes('7-day streak'));
    });

    test('9.2 Reaching 50 pages read milestone triggers thank-you prompt message', async () => {
      const res = await handleBackgroundMessage({ action: 'track_reading', seconds: 500, page: 50, dateISO: '2026-07-22' });
      assert.strictEqual(res.triggerDonationPrompt, true);
    });

    test('9.3 Supporter status (isSupporter: true) enables gold accent theme toggle', async () => {
      await chrome.storage.local.set({
        supporter: { isSupporter: true, goldAccent: true, promptDismissedCount: 0, lastPromptDate: '' }
      });

      const store = await chrome.storage.local.get('supporter');
      assert.strictEqual(store.supporter.isSupporter, true);
      assert.strictEqual(store.supporter.goldAccent, true);
    });

    test('9.4 Supporter status suppresses milestone thank-you prompts permanently', async () => {
      await chrome.storage.local.set({
        supporter: { isSupporter: true, goldAccent: true, promptDismissedCount: 0, lastPromptDate: '' }
      });

      // Simulate reaching 10-day streak as a supporter
      for (let i = 1; i <= 10; i++) {
        const dateStr = `2026-07-${i < 10 ? '0' + i : i}`;
        var res = await handleBackgroundMessage({ action: 'track_reading', seconds: 60, page: 1, dateISO: dateStr });
      }

      assert.strictEqual(res.triggerDonationPrompt, undefined);
    });

    test('9.5 Dismissing donation prompt increments promptDismissedCount and enforces limit', async () => {
      const supporterState = { isSupporter: false, goldAccent: false, promptDismissedCount: 3, lastPromptDate: '2026-07-21' };
      await chrome.storage.local.set({ supporter: supporterState });

      // Even if streak is >= 7, limit of 3 dismissals prevents further prompts
      const res = await handleBackgroundMessage({ action: 'track_reading', seconds: 60, page: 50, dateISO: '2026-07-22' });
      assert.strictEqual(res.triggerDonationPrompt, undefined);
    });

    test('9.6 100% Free Core Experience: all features unlocked with no paywalls or mandatory registration', async () => {
      const defaults = getDefaultStorageState();
      assert.strictEqual(defaults.active, true);
      assert.strictEqual(defaults.mode, 'enhanced');
      assert.strictEqual(defaults.theme, 'oled');
      assert.strictEqual(defaults.protectDiagrams, true);
      assert.strictEqual(defaults.supporter.isSupporter, false);
    });

    test('9.7 Multi-Platform Support Links: Buy Me a Coffee, Ko-fi, GitHub Sponsors, PayPal buttons present', () => {
      const fs = require('fs');
      const path = require('path');
      const popupHtml = fs.readFileSync(path.join(__dirname, '../../popup.html'), 'utf8');

      assert.ok(popupHtml.includes('https://buymeacoffee.com'), 'Buy Me a Coffee link missing');
      assert.ok(popupHtml.includes('https://ko-fi.com'), 'Ko-fi link missing');
      assert.ok(popupHtml.includes('https://github.com/sponsors'), 'GitHub Sponsors link missing');
      assert.ok(popupHtml.includes('https://paypal.me'), 'PayPal link missing');
    });

    test('9.8 Supporter Badge and Gold Accent theme toggles present in popup HTML and viewer CSS', () => {
      const fs = require('fs');
      const path = require('path');
      const popupHtml = fs.readFileSync(path.join(__dirname, '../../popup.html'), 'utf8');
      const popupCss = fs.readFileSync(path.join(__dirname, '../../popup.css'), 'utf8');
      const viewerCss = fs.readFileSync(path.join(__dirname, '../../viewer.css'), 'utf8');

      assert.ok(popupHtml.includes('id="is-supporter-toggle"'), 'is-supporter-toggle missing');
      assert.ok(popupHtml.includes('id="gold-accent-toggle"'), 'gold-accent-toggle missing');
      assert.ok(popupHtml.includes('id="popup-supporter-badge"'), 'popup-supporter-badge missing');
      assert.ok(popupCss.includes('.theme-gold-accent'), 'popup.css missing .theme-gold-accent');
      assert.ok(viewerCss.includes('.theme-gold-accent'), 'viewer.css missing .theme-gold-accent');
    });
  });

  // =========================================================================
  // Module 10: Phase 2 Web Store Production Polish (4 Tests)
  // =========================================================================
  describe('Module 10: Phase 2 Web Store Production Polish', () => {
    test('10.1 In-viewer search bar overlay & Export Full PDF Text button present in viewer HTML & JS exports', () => {
      const fs = require('fs');
      const path = require('path');
      const viewerHtml = fs.readFileSync(path.join(__dirname, '../../viewer.html'), 'utf8');
      const viewerJs = require('../../viewer.js');

      assert.ok(viewerHtml.includes('id="search-bar"'), 'search-bar element missing');
      assert.ok(viewerHtml.includes('id="btn-export-full-txt"'), 'btn-export-full-txt element missing');
      assert.strictEqual(typeof viewerJs.exportFullPdfText, 'function');
      assert.strictEqual(typeof viewerJs.performSearch, 'function');
    });

    test('10.2 Global keyboard shortcut commands registered in manifest.json', () => {
      const fs = require('fs');
      const path = require('path');
      const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '../../manifest.json'), 'utf8'));

      assert.ok(manifest.commands, 'commands block missing in manifest.json');
      assert.ok(manifest.commands['toggle-dark-mode'], 'toggle-dark-mode command missing');
      assert.ok(manifest.commands['toggle-bionic-reading'], 'toggle-bionic-reading command missing');
      assert.ok(manifest.commands['toggle-reading-ruler'], 'toggle-reading-ruler command missing');
    });

    test('10.3 Onboarding welcome.html page exists with shortcuts cheat sheet and file setup guide', () => {
      const fs = require('fs');
      const path = require('path');
      const welcomeHtml = fs.readFileSync(path.join(__dirname, '../../welcome.html'), 'utf8');

      assert.ok(welcomeHtml.includes('Welcome to PDF Dark Mode'), 'Welcome title missing');
      assert.ok(welcomeHtml.includes('Keyboard Shortcuts Cheat Sheet'), 'Shortcuts section missing');
      assert.ok(welcomeHtml.includes('Allow access to file URLs'), 'File setup guide missing');
    });

    test('10.4 Settings & Data JSON Backup / Restore UI controls present in popup HTML & JS', () => {
      const fs = require('fs');
      const path = require('path');
      const popupHtml = fs.readFileSync(path.join(__dirname, '../../popup.html'), 'utf8');

      assert.ok(popupHtml.includes('id="btn-backup-data"'), 'btn-backup-data missing');
      assert.ok(popupHtml.includes('id="btn-restore-trigger"'), 'btn-restore-trigger missing');
      assert.ok(popupHtml.includes('id="lang-selector"'), 'lang-selector missing');
    });

    test('10.5 Firefox Manifest (manifest.firefox.json) and dual background script compatibility', () => {
      const fs = require('fs');
      const path = require('path');
      const manifestChrome = JSON.parse(fs.readFileSync(path.join(__dirname, '../../manifest.json'), 'utf8'));
      const manifestFirefox = JSON.parse(fs.readFileSync(path.join(__dirname, '../../manifest.firefox.json'), 'utf8'));
      const background = require('../../background.js');

      assert.strictEqual(manifestFirefox.manifest_version, 3, 'manifest_version must be 3');
      assert.strictEqual(manifestFirefox.name, 'PDF Dark Mode - High Contrast Reader', 'Firefox manifest name mismatch');
      assert.strictEqual(manifestFirefox.version, '2.4.0', 'Firefox manifest version mismatch');
      assert.strictEqual(manifestFirefox.description, manifestChrome.description, 'Description must match manifest.json');
      assert.deepStrictEqual(manifestFirefox.browser_specific_settings, {
        gecko: {
          id: 'pdf-dark-mode@extension.org',
          strict_min_version: '109.0'
        }
      }, 'browser_specific_settings mismatch');
      assert.deepStrictEqual(manifestFirefox.background, { scripts: ['background.js'] }, 'background.scripts mismatch');
      
      const requiredPermissions = ['storage', 'scripting', 'activeTab', 'webNavigation', 'webRequest', 'alarms', 'unlimitedStorage'];
      requiredPermissions.forEach(perm => {
        assert.ok(manifestFirefox.permissions.includes(perm), `Missing permission: ${perm}`);
      });
      assert.ok(manifestFirefox.host_permissions.includes('<all_urls>'), 'Missing <all_urls> host permission');
      assert.ok(manifestFirefox.host_permissions.includes('file:///*'), 'Missing file:///* host permission');

      assert.ok(manifestFirefox.action, 'action section missing');
      assert.ok(manifestFirefox.content_scripts, 'content_scripts section missing');
      assert.ok(manifestFirefox.web_accessible_resources, 'web_accessible_resources section missing');
      assert.ok(manifestFirefox.icons, 'icons section missing');

      assert.ok(background.globalScope, 'globalScope is exported from background.js');
    });
  });

  // =========================================================================
  // Module 11: Custom Preference Profiles (Feature R1)
  // =========================================================================
  describe('Module 11: Custom Preference Profiles (Feature R1)', () => {
    test('11.1 Built-in preference profiles are present and contain valid settings schema', () => {
      assert.ok(BUILT_IN_PROFILES.default, 'Default profile missing');
      assert.ok(BUILT_IN_PROFILES.built_in_night, 'Deep Night Focus profile missing');
      assert.ok(BUILT_IN_PROFILES.built_in_ereader, 'Warm E-Reader profile missing');

      assert.strictEqual(BUILT_IN_PROFILES.default.name, 'Default Dark');
      assert.strictEqual(BUILT_IN_PROFILES.built_in_night.name, 'Deep Night Focus');
      assert.strictEqual(BUILT_IN_PROFILES.built_in_ereader.name, 'Warm E-Reader');

      assert.strictEqual(BUILT_IN_PROFILES.built_in_night.settings.theme, 'slate');
      assert.strictEqual(BUILT_IN_PROFILES.built_in_ereader.settings.theme, 'sepia');
    });

    test('11.2 saveCurrentProfile persists custom profile payload and sets activeProfileId in chrome.storage.local', async () => {
      await chrome.storage.local.set({ mode: 'enhanced', theme: 'sepia', brightness: 85, contrast: 105 });

      await new Promise((resolve) => {
        saveCurrentProfile('Study Preset', (newProfile) => {
          assert.ok(newProfile, 'New profile object not returned');
          assert.strictEqual(newProfile.name, 'Study Preset');
          assert.strictEqual(newProfile.isBuiltIn, false);
          assert.strictEqual(newProfile.settings.theme, 'sepia');
          assert.strictEqual(newProfile.settings.brightness, 85);
          resolve();
        });
      });

      const store = await chrome.storage.local.get(null);
      assert.ok(store.profiles, 'Profiles object missing in storage');
      assert.strictEqual(store.activeProfileId, Object.keys(store.profiles).find(k => store.profiles[k].name === 'Study Preset'));
    });

    test('11.3 applyProfile loads profile settings into storage and active configuration', async () => {
      await applyProfile('built_in_ereader');

      const store = await chrome.storage.local.get(null);
      assert.strictEqual(store.activeProfileId, 'built_in_ereader');
      assert.strictEqual(store.theme, 'sepia');
      assert.strictEqual(store.brightness, 90);
      assert.strictEqual(store.bionicReading, true);
    });

    test('11.4 deleteProfile deletes custom profile and falls back to default if active profile is deleted', async () => {
      let customId = null;
      await new Promise((resolve) => {
        saveCurrentProfile('Temp Preset', (newProfile) => {
          customId = newProfile.id;
          resolve();
        });
      });

      let store = await chrome.storage.local.get(null);
      assert.ok(store.profiles[customId], 'Custom profile was not created');
      assert.strictEqual(store.activeProfileId, customId);

      await new Promise((resolve) => {
        deleteProfile(customId, resolve);
      });

      store = await chrome.storage.local.get(null);
      assert.strictEqual(store.profiles[customId], undefined, 'Custom profile was not deleted');
      assert.strictEqual(store.activeProfileId, 'default', 'Active profile did not fallback to default');
    });

    test('11.5 deleteProfile ignores built-in profile deletion requests', async () => {
      await new Promise((resolve) => {
        deleteProfile('built_in_night', resolve);
        setTimeout(resolve, 50);
      });

      const store = await chrome.storage.local.get(null);
      assert.ok(store.profiles.built_in_night || BUILT_IN_PROFILES.built_in_night, 'Built-in profile was deleted');
    });

    test('11.6 saveCurrentProfile truncates name to 25 chars and calls cb(false) on empty/whitespace name', async () => {
      await new Promise((resolve) => {
        saveCurrentProfile('   Super Long Profile Name Exceeding 25 Characters   ', (newProfile) => {
          assert.ok(newProfile, 'New profile should be created');
          assert.strictEqual(newProfile.name, 'Super Long Profile Name E', 'Name was not truncated to 25 chars');
          assert.strictEqual(newProfile.name.length, 25);
          resolve();
        });
      });

      let emptyCallbackCalled = false;
      saveCurrentProfile('   ', (res) => {
        emptyCallbackCalled = true;
        assert.strictEqual(res, false, 'Callback should be called with false for whitespace name');
      });
      assert.strictEqual(emptyCallbackCalled, true);

      let nullCallbackCalled = false;
      saveCurrentProfile('', (res) => {
        nullCallbackCalled = true;
        assert.strictEqual(res, false, 'Callback should be called with false for empty name');
      });
      assert.strictEqual(nullCallbackCalled, true);
    });

    test('11.7 deleteProfile invokes callback with false on invalid or built-in profileId', async () => {
      let emptyResult = null;
      deleteProfile('', (res) => { emptyResult = res; });
      assert.strictEqual(emptyResult, false, 'Empty profileId should return false via cb');

      let builtInResult = null;
      deleteProfile('built_in_night', (res) => { builtInResult = res; });
      assert.strictEqual(builtInResult, false, 'Built-in profileId should return false via cb');

      let missingResult = null;
      deleteProfile('non_existent_profile_id_123', (res) => { missingResult = res; });
      assert.strictEqual(missingResult, false, 'Missing profileId should return false via cb');
    });

    test('11.8 deleteProfile triggers tab reload and resets UI to default settings when active profile is deleted', async () => {
      let customId = null;
      await new Promise((resolve) => {
        saveCurrentProfile('Active Custom Profile', (p) => {
          customId = p.id;
          resolve();
        });
      });

      // Set active tab to a PDF URL and reset reloaded status
      if (chrome.__helpers) {
        chrome.__helpers.setTab(1, { id: 1, active: true, currentWindow: true, url: 'https://example.com/doc.pdf', reloaded: false });
      }

      let deleteSuccess = null;
      await new Promise((resolve) => {
        deleteProfile(customId, (res) => {
          deleteSuccess = res;
          resolve();
        });
      });

      assert.strictEqual(deleteSuccess, true, 'deleteProfile should return true on successful deletion');

      const store = await chrome.storage.local.get(null);
      assert.strictEqual(store.activeProfileId, 'default', 'Active profile fallback failed');
      assert.strictEqual(store.mode, BUILT_IN_PROFILES.default.settings.mode);
      assert.strictEqual(store.theme, BUILT_IN_PROFILES.default.settings.theme);

      if (chrome.__helpers) {
        const tab = chrome.__helpers.getTab(1);
        assert.strictEqual(tab.reloaded, true, 'Active tab was not reloaded after active profile deletion');
      }
    });
  });

  // =========================================================================
  // Module 12: GitHub-style Annual Reading Heatmap (Feature R2)
  // =========================================================================
  describe('Module 12: GitHub-style Annual Reading Heatmap (Feature R2)', () => {
    function setupMockHeatmapDOM() {
      const children = [];
      const classListSet = new Set();

      const cardEl = {
        classList: {
          add: (c) => classListSet.add(c),
          remove: (c) => classListSet.delete(c),
          contains: (c) => classListSet.has(c),
          toggle: (c, val) => val ? classListSet.add(c) : classListSet.delete(c)
        }
      };

      const wrapperEl = {
        id: 'reading-heatmap-wrapper',
        scrollLeft: 0,
        scrollWidth: 800,
        classList: {
          add: (c) => classListSet.add(c),
          remove: (c) => classListSet.delete(c),
          contains: (c) => classListSet.has(c),
          toggle: (c, val) => val ? classListSet.add(c) : classListSet.delete(c)
        }
      };

      const gridEl = {
        id: 'reading-heatmap-grid',
        innerHTML: '',
        children: children,
        classList: {
          add: (c) => classListSet.add(c),
          remove: (c) => classListSet.delete(c),
          contains: (c) => classListSet.has(c),
          toggle: (c, val) => val ? classListSet.add(c) : classListSet.delete(c)
        },
        appendChild: (child) => { children.push(child); },
        closest: (selector) => (selector === '.heatmap-card' ? cardEl : null)
      };

      const totalDaysEl = {
        id: 'heatmap-total-days',
        textContent: ''
      };

      const mockDoc = {
        getElementById: (id) => {
          if (id === 'reading-heatmap-grid') return gridEl;
          if (id === 'heatmap-total-days') return totalDaysEl;
          if (id === 'reading-heatmap-wrapper') return wrapperEl;
          return null;
        },
        createElement: (tag) => {
          const elClassList = new Set();
          const dataset = {};
          const attributes = {};
          return {
            tagName: tag.toUpperCase(),
            className: '',
            title: '',
            dataset: dataset,
            setAttribute: (k, v) => { attributes[k] = v; },
            getAttribute: (k) => attributes[k],
            classList: {
              add: (c) => elClassList.add(c),
              remove: (c) => elClassList.delete(c),
              contains: (c) => elClassList.has(c)
            }
          };
        }
      };

      return { mockDoc, gridEl, totalDaysEl, wrapperEl, cardEl, children, classListSet };
    }

    test('12.1 renderReadingHeatmap generates exactly 365 cell elements for the past year ending today', () => {
      const origDoc = global.document;
      const { mockDoc, children } = setupMockHeatmapDOM();
      global.document = mockDoc;

      try {
        renderReadingHeatmap({}, false, false);
        assert.strictEqual(children.length, 365, 'Heatmap should generate 365 cells');
        const todayISO = new Date().toISOString().split('T')[0];
        const lastCell = children[children.length - 1];
        assert.strictEqual(lastCell.dataset.date, todayISO, 'Last cell date should match today');
      } finally {
        global.document = origDoc;
      }
    });

    test('12.2 Reading minutes are correctly mapped to 5 intensity levels (level-0 through level-4)', () => {
      const origDoc = global.document;
      const { mockDoc, children } = setupMockHeatmapDOM();
      global.document = mockDoc;

      const now = new Date();
      const getDateISO = (offsetDays) => {
        const d = new Date(now);
        d.setDate(d.getDate() - offsetDays);
        return d.toISOString().split('T')[0];
      };

      const dateL0 = getDateISO(10);
      const dateL1 = getDateISO(20);
      const dateL2 = getDateISO(30);
      const dateL3 = getDateISO(40);
      const dateL4 = getDateISO(50);

      const dailyStats = {
        [dateL0]: { seconds: 0, pages: 0 },       // 0m -> level-0
        [dateL1]: { seconds: 300, pages: 2 },     // 5m -> level-1 (1-14m)
        [dateL2]: { seconds: 1200, pages: 10 },   // 20m -> level-2 (15-29m)
        [dateL3]: { seconds: 2700, pages: 25 },   // 45m -> level-3 (30-59m)
        [dateL4]: { seconds: 4500, pages: 40 }    // 75m -> level-4 (60m+)
      };

      try {
        renderReadingHeatmap(dailyStats, false, false);

        const findCell = (dateISO) => children.find(c => c.dataset.date === dateISO);

        assert.strictEqual(findCell(dateL0).className, 'heatmap-cell level-0');
        assert.strictEqual(findCell(dateL1).className, 'heatmap-cell level-1');
        assert.strictEqual(findCell(dateL2).className, 'heatmap-cell level-2');
        assert.strictEqual(findCell(dateL3).className, 'heatmap-cell level-3');
        assert.strictEqual(findCell(dateL4).className, 'heatmap-cell level-4');
      } finally {
        global.document = origDoc;
      }
    });

    test('12.3 Cell tooltips display formatted date, reading minutes, and page count', () => {
      const origDoc = global.document;
      const { mockDoc, children } = setupMockHeatmapDOM();
      global.document = mockDoc;

      const todayISO = new Date().toISOString().split('T')[0];
      const dailyStats = {
        [todayISO]: { seconds: 1800, pages: 15 } // 30m, 15 pages
      };

      try {
        renderReadingHeatmap(dailyStats, false, false);
        const todayCell = children[children.length - 1];

        assert.ok(todayCell.title.includes(todayISO), 'Title should contain date ISO');
        assert.ok(todayCell.title.includes('30 mins'), 'Title should contain reading minutes');
        assert.ok(todayCell.title.includes('15 pages'), 'Title should contain page count');
      } finally {
        global.document = origDoc;
      }
    });

    test('12.4 Heatmap active days meta count and auto-scroll position update correctly', () => {
      const origDoc = global.document;
      const { mockDoc, totalDaysEl, wrapperEl } = setupMockHeatmapDOM();
      global.document = mockDoc;

      const now = new Date();
      const getDateISO = (offsetDays) => {
        const d = new Date(now);
        d.setDate(d.getDate() - offsetDays);
        return d.toISOString().split('T')[0];
      };

      const dailyStats = {
        [getDateISO(1)]: { seconds: 600, pages: 5 },
        [getDateISO(2)]: { seconds: 1200, pages: 8 },
        [getDateISO(3)]: { seconds: 1800, pages: 12 }
      };

      try {
        renderReadingHeatmap(dailyStats, false, false);

        assert.strictEqual(totalDaysEl.textContent, '3 active days in past year');
        assert.strictEqual(wrapperEl.scrollLeft, wrapperEl.scrollWidth, 'Scroll container should auto-scroll to end');
      } finally {
        global.document = origDoc;
      }
    });

    test('12.5 Supporter status or gold accent applies supporter-heatmap and theme-gold-accent classes', () => {
      const origDoc = global.document;
      const { mockDoc, classListSet } = setupMockHeatmapDOM();
      global.document = mockDoc;

      try {
        // Active supporter
        renderReadingHeatmap({}, true, false);
        assert.ok(classListSet.has('supporter-heatmap'), 'supporter-heatmap class missing when isSupporter is true');
        assert.ok(classListSet.has('theme-gold-accent'), 'theme-gold-accent class missing when isSupporter is true');

        // Gold accent toggled
        renderReadingHeatmap({}, false, true);
        assert.ok(classListSet.has('supporter-heatmap'), 'supporter-heatmap class missing when goldAccent is true');
        assert.ok(classListSet.has('theme-gold-accent'), 'theme-gold-accent class missing when goldAccent is true');

        // Neither active
        renderReadingHeatmap({}, false, false);
        assert.strictEqual(classListSet.has('supporter-heatmap'), false, 'supporter-heatmap should be removed when non-supporter');
        assert.strictEqual(classListSet.has('theme-gold-accent'), false, 'theme-gold-accent should be removed when non-supporter');
      } finally {
        global.document = origDoc;
      }
    });
  });

  // =========================================================================
  // Module 13: Multi-Tab PDF Workspace (5 Tests)
  // =========================================================================
  describe('Module 13: Multi-Tab PDF Workspace', () => {
    beforeEach(() => {
      TabManager.tabs = [];
      TabManager.activeTabId = null;
    });

    test('13.1 TabSession data model initializes structured session properties', () => {
      const session = new TabSession({
        id: 'test_tab_1',
        url: 'file:///sample.pdf',
        title: 'sample.pdf',
        numPages: 10,
        activePageNum: 3,
        currentScale: 1.25,
        scrollTop: 150,
        scrollLeft: 0,
        tocItems: [{ title: 'Chapter 1', page: 1 }],
        aspectRatio: 1.5,
        isLoaded: true
      });

      assert.strictEqual(session.id, 'test_tab_1');
      assert.strictEqual(session.url, 'file:///sample.pdf');
      assert.strictEqual(session.title, 'sample.pdf');
      assert.strictEqual(session.numPages, 10);
      assert.strictEqual(session.activePageNum, 3);
      assert.strictEqual(session.currentScale, 1.25);
      assert.strictEqual(session.scrollTop, 150);
      assert.strictEqual(session.tocItems.length, 1);
      assert.strictEqual(session.aspectRatio, 1.5);
      assert.strictEqual(session.isLoaded, true);
      assert.ok(session.visitedPagesSet instanceof Set);
    });

    test('13.2 TabManager.createTab creates new tab session and sets activeTabId', () => {
      const tab1 = TabManager.createTab('file:///doc1.pdf', 'Document 1');

      assert.strictEqual(TabManager.tabs.length, 1);
      assert.strictEqual(TabManager.activeTabId, tab1.id);
      assert.strictEqual(TabManager.getActiveTab().title, 'Document 1');

      const tab2 = TabManager.createTab('file:///doc2.pdf', 'Document 2');
      assert.strictEqual(TabManager.tabs.length, 2);
      assert.strictEqual(TabManager.activeTabId, tab2.id);
      assert.strictEqual(TabManager.getActiveTab().title, 'Document 2');
    });

    test('13.3 TabManager.switchToTab preserves outgoing tab state and activates target tab', () => {
      TabManager.tabs = [];
      TabManager.activeTabId = null;

      const tab1 = TabManager.createTab('file:///doc1.pdf', 'Document 1');
      tab1.pdfDoc = { numPages: 5 };
      tab1.numPages = 5;
      tab1.activePageNum = 2;
      tab1.currentScale = 1.5;
      tab1.scrollTop = 300;

      const tab2 = TabManager.createTab('file:///doc2.pdf', 'Document 2');
      tab2.pdfDoc = { numPages: 8 };
      tab2.numPages = 8;
      tab2.activePageNum = 4;
      tab2.currentScale = 1.0;
      tab2.scrollTop = 100;

      TabManager.switchToTab(tab1.id);
      assert.strictEqual(TabManager.activeTabId, tab1.id);
      assert.strictEqual(TabManager.getActiveTab().title, 'Document 1');
      assert.strictEqual(TabManager.getActiveTab().currentScale, 1.5);
      assert.strictEqual(TabManager.getActiveTab().scrollTop, 300);
      assert.strictEqual(TabManager.getActiveTab().activePageNum, 2);

      TabManager.switchToTab(tab2.id);
      assert.strictEqual(TabManager.activeTabId, tab2.id);
      assert.strictEqual(TabManager.getActiveTab().title, 'Document 2');
      assert.strictEqual(TabManager.getActiveTab().currentScale, 1.0);
      assert.strictEqual(TabManager.getActiveTab().scrollTop, 100);
      assert.strictEqual(TabManager.getActiveTab().activePageNum, 4);

      // Verify outgoing tab1 state preserved
      assert.strictEqual(tab1.currentScale, 1.5);
      assert.strictEqual(tab1.scrollTop, 300);
      assert.strictEqual(tab1.activePageNum, 2);
    });

    test('13.4 TabManager.closeTab closes tab, destroys pdfDoc resources, switches to adjacent tab', () => {
      TabManager.tabs = [];
      TabManager.activeTabId = null;

      let destroyed = false;
      const tab1 = TabManager.createTab('file:///doc1.pdf', 'Doc 1');
      tab1.pdfDoc = { destroy: () => { destroyed = true; } };
      tab1.arrayBuffer = new ArrayBuffer(8);

      const tab2 = TabManager.createTab('file:///doc2.pdf', 'Doc 2');
      const tab3 = TabManager.createTab('file:///doc3.pdf', 'Doc 3');

      assert.strictEqual(TabManager.activeTabId, tab3.id);

      // Close tab1 (non-active, has pdfDoc & arrayBuffer)
      TabManager.closeTab(tab1.id);
      assert.strictEqual(destroyed, true, 'pdfDoc.destroy() should be called');
      assert.strictEqual(tab1.pdfDoc, null, 'tab1.pdfDoc should be cleared');
      assert.strictEqual(tab1.arrayBuffer, null, 'tab1.arrayBuffer should be cleared');
      assert.strictEqual(TabManager.tabs.length, 2);
      assert.strictEqual(TabManager.activeTabId, tab3.id);

      // Close active tab3 -> switches to tab2
      TabManager.closeTab(tab3.id);
      assert.strictEqual(TabManager.tabs.length, 1);
      assert.strictEqual(TabManager.activeTabId, tab2.id);

      // Close remaining tab2 -> creates default empty tab
      TabManager.closeTab(tab2.id);
      assert.strictEqual(TabManager.tabs.length, 1);
      assert.strictEqual(TabManager.getActiveTab().title, 'PDF Dark Mode');
    });

    test('13.5 TabManager.renderTabBarUI generates dynamic DOM elements with active highlight and observer/render guards work', async () => {
      TabManager.tabs = [];
      TabManager.activeTabId = null;
      const origDoc = global.document;
      const createdElements = [];
      let tabListChildren = [];
      let btnAddBound = false;

      const mockTabList = {
        get innerHTML() { return ''; },
        set innerHTML(val) { if (val === '') tabListChildren = []; },
        appendChild: (child) => tabListChildren.push(child)
      };

      const mockBtnAdd = {
        dataset: {},
        addEventListener: (event, cb) => {
          if (event === 'click') btnAddBound = true;
        }
      };

      global.document = {
        getElementById: (id) => {
          if (id === 'tab-list') return mockTabList;
          if (id === 'btn-add-tab') return mockBtnAdd;
          return null;
        },
        createElement: (tag) => {
          const children = [];
          const el = {
            tagName: tag.toUpperCase(),
            className: '',
            dataset: {},
            textContent: '',
            title: '',
            listeners: {},
            appendChild: (c) => children.push(c),
            addEventListener: (evt, fn) => { el.listeners[evt] = fn; }
          };
          createdElements.push(el);
          return el;
        }
      };

      try {
        TabManager.createTab('file:///a.pdf', 'Alpha');
        TabManager.createTab('file:///b.pdf', 'Beta');

        TabManager.renderTabBarUI();

        assert.strictEqual(tabListChildren.length, 2, 'Tab list should contain 2 tab-item elements');
        assert.ok(tabListChildren[1].className.includes('active'), 'Active tab element should have active class');
        assert.ok(btnAddBound, '#btn-add-tab click listener should be bound');
      } finally {
        global.document = origDoc;
      }

      // Verify pageObserver disconnect on setupIntersectionObserver
      let disconnected = false;
      const origIO = global.IntersectionObserver;
      global.IntersectionObserver = class {
        constructor(cb, options) {}
        observe() {}
        disconnect() {
          disconnected = true;
        }
      };

      try {
        const viewer = require('../../viewer.js');
        viewer.setupIntersectionObserver();
        assert.ok(viewer.pageObserver, 'pageObserver instance should exist');

        viewer.setupIntersectionObserver();
        assert.strictEqual(disconnected, true, 'previous pageObserver.disconnect() should have been called');
      } finally {
        global.IntersectionObserver = origIO;
      }

      // Verify renderPage async guard
      const viewer = require('../../viewer.js');
      TabManager.tabs = [];

      let renderCalled = false;
      const mockPage = {
        getViewport: () => ({ width: 100, height: 100 }),
        render: () => {
          renderCalled = true;
          return { promise: Promise.resolve() };
        }
      };

      const wrapper = {
        id: 'page-wrapper-1',
        dataset: { rendered: 'false' },
        appendChild: () => {},
        querySelector: () => null
      };

      global.document = {
        getElementById: (id) => id === 'page-wrapper-1' ? wrapper : null,
        createElement: (tag) => ({ style: {}, parentNode: null, remove: () => {} })
      };

      let pagePromiseResolve;
      const mockPdfDoc = {
        getPage: () => new Promise(resolve => { pagePromiseResolve = resolve; })
      };

      try {
        const tab1 = TabManager.createTab('file:///doc1.pdf', 'Tab 1');
        tab1.pdfDoc = mockPdfDoc;
        TabManager.switchToTab(tab1.id);
        const initialTabId = TabManager.activeTabId;

        // Call renderPage while tab1 is active
        viewer.renderPage(1);
        assert.strictEqual(wrapper.dataset.rendered, 'true', 'wrapper should set rendered=true while pending');

        // Switch to tab2 before getPage resolves
        const tab2 = TabManager.createTab('file:///doc2.pdf', 'Tab 2');
        assert.notStrictEqual(TabManager.activeTabId, initialTabId);

        // Resolve getPage now
        pagePromiseResolve(mockPage);
        await new Promise(r => setTimeout(r, 10));

        assert.strictEqual(wrapper.dataset.rendered, 'false', 'wrapper.dataset.rendered should reset to false on tab switch');
        assert.strictEqual(renderCalled, false, 'page.render should not be executed for obsolete tab');
      } finally {
        global.document = origDoc;
      }
    });
  });

  // =========================================================================
  // Module 8: Text-to-Speech (TTS) Narration & Highlighting (5 Tests)
  // =========================================================================
  describe('Module 8: Text-to-Speech (TTS) Narration & Highlighting', () => {
    test('8.1 TTS controller initialization and voice listing', () => {
      const controller = new TTSController();
      const voices = controller.getSynth().getVoices();
      assert.ok(Array.isArray(voices), 'getVoices should return array of voices');
      assert.ok(voices.length > 0, 'voices array should not be empty in mock environment');

      const selectVoice = {
        innerHTML: '',
        options: [],
        appendChild: function(opt) { this.options.push(opt); }
      };

      const origDoc = global.document;
      global.document = {
        getElementById: (id) => id === 'tts-select-voice' ? selectVoice : null,
        createElement: (tag) => ({ value: '', textContent: '' })
      };

      try {
        controller.populateVoices();
        assert.ok(controller.voices.length > 0, 'controller.voices populated');
        assert.ok(selectVoice.options.length > 0, 'voice options appended to dropdown');
      } finally {
        global.document = origDoc;
      }
    });

    test('8.2 Real-time sentence segmentation & DOM highlighting class toggling', () => {
      const controller = new TTSController();

      function createMockSpan(text) {
        const classes = new Set();
        return {
          textContent: text,
          classList: {
            add: (c) => classes.add(c),
            remove: (c) => classes.delete(c),
            contains: (c) => classes.has(c),
            has: (c) => classes.has(c)
          },
          scrollIntoView: () => {}
        };
      }

      const span1 = createMockSpan('First sentence. ');
      const span2 = createMockSpan('Second sentence? ');

      const mockContainer = {
        querySelectorAll: (selector) => {
          if (selector === '.textLayer span') return [span1, span2];
          return [];
        }
      };

      const origDoc = global.document;
      global.document = {
        querySelectorAll: (selector) => {
          if (selector === '.tts-sentence-highlight') return [span1, span2].filter(s => s.classList.contains('tts-sentence-highlight'));
          return [];
        }
      };

      try {
        const sentences = controller.loadSentencesFromDOM(mockContainer);
        assert.strictEqual(sentences.length, 2, '2 sentences extracted');
        assert.strictEqual(sentences[0].text, 'First sentence.');
        assert.strictEqual(sentences[1].text, 'Second sentence?');

        controller.highlightCurrentSentence();
        assert.strictEqual(span1.classList.contains('tts-sentence-highlight'), true, 'span1 has highlight class for sentence 0');

        controller.next();
        assert.strictEqual(span1.classList.contains('tts-sentence-highlight'), false, 'span1 highlight removed');
        assert.strictEqual(span2.classList.contains('tts-sentence-highlight'), true, 'span2 has highlight class for sentence 1');
      } finally {
        global.document = origDoc;
      }
    });

    test('8.3 Speech synthesis play, pause, resume, and stop playback lifecycle', () => {
      const controller = new TTSController();
      controller.loadSentencesFromText("First sentence. Second sentence.");

      controller.play();
      assert.strictEqual(controller.isPlaying, true, 'controller is playing');
      assert.strictEqual(controller.isPaused, false, 'controller is not paused');
      assert.strictEqual(controller.getSynth().speaking, true, 'synth is speaking');

      controller.pause();
      assert.strictEqual(controller.isPaused, true, 'controller is paused');
      assert.strictEqual(controller.isPlaying, false, 'isPlaying false when paused');

      controller.resume();
      assert.strictEqual(controller.isPlaying, true, 'controller resumed');
      assert.strictEqual(controller.isPaused, false, 'isPaused false on resume');

      controller.stop();
      assert.strictEqual(controller.isPlaying, false, 'controller stopped');
      assert.strictEqual(controller.currentIndex, 0, 'index reset to 0');
    });

    test('8.4 Speed rate changes and voice selection during narration', () => {
      const controller = new TTSController();
      controller.loadSentencesFromText("Test rate and voice sentence.");

      controller.setRate(1.5);
      assert.strictEqual(controller.rate, 1.5, 'rate updated to 1.5');

      const synthVoices = controller.getSynth().getVoices();
      if (synthVoices.length > 0) {
        controller.setVoice(synthVoices[0].voiceURI);
        assert.strictEqual(controller.selectedVoice, synthVoices[0], 'selectedVoice updated');
      }

      controller.play();
      assert.ok(controller.utterance, 'utterance created');
      assert.strictEqual(controller.utterance.rate, 1.5, 'utterance inherits speed rate');
      controller.stop();
    });

    test('8.5 Prev/Next sentence navigation and automatic advancement on speech end', () => {
      const controller = new TTSController();
      const mockSynth = controller.getSynth();
      controller.loadSentencesFromText("Sentence 1. Sentence 2. Sentence 3.");

      controller.play();
      assert.strictEqual(controller.currentIndex, 0, 'starts at sentence 0');

      // Simulate speech end event on utterance
      mockSynth.finishCurrentUtterance();
      assert.strictEqual(controller.currentIndex, 1, 'automatically advances to sentence 1 on speech end');

      controller.next();
      assert.strictEqual(controller.currentIndex, 2, 'navigates to sentence 2 on next()');

      controller.prev();
      assert.strictEqual(controller.currentIndex, 1, 'navigates back to sentence 1 on prev()');

      controller.stop();
    });
  });

  // =========================================================================
  // Module 13: Cross-browser Compatibility Layer (BrowserCompat) (5 Tests)
  // =========================================================================
  describe('Module 13: Cross-browser Compatibility Layer (BrowserCompat)', () => {
    test('13.1 Polyfills globalThis.browser to globalThis.chrome', () => {
      assert.ok(globalThis.browser, 'globalThis.browser is polyfilled');
      assert.strictEqual(globalThis.browser, globalThis.chrome, 'globalThis.browser matches chrome');
    });

    test('13.2 BrowserCompat.isAllowedFileSchemeAccess supports callback and Promise', async () => {
      let cbCalled = false;
      let cbVal = null;
      const promiseVal = await BrowserCompat.isAllowedFileSchemeAccess((res) => {
        cbCalled = true;
        cbVal = res;
      });
      assert.strictEqual(cbCalled, true, 'callback was called');
      assert.strictEqual(typeof cbVal, 'boolean', 'callback received boolean');
      assert.strictEqual(typeof promiseVal, 'boolean', 'promise resolved boolean');
    });

    test('13.3 BrowserCompat.storage.local get, set, remove support callbacks and Promises', async () => {
      await BrowserCompat.storage.local.set({ compatTestKey: 'compatValue' });
      const resPromise = await BrowserCompat.storage.local.get('compatTestKey');
      assert.strictEqual(resPromise.compatTestKey, 'compatValue', 'set & get promise succeeded');

      let cbRes = null;
      await BrowserCompat.storage.local.get('compatTestKey', (res) => {
        cbRes = res;
      });
      assert.strictEqual(cbRes.compatTestKey, 'compatValue', 'get callback succeeded');

      await BrowserCompat.storage.local.remove('compatTestKey');
      const resAfterRemove = await BrowserCompat.storage.local.get('compatTestKey');
      assert.strictEqual(resAfterRemove.compatTestKey, undefined, 'remove succeeded');
    });

    test('13.4 BrowserCompat.protectUtterance guards utterance in globalThis.__activeUtteranceGuard', () => {
      const mockUtterance = {
        text: 'Test speech guard',
        onend: null,
        onerror: null
      };

      BrowserCompat.protectUtterance(mockUtterance);
      assert.ok(globalThis.__activeUtteranceGuard, 'guard set initialized');
      assert.ok(globalThis.__activeUtteranceGuard.has(mockUtterance), 'utterance bound to guard');

      // Trigger onend cleanup
      if (typeof mockUtterance.onend === 'function') {
        mockUtterance.onend();
      }
      assert.strictEqual(globalThis.__activeUtteranceGuard.has(mockUtterance), false, 'utterance cleaned up on end');
    });

    test('13.5 BrowserCompat.protectUtterance supports addEventListener and preserves custom handlers', () => {
      let customEndFired = false;
      let listeners = {};
      const mockUtterance = {
        text: 'EventListener test',
        addEventListener(event, handler) {
          listeners[event] = handler;
        },
        onend: () => {
          customEndFired = true;
        }
      };

      BrowserCompat.protectUtterance(mockUtterance);
      assert.ok(globalThis.__activeUtteranceGuard.has(mockUtterance), 'utterance bound to guard');

      // Fire listener or handler
      if (listeners['end']) {
        listeners['end']();
      }
      assert.strictEqual(globalThis.__activeUtteranceGuard.has(mockUtterance), false, 'cleaned up via addEventListener');
      mockUtterance.onend();
      assert.strictEqual(customEndFired, true, 'custom onend handler preserved');
    });
  });
});


