/**
 * EMPIRICAL STRESS TEST HARNESS FOR MILESTONE 2-1 (BROWSER COMPAT & FILE RELAY)
 * 
 * Scope:
 * 1. BrowserCompat.storage.local (callbacks & Promises, high concurrency, errors)
 * 2. BrowserCompat.isAllowedFileSchemeAccess (Chrome vs Firefox MV3 mock contexts)
 * 3. BrowserCompat.protectUtterance (rapid utterance generation, GC protection, cleanup)
 * 4. Local file fetch relay handling (content.js & background.js, large buffer chunking, fallbacks)
 */

const assert = require('assert');
const BrowserCompat = require('../browser-compat.js');
const content = require('../content.js');
const background = require('../background.js');

let totalTests = 0;
let passedTests = 0;

function test(name, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`  [PASS] ${name}`);
  } catch (err) {
    console.error(`  [FAIL] ${name}`);
    console.error(`         ${err.stack || err.message}`);
  }
}

async function asyncTest(name, fn) {
  totalTests++;
  try {
    await fn();
    passedTests++;
    console.log(`  [PASS] ${name}`);
  } catch (err) {
    console.error(`  [FAIL] ${name}`);
    console.error(`         ${err.stack || err.message}`);
  }
}

// Reset global mocks before each test block
function resetGlobalScope() {
  delete global.chrome;
  delete global.browser;
  delete global.__activeUtteranceGuard;
}

console.log('=================================================================');
console.log('       EMPIRICAL STRESS TEST HARNESS: M2-1 COMPAT & RELAY        ');
console.log('=================================================================\n');

(async function main() {

  // ===========================================================================
  // VECTOR 1: BrowserCompat.storage.local Stress Tests
  // ===========================================================================
  console.log('--- VECTOR 1: BrowserCompat.storage.local Stress Tests ---');

  await asyncTest('1.1 Storage get/set/remove with Callback pattern', async () => {
    resetGlobalScope();
    const mockStore = { theme: 'dark', brightness: 90 };
    global.chrome = {
      runtime: {},
      storage: {
        local: {
          get: (keys, cb) => cb({ theme: mockStore.theme }),
          set: (items, cb) => { Object.assign(mockStore, items); cb(); },
          remove: (keys, cb) => { delete mockStore.theme; cb(); }
        }
      }
    };

    let cbGetResult = null;
    await BrowserCompat.storage.local.get(['theme'], (res) => { cbGetResult = res; });
    assert.deepStrictEqual(cbGetResult, { theme: 'dark' });

    let cbSetCalled = false;
    await BrowserCompat.storage.local.set({ theme: 'oled' }, () => { cbSetCalled = true; });
    assert.strictEqual(cbSetCalled, true);
    assert.strictEqual(mockStore.theme, 'oled');

    let cbRemoveCalled = false;
    await BrowserCompat.storage.local.remove('theme', () => { cbRemoveCalled = true; });
    assert.strictEqual(cbRemoveCalled, true);
    assert.strictEqual(mockStore.theme, undefined);
  });

  await asyncTest('1.2 Storage get/set/remove with Promise pattern', async () => {
    resetGlobalScope();
    const mockStore = { theme: 'slate' };
    global.chrome = {
      runtime: {},
      storage: {
        local: {
          get: (keys, cb) => cb(mockStore),
          set: (items, cb) => { Object.assign(mockStore, items); cb(); },
          remove: (keys, cb) => { delete mockStore.theme; cb(); }
        }
      }
    };

    const res = await BrowserCompat.storage.local.get(null);
    assert.deepStrictEqual(res, { theme: 'slate' });

    await BrowserCompat.storage.local.set({ active: true });
    assert.strictEqual(mockStore.active, true);

    await BrowserCompat.storage.local.remove(['theme']);
    assert.strictEqual(mockStore.theme, undefined);
  });

  await asyncTest('1.3 Dual Callback + Promise usage in single call (no double invocation)', async () => {
    resetGlobalScope();
    global.chrome = {
      runtime: {},
      storage: {
        local: {
          get: (keys, cb) => cb({ test: 123 })
        }
      }
    };

    let callbackCount = 0;
    let callbackData = null;
    const promiseData = await BrowserCompat.storage.local.get('test', (res) => {
      callbackCount++;
      callbackData = res;
    });

    assert.strictEqual(callbackCount, 1, 'Callback should be called exactly once');
    assert.deepStrictEqual(callbackData, { test: 123 });
    assert.deepStrictEqual(promiseData, { test: 123 });
  });

  await asyncTest('1.4 Error handling when runtime.lastError is set', async () => {
    resetGlobalScope();
    global.chrome = {
      runtime: { lastError: { message: 'Quota exceeded' } },
      storage: {
        local: {
          get: (keys, cb) => cb(null),
          set: (items, cb) => cb()
        }
      }
    };

    let cbArg = 'not-called';
    let rejectedError = null;

    try {
      await BrowserCompat.storage.local.get('foo', (res) => { cbArg = res; });
    } catch (err) {
      rejectedError = err;
    }

    assert.strictEqual(cbArg, null, 'Callback receives null on error');
    assert.ok(rejectedError, 'Promise should reject on storage error');
    assert.strictEqual(rejectedError.message, 'Quota exceeded');
  });

  await asyncTest('1.5 Storage get with callback as first parameter', async () => {
    resetGlobalScope();
    global.chrome = {
      runtime: {},
      storage: {
        local: {
          get: (keys, cb) => cb({ all: 'data' })
        }
      }
    };

    let result = null;
    await BrowserCompat.storage.local.get((res) => {
      result = res;
    });
    assert.deepStrictEqual(result, { all: 'data' });
  });

  await asyncTest('1.6 High Concurrency: 1,000 rapid concurrent storage calls', async () => {
    resetGlobalScope();
    let getCount = 0;
    global.chrome = {
      runtime: {},
      storage: {
        local: {
          get: (keys, cb) => { getCount++; cb({ count: getCount }); }
        }
      }
    };

    const promises = [];
    for (let i = 0; i < 1000; i++) {
      promises.push(BrowserCompat.storage.local.get(`key_${i}`));
    }

    const results = await Promise.all(promises);
    assert.strictEqual(results.length, 1000);
    assert.strictEqual(getCount, 1000);
  });

  await asyncTest('1.7 Missing storage API fallback (returns empty object/success gracefully)', async () => {
    resetGlobalScope(); // No chrome or browser storage
    const getRes = await BrowserCompat.storage.local.get('anything');
    assert.deepStrictEqual(getRes, {});

    await assert.doesNotReject(async () => {
      await BrowserCompat.storage.local.set({ key: 'val' });
      await BrowserCompat.storage.local.remove('key');
    });
  });

  await asyncTest('1.8 Firefox Promise-returning storage API mock', async () => {
    resetGlobalScope();
    global.browser = {
      runtime: {},
      storage: {
        local: {
          get: (keys) => Promise.resolve({ firefoxKey: 'ffValue' }),
          set: (items) => Promise.resolve(),
          remove: (keys) => Promise.resolve()
        }
      }
    };

    const res = await BrowserCompat.storage.local.get('firefoxKey');
    assert.deepStrictEqual(res, { firefoxKey: 'ffValue' });

    await assert.doesNotReject(async () => {
      await BrowserCompat.storage.local.set({ a: 1 });
      await BrowserCompat.storage.local.remove('a');
    });
  });


  // ===========================================================================
  // VECTOR 2: BrowserCompat.isAllowedFileSchemeAccess Stress Tests
  // ===========================================================================
  console.log('\n--- VECTOR 2: BrowserCompat.isAllowedFileSchemeAccess Stress Tests ---');

  await asyncTest('2.1 Chrome MV3 Context (chrome.extension.isAllowedFileSchemeAccess callback)', async () => {
    resetGlobalScope();
    global.chrome = {
      extension: {
        isAllowedFileSchemeAccess: (cb) => cb(true)
      }
    };

    let cbResult = null;
    const pResult = await BrowserCompat.isAllowedFileSchemeAccess((res) => { cbResult = res; });
    assert.strictEqual(cbResult, true);
    assert.strictEqual(pResult, true);

    // Test false case
    global.chrome.extension.isAllowedFileSchemeAccess = (cb) => cb(false);
    const falseResult = await BrowserCompat.isAllowedFileSchemeAccess();
    assert.strictEqual(falseResult, false);
  });

  await asyncTest('2.2 Chrome MV3 Context returning Promise from extension.isAllowedFileSchemeAccess', async () => {
    resetGlobalScope();
    global.chrome = {
      extension: {
        isAllowedFileSchemeAccess: () => Promise.resolve(true)
      }
    };

    const res = await BrowserCompat.isAllowedFileSchemeAccess();
    assert.strictEqual(res, true);
  });

  await asyncTest('2.3 Firefox MV3 Context (browser.permissions.contains Promise style)', async () => {
    resetGlobalScope();
    global.browser = {
      permissions: {
        contains: (permObj) => {
          assert.deepStrictEqual(permObj, { permissions: ['file:///*'] });
          return Promise.resolve(true);
        }
      }
    };

    const res = await BrowserCompat.isAllowedFileSchemeAccess();
    assert.strictEqual(res, true);

    // Test false return
    global.browser.permissions.contains = () => Promise.resolve(false);
    const resFalse = await BrowserCompat.isAllowedFileSchemeAccess();
    assert.strictEqual(resFalse, false);
  });

  await asyncTest('2.4 Firefox MV3 Context (browser.permissions.contains callback style)', async () => {
    resetGlobalScope();
    global.browser = {
      permissions: {
        contains: (permObj, cb) => cb(true)
      }
    };

    const res = await BrowserCompat.isAllowedFileSchemeAccess();
    assert.strictEqual(res, true);
  });

  await asyncTest('2.5 Fallback Context (No Extension API present)', async () => {
    resetGlobalScope();
    const res = await BrowserCompat.isAllowedFileSchemeAccess();
    assert.strictEqual(res, true, 'Default fallback should be true');
  });

  await asyncTest('2.6 Error robustness: API throws synchronous error or rejects', async () => {
    resetGlobalScope();
    global.chrome = {
      extension: {
        isAllowedFileSchemeAccess: () => { throw new Error('API restricted'); }
      }
    };

    const res1 = await BrowserCompat.isAllowedFileSchemeAccess();
    assert.strictEqual(res1, true, 'Should fallback to true on error');

    global.browser = {
      permissions: {
        contains: () => Promise.reject(new Error('Permission denied'))
      }
    };
    delete global.chrome;

    const res2 = await BrowserCompat.isAllowedFileSchemeAccess();
    assert.strictEqual(res2, true, 'Should fallback to true on promise rejection');
  });

  await asyncTest('2.7 High Load: 1,000 rapid concurrent calls to isAllowedFileSchemeAccess', async () => {
    resetGlobalScope();
    let callCount = 0;
    global.chrome = {
      extension: {
        isAllowedFileSchemeAccess: (cb) => { callCount++; cb(true); }
      }
    };

    const promises = [];
    for (let i = 0; i < 1000; i++) {
      promises.push(BrowserCompat.isAllowedFileSchemeAccess());
    }

    const results = await Promise.all(promises);
    assert.strictEqual(results.length, 1000);
    assert.strictEqual(results.every(r => r === true), true);
    assert.strictEqual(callCount, 1000);
  });

  await asyncTest('2.8 User callback throwing error does not crash or unhandle rejection', async () => {
    resetGlobalScope();
    global.chrome = {
      extension: {
        isAllowedFileSchemeAccess: (cb) => cb(true)
      }
    };

    const res = await BrowserCompat.isAllowedFileSchemeAccess(() => {
      throw new Error('User callback crash');
    });
    assert.strictEqual(res, true);
  });


  // ===========================================================================
  // VECTOR 3: BrowserCompat.protectUtterance Stress Tests
  // ===========================================================================
  console.log('\n--- VECTOR 3: BrowserCompat.protectUtterance Stress Tests ---');

  test('3.1 Basic Utterance protection & Set guard addition', () => {
    resetGlobalScope();
    const mockUtterance = { text: 'Hello world' };
    const protectedUtterance = BrowserCompat.protectUtterance(mockUtterance);

    assert.strictEqual(protectedUtterance, mockUtterance);
    assert.ok(global.__activeUtteranceGuard instanceof Set);
    assert.strictEqual(global.__activeUtteranceGuard.has(mockUtterance), true);
  });

  test('3.2 Event listener addEventListener cleanup on "end" and "error"', () => {
    resetGlobalScope();
    const listeners = {};
    const mockUtterance = {
      text: 'Test Speech',
      addEventListener: (type, fn) => {
        listeners[type] = listeners[type] || [];
        listeners[type].push(fn);
      }
    };

    BrowserCompat.protectUtterance(mockUtterance);
    assert.ok(listeners['end'] && listeners['end'].length > 0);
    assert.ok(listeners['error'] && listeners['error'].length > 0);

    // Fire end listener
    listeners['end'].forEach(fn => fn());
    assert.strictEqual(global.__activeUtteranceGuard.has(mockUtterance), false, 'Removed on end event');
  });

  test('3.3 Property wrapping for onend and onerror setters & getters', () => {
    resetGlobalScope();
    let userEndFired = false;
    const mockUtterance = {
      text: 'Property Test',
      onend: null,
      onerror: null
    };

    BrowserCompat.protectUtterance(mockUtterance);

    // Assign user handler
    mockUtterance.onend = function () {
      userEndFired = true;
    };

    assert.strictEqual(global.__activeUtteranceGuard.has(mockUtterance), true);

    // Invoke property handler
    mockUtterance.onend();
    assert.strictEqual(userEndFired, true, 'User handler must be executed');
    assert.strictEqual(global.__activeUtteranceGuard.has(mockUtterance), false, 'Cleanup removes from Set');
  });

  test('3.4 Rapid Utterance Generation: 10,000 utterances protected & cleaned up', () => {
    resetGlobalScope();
    const utterances = [];
    for (let i = 0; i < 10000; i++) {
      const u = { id: i, text: `Sentence ${i}` };
      utterances.push(BrowserCompat.protectUtterance(u));
    }

    assert.strictEqual(global.__activeUtteranceGuard.size, 10000, 'Guard set size should be 10000');

    // Clean up half
    for (let i = 0; i < 5000; i++) {
      if (utterances[i].onend) {
        utterances[i].onend();
      } else {
        global.__activeUtteranceGuard.delete(utterances[i]);
      }
    }

    assert.strictEqual(global.__activeUtteranceGuard.size, 5000, 'Guard set size should decrease to 5000');
  });

  test('3.5 Double Cleanup Safety (firing end event + invoking onend handler)', () => {
    resetGlobalScope();
    const listeners = {};
    let userFiredCount = 0;
    const mockUtterance = {
      text: 'Double cleanup',
      addEventListener: (type, fn) => {
        listeners[type] = listeners[type] || [];
        listeners[type].push(fn);
      }
    };

    BrowserCompat.protectUtterance(mockUtterance);
    mockUtterance.onend = () => { userFiredCount++; };

    // Fire addEventListener end first
    listeners['end'].forEach(fn => fn());
    assert.strictEqual(global.__activeUtteranceGuard.has(mockUtterance), false);

    // Then invoke .onend()
    assert.doesNotThrow(() => {
      mockUtterance.onend();
    });
    assert.strictEqual(userFiredCount, 1);
    assert.strictEqual(global.__activeUtteranceGuard.has(mockUtterance), false);
  });

  test('3.6 Legacy Array fallback for __activeUtteranceGuard', () => {
    resetGlobalScope();
    global.__activeUtteranceGuard = []; // Array instead of Set
    const mockUtterance = { text: 'Array test' };

    BrowserCompat.protectUtterance(mockUtterance);
    assert.ok(Array.isArray(global.__activeUtteranceGuard));
    assert.strictEqual(global.__activeUtteranceGuard.includes(mockUtterance), true);

    mockUtterance.onend();
    assert.strictEqual(global.__activeUtteranceGuard.includes(mockUtterance), false);
  });

  test('3.7 Null/undefined utterance handling', () => {
    resetGlobalScope();
    assert.strictEqual(BrowserCompat.protectUtterance(null), null);
    assert.strictEqual(BrowserCompat.protectUtterance(undefined), undefined);
  });


  // ===========================================================================
  // VECTOR 4: Local file fetch relay handling in content.js & background.js
  // ===========================================================================
  console.log('\n--- VECTOR 4: Local file fetch relay handling Stress Tests ---');

  test('4.1 arrayBufferToBase64 large buffer chunking performance (50MB binary buffer)', () => {
    const size = 50 * 1024 * 1024; // 50 MB
    const buffer = new ArrayBuffer(size);
    const view = new Uint8Array(buffer);
    // Fill sample values
    for (let i = 0; i < 1000; i++) {
      view[i] = i % 256;
    }

    const start = Date.now();
    let base64 = '';
    assert.doesNotThrow(() => {
      base64 = content.arrayBufferToBase64(buffer);
    }, 'Chunking should handle 50MB without Maximum Call Stack Exceeded error');

    const duration = Date.now() - start;
    console.log(`         [PERF] 50MB ArrayBuffer converted to Base64 in ${duration}ms (length: ${base64.length})`);
    assert.ok(base64.length > 0);
  });

  test('4.2 isPdf URL detection filter stress test', () => {
    const origWindow = global.window;
    const origDoc = global.document;

    try {
      global.window = { location: { href: 'file:///C:/doc.pdf', search: '', hash: '' } };
      global.document = { contentType: 'application/pdf' };
      assert.strictEqual(content.isPdf(), true);

      global.window.location.search = '?native=true';
      assert.strictEqual(content.isPdf(), false, 'native=true query should bypass isPdf');

      global.window.location.search = '';
      global.window.location.hash = '#native=true';
      assert.strictEqual(content.isPdf(), false, 'native=true hash should bypass isPdf');

      global.window.location.hash = '';
      global.window.location.href = 'file:///C:/doc.txt';
      global.document.contentType = 'text/plain';
      assert.strictEqual(content.isPdf(), false);
    } finally {
      global.window = origWindow;
      global.document = origDoc;
    }
  });

  test('4.3 background.js isPdfUrl boundary check', () => {
    assert.strictEqual(background.isPdfUrl('https://example.com/test.pdf'), true);
    assert.strictEqual(background.isPdfUrl('file:///C:/docs/report.pdf'), true);
    assert.strictEqual(background.isPdfUrl('https://example.com/api?pdf=true'), true);
    assert.strictEqual(background.isPdfUrl('https://example.com/viewer.html?file=test.pdf'), false);
    assert.strictEqual(background.isPdfUrl('https://example.com/test.pdf?native=true'), false);
    assert.strictEqual(background.isPdfUrl(null), false);
    assert.strictEqual(background.isPdfUrl(12345), false);
  });

  await asyncTest('4.4 content.js handleLocalPdf Direct Fetch Success Path', async () => {
    const origWindow = global.window;
    const origDoc = global.document;
    const origChrome = global.chrome;
    const origFetch = global.fetch;

    let storageSetData = null;
    let redirectedUrl = null;

    try {
      global.window = {
        location: {
          href: 'file:///C:/Users/test/sample.pdf',
          search: '',
          hash: ''
        }
      };
      global.document = { contentType: 'application/pdf' };

      // Mock fetch
      global.fetch = (url) => {
        assert.strictEqual(url, 'file:///C:/Users/test/sample.pdf');
        const buf = new Uint8Array([0x25, 0x50, 0x44, 0x46]).buffer; // %PDF
        return Promise.resolve({
          arrayBuffer: () => Promise.resolve(buf)
        });
      };

      global.chrome = {
        runtime: {
          getURL: (path) => `chrome-extension://mockid/${path}`
        },
        storage: {
          local: {
            set: (data, cb) => {
              storageSetData = data;
              cb();
            }
          }
        }
      };

      const handled = content.handleLocalPdf({ active: true, mode: 'enhanced' });
      assert.strictEqual(handled, true);
      assert.strictEqual(global.window.__pdfDarkProcessingLocal, true);

      // Wait microtask for fetch promise resolution
      await new Promise(resolve => setTimeout(resolve, 50));

      assert.ok(storageSetData && storageSetData.pendingLocalPdf);
      assert.strictEqual(storageSetData.pendingLocalPdf.name, 'sample.pdf');
      assert.strictEqual(storageSetData.pendingLocalPdf.url, 'file:///C:/Users/test/sample.pdf');
      assert.ok(storageSetData.pendingLocalPdf.data.length > 0);
      assert.strictEqual(global.window.location.href, 'chrome-extension://mockid/viewer.html?file=pending_local');

    } finally {
      global.window = origWindow;
      global.document = origDoc;
      global.chrome = origChrome;
      global.fetch = origFetch;
    }
  });

  await asyncTest('4.5 content.js handleLocalPdf Fetch Failure -> Background Relay Fallback Path', async () => {
    const origWindow = global.window;
    const origDoc = global.document;
    const origChrome = global.chrome;
    const origFetch = global.fetch;

    let messageSent = null;

    try {
      global.window = {
        location: {
          href: 'file:///C:/Users/test/restricted.pdf',
          search: '',
          hash: ''
        }
      };
      global.document = { contentType: 'application/pdf' };

      // Mock fetch failure (CORS/file access blocked)
      global.fetch = () => Promise.reject(new TypeError('Failed to fetch'));

      global.chrome = {
        runtime: {
          getURL: (path) => `chrome-extension://mockid/${path}`,
          sendMessage: (msg, cb) => {
            messageSent = msg;
            cb({ success: true, data: 'JVBERi0xLjQK' }); // %PDF-1.4
          }
        },
        storage: {
          local: {
            set: (data, cb) => cb()
          }
        }
      };

      content.handleLocalPdf({ active: true, mode: 'enhanced' });
      await new Promise(resolve => setTimeout(resolve, 50));

      assert.ok(messageSent);
      assert.strictEqual(messageSent.action, 'read_file_bytes');
      assert.strictEqual(messageSent.url, 'file:///C:/Users/test/restricted.pdf');
      assert.strictEqual(global.window.location.href, 'chrome-extension://mockid/viewer.html?file=pending_local');

    } finally {
      global.window = origWindow;
      global.document = origDoc;
      global.chrome = origChrome;
      global.fetch = origFetch;
    }
  });

  await asyncTest('4.6 background.js handleReadFileBytes from Cached pendingLocalPdf', async () => {
    resetGlobalScope();
    global.chrome = {
      storage: {
        local: {
          get: (key, cb) => {
            cb({
              pendingLocalPdf: {
                url: 'file:///C:/cached.pdf',
                data: 'BASE64_CACHED_BYTES'
              }
            });
          }
        }
      }
    };

    let responseResult = null;
    background.handleReadFileBytes(
      { action: 'read_file_bytes', url: 'file:///C:/cached.pdf' },
      null,
      (res) => { responseResult = res; }
    );

    assert.deepStrictEqual(responseResult, {
      success: true,
      data: 'BASE64_CACHED_BYTES'
    });
  });

  await asyncTest('4.7 background.js handleReadFileBytes executeScript fallback when fetch fails', async () => {
    resetGlobalScope();
    global.fetch = () => Promise.reject(new Error('Background fetch forbidden'));

    let executeScriptArgs = null;
    global.chrome = {
      storage: {
        local: {
          get: (key, cb) => cb({})
        }
      },
      scripting: {
        executeScript: (opts, cb) => {
          executeScriptArgs = opts;
          cb([{ result: 'BASE64_EXEC_SCRIPT_DATA' }]);
        }
      }
    };

    let responseResult = null;
    background.handleReadFileBytes(
      { action: 'read_file_bytes', url: 'file:///C:/local.pdf' },
      { tab: { id: 42 } },
      (res) => { responseResult = res; }
    );

    await new Promise(resolve => setTimeout(resolve, 50));

    assert.ok(executeScriptArgs);
    assert.strictEqual(executeScriptArgs.target.tabId, 42);
    assert.deepStrictEqual(responseResult, {
      success: true,
      data: 'BASE64_EXEC_SCRIPT_DATA'
    });
  });

  test('4.8 handleLocalPdf Re-entrancy Protection (window.__pdfDarkProcessingLocal)', () => {
    const origWindow = global.window;
    const origDoc = global.document;

    try {
      global.window = {
        location: { href: 'file:///C:/doc.pdf', search: '', hash: '' },
        __pdfDarkProcessingLocal: true
      };
      global.document = { contentType: 'application/pdf' };

      const result = content.handleLocalPdf({ active: true, mode: 'enhanced' });
      assert.strictEqual(result, true, 'Should return true when already processing');
    } finally {
      global.window = origWindow;
      global.document = origDoc;
    }
  });


  // ===========================================================================
  // SUMMARY
  // ===========================================================================
  console.log('\n=================================================================');
  console.log(`STRESS TEST RESULTS: ${passedTests} / ${totalTests} Passed`);
  console.log('=================================================================');

  if (passedTests !== totalTests) {
    process.exit(1);
  }
})();
