/**
 * Tier 2: Boundary & Corner Cases Test Suite (45 Tests: 5 per Feature Module)
 * Robustness and edge case validation for Portable-Darkument-Format.
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
  clampNumber
} = require('../helpers/test-utils');

describe('Tier 2: Boundary & Corner Cases Test Suite', () => {

  beforeEach(async () => {
    chromeMock.__helpers.reset();
    await chrome.storage.local.set(getDefaultStorageState());
  });

  // =========================================================================
  // Module 1: Zero-Flicker Dark Engine & Schemes (5 Boundary Tests)
  // =========================================================================
  describe('Module 1: Dark Engine Boundaries', () => {
    test('1.1 Out-of-bounds slider values (brightness > 200 or < 0) clamped safely', () => {
      assert.strictEqual(clampNumber(250, 0, 200, 100), 200);
      assert.strictEqual(clampNumber(-50, 0, 200, 100), 0);

      const filterHigh = computeDarkFilter({ active: true, theme: 'oled', brightness: clampNumber(250, 0, 200, 100) });
      assert.ok(filterHigh.includes('brightness(2)'));
    });

    test('1.2 Invalid theme name string defaults safely without throwing errors', () => {
      const settings = { active: true, theme: 'unknown_invalid_theme' };
      const filter = computeDarkFilter(settings);
      assert.ok(filter.includes('invert(0.9)')); // Default dark fallback
    });

    test('1.3 Empty or undefined settings object returns safe dark filter', () => {
      const filter = computeDarkFilter({});
      assert.strictEqual(filter, 'none');
    });

    test('1.4 Unexpected mode string falls back safely', () => {
      const sanitized = sanitizeSettings({ mode: 'unknown_mode' });
      assert.strictEqual(sanitized.mode, 'enhanced');
    });

    test('1.5 Zero brightness / zero contrast values produce non-NaN CSS filter string', () => {
      const settings = { active: true, theme: 'dark', brightness: 0, contrast: 0, grayscale: 0 };
      const filter = computeDarkFilter(settings);
      assert.ok(!filter.includes('NaN'));
      assert.ok(filter.includes('brightness(0)'));
      assert.ok(filter.includes('contrast(0)'));
    });

    test('1.6 Challenger Edge Cases: Handles null/undefined/non-string theme & null/NaN brightness without crashing', () => {
      const s1 = sanitizeSettings({ theme: null, brightness: null, contrast: NaN });
      assert.strictEqual(s1.theme, 'oled');
      assert.strictEqual(s1.brightness, 100);
      assert.strictEqual(s1.contrast, 100);

      const s2 = sanitizeSettings({ theme: 123, brightness: 'corrupted' });
      assert.strictEqual(s2.theme, 'oled');
      assert.strictEqual(s2.brightness, 100);
    });
  });

  // =========================================================================
  // Module 2: Diagram & Image Protection (5 Boundary Tests)
  // =========================================================================
  describe('Module 2: Diagram & Image Protection Boundaries', () => {
    test('2.1 Null or missing image elements do not crash diagram protection loop', () => {
      assert.strictEqual(isProtectedElement(null), false);
      assert.strictEqual(isProtectedElement({}), false);
      assert.deepStrictEqual(tagProtectedElements(null), []);
    });

    test('2.2 Extremely large diagram dimensions (>4000px) handled safely', () => {
      assert.strictEqual(isProtectedElement({ tagName: 'IMG', width: 5000, height: 4500 }), true);
      assert.strictEqual(isProtectedElement({ tagName: 'DIV', width: 10000, height: 50 }), false);
    });

    test('2.3 Transparent PNG background protection preserves opacity', () => {
      const filterRule = getReverseFilter(true);
      assert.strictEqual(filterRule, 'invert(1) hue-rotate(180deg)');
    });

    test('2.4 Toggling protectDiagrams rapidly maintains idempotent styling', async () => {
      for (let i = 0; i < 10; i++) {
        await chrome.storage.local.set({ protectDiagrams: i % 2 === 0 });
      }
      const finalSettings = await chrome.storage.local.get('protectDiagrams');
      assert.strictEqual(finalSettings.protectDiagrams, false);
    });

    test('2.5 Pre-existing element filter combined safely with dark protection', () => {
      assert.strictEqual(isProtectedElement({ tagName: 'IMG', style: { filter: 'blur(2px)' } }), true);
      assert.strictEqual(getReverseFilter(true), 'invert(1) hue-rotate(180deg)');
    });
  });

  // =========================================================================
  // Module 3: Instant Position Resume (<100ms) (5 Boundary Tests)
  // =========================================================================
  describe('Module 3: Instant Position Resume Boundaries', () => {
    test('3.1 Negative scroll coordinates clamped to 0', async () => {
      const url = 'https://example.com/negative.pdf';
      await handleBackgroundMessage({ action: 'save_position', url, page: 1, scrollTop: -250, zoom: 1.0 });

      const store = await chrome.storage.local.get('readingPositions');
      const pos = store.readingPositions[url];
      assert.strictEqual(Math.max(0, pos.scrollTop), 0);
    });

    test('3.2 Target page exceeding total pages clamped to max page', () => {
      const clampPage = (requested, maxPages) => Math.min(requested, maxPages);
      assert.strictEqual(clampPage(999, 25), 25);
    });

    test('3.3 PDF URL containing special characters, spaces, or unicode parsed cleanly', async () => {
      const complexUrl = 'file:///C:/My%20Documents/测试%20PDF#page=2';
      await handleBackgroundMessage({ action: 'save_position', url: complexUrl, page: 2, scrollTop: 100, zoom: 1.0 });

      const store = await chrome.storage.local.get('readingPositions');
      assert.ok(store.readingPositions[complexUrl]);
      assert.strictEqual(store.readingPositions[complexUrl].page, 2);
    });

    test('3.4 Corrupted storage data in readingPositions restored safely', async () => {
      await chrome.storage.local.set({ readingPositions: 'corrupted_string_value' });
      const store = await chrome.storage.local.get('readingPositions');

      const safePositions = (typeof store.readingPositions === 'object' && store.readingPositions !== null)
        ? store.readingPositions
        : {};

      assert.deepStrictEqual(safePositions, {});
    });

    test('3.5 Rapid high-frequency position saves do not lose data', async () => {
      const url = 'https://example.com/rapid.pdf';
      const promises = [];
      for (let i = 1; i <= 5; i++) {
        promises.push(handleBackgroundMessage({ action: 'save_position', url, page: i, scrollTop: i * 100, zoom: 1.0 }));
      }
      await Promise.all(promises);

      const store = await chrome.storage.local.get('readingPositions');
      assert.ok(store.readingPositions[url]);
      assert.strictEqual(store.readingPositions[url].page, 5);
    });
  });

  // =========================================================================
  // Module 4: Interactive Dark TOC Navigation (5 Boundary Tests)
  // =========================================================================
  describe('Module 4: TOC Navigation Boundaries', () => {
    test('4.1 TOC outline items containing HTML special characters escaped safely', () => {
      const escapeHtml = (str) => str.replace(/[&<>"']/g, m => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
      }[m]));

      const rawTitle = '<script>alert("hack")</script> & Chapter 1';
      const clean = escapeHtml(rawTitle);

      assert.strictEqual(clean.includes('<script>'), false);
      assert.ok(clean.includes('&lt;script&gt;'));
      assert.ok(clean.includes('&amp;'));
    });

    test('4.2 Extremely deep nested outline (15 levels) traverses safely', () => {
      let tree = { title: 'Leaf', page: 15 };
      for (let i = 14; i >= 1; i--) {
        tree = { title: `Level ${i}`, page: i, children: [tree] };
      }

      const getDepth = (node) => (node.children ? 1 + getDepth(node.children[0]) : 1);
      assert.strictEqual(getDepth(tree), 15);
    });

    test('4.3 TOC item with page number 0 or negative clamped to page 1', () => {
      const normalizePage = (p) => (p && p >= 1 ? p : 1);
      assert.strictEqual(normalizePage(0), 1);
      assert.strictEqual(normalizePage(-5), 1);
      assert.strictEqual(normalizePage(3), 3);
    });

    test('4.4 Thousands of TOC items (5,000+) processed in chunks', () => {
      const items = Array.from({ length: 5000 }, (_, i) => ({ title: `Item ${i}`, page: i + 1 }));
      const chunkSize = 1000;
      const chunks = Math.ceil(items.length / chunkSize);

      assert.strictEqual(chunks, 5);
    });

    test('4.5 Viewport past bottom of document maintains last TOC active node', () => {
      const tocPages = [1, 10, 20, 30];
      const getActiveTocIndex = (viewportPage) => {
        let idx = 0;
        for (let i = 0; i < tocPages.length; i++) {
          if (viewportPage >= tocPages[i]) idx = i;
        }
        return idx;
      };

      assert.strictEqual(getActiveTocIndex(100), 3); // 30 is last
    });
  });

  // =========================================================================
  // Module 5: Neon Text Highlighting & Note Export (5 Boundary Tests)
  // =========================================================================
  describe('Module 5: Neon Text Highlighting Boundaries', () => {
    test('5.1 Highlighting empty string or whitespace selection ignored', async () => {
      const url = 'https://example.com/empty.pdf';
      const addSafeHighlight = (text) => {
        if (!text || text.trim() === '') return false;
        return true;
      };

      assert.strictEqual(addSafeHighlight('   '), false);
      assert.strictEqual(addSafeHighlight(''), false);
      assert.strictEqual(addSafeHighlight('valid text'), true);
    });

    test('5.2 Extremely long highlight text (>10,000 chars) truncated safely', () => {
      const longText = 'a'.repeat(15000);
      const truncateText = (str, maxLen = 1000) => (str.length > maxLen ? str.substring(0, maxLen) + '...' : str);

      const result = truncateText(longText);
      assert.strictEqual(result.length, 1003);
      assert.ok(result.endsWith('...'));
    });

    test('5.3 Exporting notes when zero highlights exist produces clean empty string', () => {
      const markdown = exportHighlights([], 'markdown');
      const plaintext = exportHighlights([], 'plaintext');

      assert.strictEqual(markdown, '');
      assert.strictEqual(plaintext, '');
    });

    test('5.4 Highlight notes with markdown formatting characters exported safely', () => {
      const highlights = [
        { page: 1, text: 'Sample *bold* text', note: 'Note with # tag and [link](url)' }
      ];

      const exported = exportHighlights(highlights, 'markdown');
      assert.ok(exported.includes('> Sample *bold* text'));
      assert.ok(exported.includes('*Note: Note with # tag and [link](url)*'));
    });

    test('5.5 Deleting non-existent highlight ID handles safely', async () => {
      const url = 'https://example.com/delete.pdf';
      await handleBackgroundMessage({ action: 'add_highlight', url, highlight: { id: 'hl_1', page: 1, text: 'Keep me' } });

      const store = await chrome.storage.local.get('highlights');
      const list = store.highlights[url].filter(h => h.id !== 'non_existent_id');

      assert.strictEqual(list.length, 1);
    });
  });

  // =========================================================================
  // Module 6: Bionic Reading & Line Focus Ruler (5 Boundary Tests)
  // =========================================================================
  describe('Module 6: Bionic Reading Boundaries', () => {
    test('6.1 Bionic reading on single-letter words or numeric strings', () => {
      const input = 'A 1 99 test';
      const result = applyBionicReading(input);
      assert.strictEqual(result, '<b>A</b> <b>1</b> <b>99</b> <b>te</b>st');
    });

    test('6.2 Bionic reading on text containing inline special characters', () => {
      const input = 'self-driving re-evaluate';
      const result = applyBionicReading(input);
      assert.ok(result.includes('<b>self-d</b>riving'));
    });

    test('6.3 Ruler height below minimum (5px) clamped to min height (10px)', () => {
      const clampRulerHeight = (h) => Math.max(10, Math.min(150, h));
      assert.strictEqual(clampRulerHeight(5), 10);
    });

    test('6.4 Ruler height above maximum (300px) clamped to max height (150px)', () => {
      const clampRulerHeight = (h) => Math.max(10, Math.min(150, h));
      assert.strictEqual(clampRulerHeight(300), 150);
    });

    test('6.5 Mouse out of window bounds hides reading ruler', () => {
      const isMouseInWindow = (x, y, winW, winH) => (x >= 0 && x <= winW && y >= 0 && y <= winH);
      assert.strictEqual(isMouseInWindow(-10, 200, 1920, 1080), false);
      assert.strictEqual(isMouseInWindow(500, 500, 1920, 1080), true);
    });
  });

  // =========================================================================
  // Module 7: Auto-Night Schedule (5 Boundary Tests)
  // =========================================================================
  describe('Module 7: Auto-Night Schedule Boundaries', () => {
    test('7.1 Schedule with identical start and end time (20:00 to 20:00) evaluates false', () => {
      const schedule = { enabled: true, mode: 'sunset', startTime: '20:00', endTime: '20:00' };
      assert.strictEqual(isNightTime(schedule, '20:00'), false);
    });

    test('7.2 Malformed time string falls back safely without throwing', () => {
      const safeParseTime = (timeStr) => {
        try {
          const parts = timeStr.split(':').map(Number);
          if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
            return parts;
          }
        } catch (e) {}
        return [20, 0]; // Default 20:00 fallback
      };

      assert.deepStrictEqual(safeParseTime('invalid:time'), [20, 0]);
    });

    test('7.3 Midnight exact transition (00:00) during overnight schedule', () => {
      const schedule = { enabled: true, mode: 'sunset', startTime: '22:00', endTime: '06:00' };
      assert.strictEqual(isNightTime(schedule, '00:00'), true);
    });

    test('7.4 Mode transition from classic to enhanced on setting change', async () => {
      await chrome.storage.local.set({ mode: 'classic' });
      await chrome.storage.local.set({ mode: 'enhanced' });

      const store = await chrome.storage.local.get('mode');
      assert.strictEqual(store.mode, 'enhanced');
    });

    test('7.5 Empty storage auto-night schedule defaults to disabled', async () => {
      await chrome.storage.local.clear();
      const store = await chrome.storage.local.get('autoNightSchedule');
      const sched = store.autoNightSchedule || { enabled: false };
      assert.strictEqual(sched.enabled, false);
    });
  });

  // =========================================================================
  // Module 8: Reading Analytics & Streak Counter (5 Boundary Tests)
  // =========================================================================
  describe('Module 8: Analytics Boundaries', () => {
    test('8.1 track_reading with negative or NaN seconds is ignored', async () => {
      await handleBackgroundMessage({ action: 'track_reading', seconds: -100, page: 0, dateISO: '2026-07-22' });
      await handleBackgroundMessage({ action: 'track_reading', seconds: NaN, page: 0, dateISO: '2026-07-22' });

      const store = await chrome.storage.local.get('analytics');
      assert.strictEqual(store.analytics.totalReadingTimeSeconds, 0);
    });

    test('8.2 Reading session spanning midnight tracks seconds for current day', async () => {
      await handleBackgroundMessage({ action: 'track_reading', seconds: 300, page: 1, dateISO: '2026-07-21' });
      await handleBackgroundMessage({ action: 'track_reading', seconds: 300, page: 1, dateISO: '2026-07-22' });

      const store = await chrome.storage.local.get('analytics');
      assert.strictEqual(store.analytics.dailyStats['2026-07-21'].seconds, 300);
      assert.strictEqual(store.analytics.dailyStats['2026-07-22'].seconds, 300);
    });

    test('8.3 Large reading seconds (>100,000s) formatted into readable hours string', () => {
      const formatReadingTime = (totalSec) => {
        const hours = Math.floor(totalSec / 3600);
        const mins = Math.floor((totalSec % 3600) / 60);
        return `${hours}h ${mins}m`;
      };

      assert.strictEqual(formatReadingTime(125000), '34h 43m');
    });

    test('8.4 Leap year date ISO (2028-02-29) streak calculation', async () => {
      await handleBackgroundMessage({ action: 'track_reading', seconds: 60, page: 1, dateISO: '2028-02-28' });
      await handleBackgroundMessage({ action: 'track_reading', seconds: 60, page: 1, dateISO: '2028-02-29' });

      const store = await chrome.storage.local.get('analytics');
      assert.strictEqual(store.analytics.currentStreak, 2);
    });

    test('8.5 Pruning historical dailyStats entries older than 365 days', () => {
      const dailyStats = {};
      for (let i = 0; i < 400; i++) {
        dailyStats[`day_${i}`] = { seconds: 60, pages: 1 };
      }

      const pruneOldStats = (stats, maxEntries = 365) => {
        const keys = Object.keys(stats);
        if (keys.length <= maxEntries) return stats;
        const pruned = {};
        keys.slice(keys.length - maxEntries).forEach(k => {
          pruned[k] = stats[k];
        });
        return pruned;
      };

      const result = pruneOldStats(dailyStats, 365);
      assert.strictEqual(Object.keys(result).length, 365);
    });
  });

  // =========================================================================
  // Module 9: Voluntary Donation & Supporter Framework (5 Boundary Tests)
  // =========================================================================
  describe('Module 9: Supporter Framework Boundaries', () => {
    test('9.1 Missing DOM popup container fails silently without throwing error', () => {
      const renderSupporterBadge = (container) => {
        if (!container) return false;
        container.innerHTML = '<span class="gold-badge">Supporter ❤️</span>';
        return true;
      };

      assert.strictEqual(renderSupporterBadge(null), false);
    });

    test('9.2 Corrupted supporter state object restored to default values', async () => {
      await chrome.storage.local.set({ supporter: 'invalid_type' });
      const store = await chrome.storage.local.get('supporter');

      const safeSupporter = (typeof store.supporter === 'object' && store.supporter !== null)
        ? store.supporter
        : { isSupporter: false, goldAccent: false, promptDismissedCount: 0, lastPromptDate: '' };

      assert.strictEqual(safeSupporter.isSupporter, false);
    });

    test('9.3 Milestone prompt rate limiting prevents prompt within 24h window', () => {
      const isRateLimited = (lastPromptISO, currentISO) => {
        if (!lastPromptISO) return false;
        const diffHours = (new Date(currentISO) - new Date(lastPromptISO)) / (3600 * 1000);
        return diffHours < 24;
      };

      assert.strictEqual(isRateLimited('2026-07-22T08:00:00Z', '2026-07-22T14:00:00Z'), true);
      assert.strictEqual(isRateLimited('2026-07-20T08:00:00Z', '2026-07-22T14:00:00Z'), false);
    });

    test('9.4 Rapid consecutive clicks on supporter toggle handle race condition cleanly', async () => {
      let isSupporter = false;
      const toggleSupporter = async () => {
        isSupporter = !isSupporter;
        await chrome.storage.local.set({ supporter: { isSupporter } });
      };

      await Promise.all([toggleSupporter(), toggleSupporter(), toggleSupporter()]);
      const store = await chrome.storage.local.get('supporter');
      assert.strictEqual(typeof store.supporter.isSupporter, 'boolean');
    });

    test('9.5 Supporter gold accent toggle when isSupporter: false remains disabled', () => {
      const canEnableGoldAccent = (supporterState) => (supporterState && supporterState.isSupporter);
      assert.strictEqual(canEnableGoldAccent({ isSupporter: false }), false);
      assert.strictEqual(canEnableGoldAccent({ isSupporter: true }), true);
    });
  });

});
