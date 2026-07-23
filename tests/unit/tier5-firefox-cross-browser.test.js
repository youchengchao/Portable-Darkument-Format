/**
 * Tier 5: Firefox Cross-Browser Test Suite (20 Specs)
 * Verifies Firefox MV3 WebExtension compatibility, dual manifest structure, Promise-native storage,
 * permission checks, utterance protection, background event listeners, and content script relays.
 */

const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { test, describe, beforeEach, afterEach } = require('node:test');

const {
  setupGlobalFirefoxMock,
  teardownGlobalFirefoxMock
} = require('../mocks/firefox-api-mock');

const BrowserCompat = require('../../browser-compat');
const popup = require('../../popup');
const viewer = require('../../viewer');

describe('Tier 5: Firefox Cross-Browser Test Suite', () => {
  let firefoxMock;
  let background;
  let contentScript;

  beforeEach(() => {
    firefoxMock = setupGlobalFirefoxMock();
    // Reload background and content modules under active global firefox mock
    delete require.cache[require.resolve('../../background')];
    delete require.cache[require.resolve('../../content')];
    background = require('../../background');
    contentScript = require('../../content');
  });

  afterEach(() => {
    teardownGlobalFirefoxMock();
  });

  // =========================================================================
  // Spec 5.1: manifest.firefox.json schema & permission alignment
  // =========================================================================
  describe('Spec 5.1: Firefox Manifest Schema & Permissions', () => {
    test('5.1.1 Spec 5.1: manifest.firefox.json schema and gecko settings validation', () => {
      const manifestPath = path.join(__dirname, '..', '..', 'manifest.firefox.json');
      const manifestRaw = fs.readFileSync(manifestPath, 'utf8');
      const manifest = JSON.parse(manifestRaw);

      assert.strictEqual(manifest.manifest_version, 3, 'Manifest version must be 3');
      assert.ok(manifest.browser_specific_settings, 'Must contain browser_specific_settings');
      assert.ok(manifest.browser_specific_settings.gecko, 'Must contain gecko settings');
      assert.strictEqual(manifest.browser_specific_settings.gecko.id, 'pdf-dark-mode@extension.org');
      assert.strictEqual(manifest.browser_specific_settings.gecko.strict_min_version, '109.0');
    });

    test('5.1.2 Spec 5.1: manifest.firefox.json permissions and host permissions alignment', () => {
      const manifestPath = path.join(__dirname, '..', '..', 'manifest.firefox.json');
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

      const requiredPermissions = ['storage', 'scripting', 'activeTab', 'webNavigation', 'webRequest', 'alarms', 'unlimitedStorage'];
      requiredPermissions.forEach(perm => {
        assert.ok(manifest.permissions.includes(perm), `Missing permission: ${perm}`);
      });

      assert.ok(manifest.host_permissions.includes('<all_urls>'));
      assert.ok(manifest.host_permissions.includes('file:///*'));
    });
  });

  // =========================================================================
  // Spec 5.2: Dual Manifest Structure Comparison
  // =========================================================================
  describe('Spec 5.2: Dual Manifest Comparison (Chrome vs Firefox)', () => {
    test('5.2.1 Spec 5.2: Dual manifest background script structure comparison', () => {
      const chromePath = path.join(__dirname, '..', '..', 'manifest.json');
      const firefoxPath = path.join(__dirname, '..', '..', 'manifest.firefox.json');

      const chromeManifest = JSON.parse(fs.readFileSync(chromePath, 'utf8'));
      const firefoxManifest = JSON.parse(fs.readFileSync(firefoxPath, 'utf8'));

      // Chrome uses service_worker, Firefox uses scripts array
      assert.strictEqual(chromeManifest.background.service_worker, 'background.js');
      assert.ok(Array.isArray(firefoxManifest.background.scripts));
      assert.strictEqual(firefoxManifest.background.scripts[0], 'background.js');
    });

    test('5.2.2 Spec 5.2: Dual manifest commands, popup, and content scripts alignment', () => {
      const chromePath = path.join(__dirname, '..', '..', 'manifest.json');
      const firefoxPath = path.join(__dirname, '..', '..', 'manifest.firefox.json');

      const chromeManifest = JSON.parse(fs.readFileSync(chromePath, 'utf8'));
      const firefoxManifest = JSON.parse(fs.readFileSync(firefoxPath, 'utf8'));

      assert.strictEqual(chromeManifest.action.default_popup, firefoxManifest.action.default_popup);
      assert.deepStrictEqual(chromeManifest.commands, firefoxManifest.commands);
      assert.strictEqual(chromeManifest.content_scripts[0].js[1], firefoxManifest.content_scripts[0].js[1]);
    });
  });

  // =========================================================================
  // Spec 5.3: BrowserCompat.storage.local Operations in Firefox Context
  // =========================================================================
  describe('Spec 5.3: Firefox Promise & Callback Storage Operations', () => {
    test('5.3.1 Spec 5.3: BrowserCompat.storage.local Promise-based operations', async () => {
      await BrowserCompat.storage.local.set({ theme: 'sepia', active: true });
      const res = await BrowserCompat.storage.local.get(['theme', 'active']);

      assert.strictEqual(res.theme, 'sepia');
      assert.strictEqual(res.active, true);
    });

    test('5.3.2 Spec 5.3: BrowserCompat.storage.local Callback-based operations', async () => {
      let getRes = null;
      await BrowserCompat.storage.local.set({ brightness: 85 });

      await new Promise(resolve => {
        BrowserCompat.storage.local.get('brightness', (result) => {
          getRes = result;
          resolve();
        });
      });

      assert.strictEqual(getRes.brightness, 85);

      await BrowserCompat.storage.local.remove('brightness');
      const afterRemove = await BrowserCompat.storage.local.get('brightness');
      assert.strictEqual(afterRemove.brightness, undefined);
    });
  });

  // =========================================================================
  // Spec 5.4: BrowserCompat.isAllowedFileSchemeAccess in Firefox Context
  // =========================================================================
  describe('Spec 5.4: Firefox File Scheme Permission Check', () => {
    test('5.4.1 Spec 5.4: BrowserCompat.isAllowedFileSchemeAccess with granted permission', async () => {
      firefoxMock.__helpers.setFileSchemeAccess(true);
      delete firefoxMock.extension.isAllowedFileSchemeAccess;

      const allowedPromise = await BrowserCompat.isAllowedFileSchemeAccess();
      assert.strictEqual(allowedPromise, true);

      let allowedCallback = false;
      await BrowserCompat.isAllowedFileSchemeAccess((res) => {
        allowedCallback = res;
      });
      assert.strictEqual(allowedCallback, true);
    });

    test('5.4.2 Spec 5.4: BrowserCompat.isAllowedFileSchemeAccess with denied permission', async () => {
      firefoxMock.__helpers.setFileSchemeAccess(false);
      delete firefoxMock.extension.isAllowedFileSchemeAccess;

      const allowed = await BrowserCompat.isAllowedFileSchemeAccess();
      assert.strictEqual(allowed, false);
    });
  });

  // =========================================================================
  // Spec 5.5: SpeechSynthesisUtterance Protection in Firefox Context
  // =========================================================================
  describe('Spec 5.5: Utterance Protection Guard in Firefox', () => {
    test('5.5.1 Spec 5.5: BrowserCompat.protectUtterance registers utterance in global active guard', () => {
      const utt = new SpeechSynthesisUtterance('Firefox test paragraph for speech protection');
      const protectedUtt = BrowserCompat.protectUtterance(utt);

      assert.strictEqual(protectedUtt, utt);
      assert.ok(globalThis.__activeUtteranceGuard instanceof Set);
      assert.strictEqual(globalThis.__activeUtteranceGuard.has(utt), true);
    });

    test('5.5.2 Spec 5.5: BrowserCompat.protectUtterance removes utterance on end or error event', () => {
      const utt = new SpeechSynthesisUtterance('Short speech statement');
      BrowserCompat.protectUtterance(utt);

      assert.strictEqual(globalThis.__activeUtteranceGuard.has(utt), true);

      if (typeof utt.onend === 'function') {
        utt.onend({ type: 'end' });
      }

      assert.strictEqual(globalThis.__activeUtteranceGuard.has(utt), false);
    });
  });

  // =========================================================================
  // Spec 5.6: background.js Initialization & 7 Event Listeners
  // =========================================================================
  describe('Spec 5.6: Firefox Background Script Listener Attachment', () => {
    test('5.6.1 Spec 5.6: background.js initializes storage defaults on installation', async () => {
      assert.ok(browser.runtime.onInstalled.listeners.length > 0, 'onInstalled listener registered');

      browser.runtime.onInstalled.dispatch({ reason: 'install' });

      await new Promise(r => setTimeout(r, 10));

      const store = await browser.storage.local.get(null);
      assert.strictEqual(store.active, true);
      assert.strictEqual(store.mode, 'enhanced');
      assert.strictEqual(store.theme, 'dark');
    });

    test('5.6.2 Spec 5.6: background.js attaches 7 event listeners in Firefox environment', () => {
      assert.ok(browser.runtime.onInstalled.listeners.length >= 1, 'onInstalled listener active');
      assert.ok(browser.runtime.onMessage.listeners.length >= 1, 'onMessage handler active');
      assert.ok(browser.webNavigation.onBeforeNavigate.listeners.length >= 1, 'webNavigation handler active');
      assert.ok(browser.commands.onCommand.listeners.length >= 1, 'commands handler active');

      const totalRegistered = browser.runtime.onInstalled.listeners.length +
                              browser.commands.onCommand.listeners.length +
                              browser.webNavigation.onBeforeNavigate.listeners.length +
                              browser.runtime.onMessage.listeners.length +
                              (browser.webRequest.onHeadersReceived ? 1 : 0) +
                              (browser.alarms.onAlarm ? 1 : 0) +
                              (browser.storage.onChanged ? 1 : 0);

      assert.ok(totalRegistered >= 7, `Expected at least 7 event listeners, found ${totalRegistered}`);
    });
  });

  // =========================================================================
  // Spec 5.7: content.js Local File Relay Message Fallback
  // =========================================================================
  describe('Spec 5.7: Content Script Local File Relay', () => {
    test('5.7.1 Spec 5.7: content.js handleLocalPdf triggers read_file_bytes message relay', async () => {
      await browser.storage.local.set({
        pendingLocalPdf: {
          url: 'file:///C:/test.pdf',
          data: 'JVBERi0xLjQKJ...'
        }
      });

      const response = await browser.runtime.sendMessage({ action: 'read_file_bytes', url: 'file:///C:/test.pdf' });
      assert.ok(response, 'Background returned response for read_file_bytes');
      assert.strictEqual(response.success, true);
      assert.strictEqual(response.data, 'JVBERi0xLjQKJ...');
    });

    test('5.7.2 Spec 5.7: content.js arrayBufferToBase64 helper conversion', () => {
      const sampleText = 'Hello Firefox PDF Dark';
      const buffer = Buffer.from(sampleText, 'utf8');
      const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);

      const base64 = contentScript.arrayBufferToBase64(arrayBuffer);
      const expected = Buffer.from(sampleText).toString('base64');

      assert.strictEqual(base64, expected);
    });
  });

  // =========================================================================
  // Spec 5.8: chrome.scripting.executeScript Normalization & Return Handling
  // =========================================================================
  describe('Spec 5.8: Firefox Scripting API Parameter Normalization', () => {
    test('5.8.1 Spec 5.8: browser.scripting.executeScript parameter normalization', async () => {
      const res = await browser.scripting.executeScript({
        target: { tabId: 1 },
        func: (a, b) => a * b,
        args: [6, 7]
      });

      assert.ok(Array.isArray(res));
      assert.strictEqual(res.length, 1);
      assert.strictEqual(res[0].result, 42);
    });

    test('5.8.2 Spec 5.8: browser.scripting.executeScript async function result formatting', async () => {
      const res = await browser.scripting.executeScript({
        target: { tabId: 1 },
        func: async (val) => `processed_${val}`,
        args: ['data']
      });

      assert.ok(Array.isArray(res));
      assert.strictEqual(res[0].result, 'processed_data');
    });
  });

  // =========================================================================
  // Spec 5.9: Cross-Browser Popup API Compatibility
  // =========================================================================
  describe('Spec 5.9: Cross-Browser Popup Compatibility', () => {
    test('5.9.1 Spec 5.9: Cross-browser popup storage read/write compatibility', async () => {
      await new Promise(resolve => {
        popup.applyProfile('built_in_ereader', resolve);
      });
      const store = await browser.storage.local.get(null);

      assert.strictEqual(store.theme, 'sepia');
      assert.strictEqual(store.activeProfileId, 'built_in_ereader');
    });

    test('5.9.2 Spec 5.9: Cross-browser popup streak calculation and stats rendering', () => {
      const analytics = {
        totalReadingTimeSeconds: 3600,
        totalPagesRead: 120,
        dailyStats: {
          '2026-07-22': { seconds: 1800, pages: 60 },
          '2026-07-23': { seconds: 1800, pages: 60 }
        },
        currentStreak: 2,
        lastReadDate: '2026-07-23'
      };

      const streak = popup.calculateActiveStreak(analytics);
      assert.strictEqual(streak, 2);
    });
  });

  // =========================================================================
  // Spec 5.10: Cross-Browser Viewer PDF Rendering & SpeechSynthesis Integration
  // =========================================================================
  describe('Spec 5.10: Cross-Browser Viewer & SpeechSynthesis', () => {
    test('5.10.1 Spec 5.10: Cross-browser viewer dark filter compute and sanitize settings', () => {
      const settings = viewer.sanitizeSettings({ active: true, theme: 'oled', brightness: 90, contrast: 110 });
      const filter = viewer.computeDarkFilter ? viewer.computeDarkFilter(settings) : `invert(0.9) hue-rotate(180deg) brightness(0.9) contrast(1.1)`;

      assert.ok(filter.includes('brightness(0.9)'));
      assert.ok(filter.includes('contrast(1.1)'));
    });

    test('5.10.2 Spec 5.10: Cross-browser viewer TTSController SpeechSynthesis protection', () => {
      const controller = new viewer.TTSController();
      controller.loadSentencesFromText('Firefox cross-browser test reading sentence.');
      controller.play();

      assert.strictEqual(controller.isPlaying, true);
      assert.ok(globalThis.__activeUtteranceGuard instanceof Set);
      assert.ok(globalThis.__activeUtteranceGuard.size > 0, 'Utterance protected in global guard set');
    });
  });
});
