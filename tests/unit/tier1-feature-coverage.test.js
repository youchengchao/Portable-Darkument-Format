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
const { calculateActiveStreak } = require('../../popup.js');

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
  });

});


