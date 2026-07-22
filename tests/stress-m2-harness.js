/**
 * Milestone 2 Stress Test Harness
 * Empirically stress-tests:
 * 1. file:/// URL detection (background.js & content.js)
 * 2. Chunked Base64 encoding/decoding stack limits and byte fidelity (content.js & viewer.js)
 * 3. Storage quota handling & cleanup (manifest.json & chrome.storage.local)
 * 4. read_file_bytes message handling (background.js)
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { setupGlobalChromeMock } = require('./mocks/chrome-api-mock');

// Setup Chrome global mock FIRST before loading background/content scripts
const chromeMock = setupGlobalChromeMock();

const contentScript = require('../content');
const background = require('../background');

let totalPasses = 0;
let totalFails = 0;

function runTest(description, testFn) {
  try {
    testFn();
    console.log(`  ✅ [PASS] ${description}`);
    totalPasses++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${description}`);
    console.error(err);
    totalFails++;
  }
}

async function runAsyncTest(description, testFn) {
  try {
    await testFn();
    console.log(`  ✅ [PASS] ${description}`);
    totalPasses++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${description}`);
    console.error(err);
    totalFails++;
  }
}

async function main() {
  console.log('=================================================================');
  console.log('       MILESTONE 2 EMPIRICAL STRESS TEST HARNESS                ');
  console.log('=================================================================\n');

  // -----------------------------------------------------------------------------
  // SECTION 1: file:/// URL Detection & Processing
  // -----------------------------------------------------------------------------
  console.log('--- Section 1: file:/// URL Detection & Processing ---');

  runTest('1.1 Standard file:/// PDF URLs detected as PDF in background.js', () => {
    assert.strictEqual(background.isPdfUrl('file:///C:/Users/test/document.pdf'), true);
    assert.strictEqual(background.isPdfUrl('file:///D:/Books/manual.PDF'), true);
    assert.strictEqual(background.isPdfUrl('file:///tmp/file.pdf'), true);
  });

  runTest('1.2 file:/// URLs with search params and hash fragments', () => {
    assert.strictEqual(background.isPdfUrl('file:///C:/doc.pdf?zoom=100#page=5'), true);
    assert.strictEqual(background.isPdfUrl('file:///C:/doc.pdf?pdf=true'), true);
    assert.strictEqual(background.isPdfUrl('file:///C:/path/file.pdf?native=true'), false);
    assert.strictEqual(background.isPdfUrl('file:///C:/path/file.pdf#native=true'), false);
  });

  runTest('1.3 Complex and encoded file:/// paths', () => {
    assert.strictEqual(background.isPdfUrl('file:///C:/My%20Documents/Report%20(2026).pdf'), true);
    assert.strictEqual(background.isPdfUrl('file:///C:/%D0%B4%D0%BE%D0%BA%D1%83%D0%BC%D0%B5%D0%BD%D1%82.pdf'), true);
  });

  runTest('1.4 Non-PDF and invalid file:/// URLs', () => {
    assert.strictEqual(background.isPdfUrl('file:///C:/image.png'), false);
    assert.strictEqual(background.isPdfUrl('file:///C:/document.txt'), false);
    assert.strictEqual(background.isPdfUrl('file:///C:/pdf'), false);
    assert.strictEqual(background.isPdfUrl('file:///C:/viewer.html'), false);
    assert.strictEqual(background.isPdfUrl('file:///'), false);
    assert.strictEqual(background.isPdfUrl(''), false);
    assert.strictEqual(background.isPdfUrl(null), false);
    assert.strictEqual(background.isPdfUrl(undefined), false);
    assert.strictEqual(background.isPdfUrl(12345), false);
  });

  await runAsyncTest('1.5 content.js handleLocalPdf mode behavior and idempotency flag', async () => {
    const origWin = global.window;
    const origFetch = global.fetch;

    global.window = {
      location: { href: 'file:///C:/test/file.pdf', search: '', hash: '' },
      __pdfDarkProcessingLocal: false
    };

    let fetchCalled = false;
    global.fetch = () => {
      fetchCalled = true;
      return Promise.resolve({
        arrayBuffer: () => Promise.resolve(new Uint8Array([0x25, 0x50, 0x44, 0x46]).buffer)
      });
    };

    try {
      // Mode classic -> return false
      assert.strictEqual(contentScript.handleLocalPdf({ active: true, mode: 'classic' }), false);

      // Active false -> return false
      assert.strictEqual(contentScript.handleLocalPdf({ active: false, mode: 'enhanced' }), false);

      // Mode enhanced -> return true and set flag
      assert.strictEqual(contentScript.handleLocalPdf({ active: true, mode: 'enhanced' }), true);
      assert.strictEqual(global.window.__pdfDarkProcessingLocal, true);

      // Subsequent call returns true due to idempotency flag
      assert.strictEqual(contentScript.handleLocalPdf({ active: true, mode: 'enhanced' }), true);

      await new Promise(r => setTimeout(r, 20));
      assert.strictEqual(fetchCalled, true);
    } finally {
      global.window = origWin;
      global.fetch = origFetch;
    }
  });


  // -----------------------------------------------------------------------------
  // SECTION 2: Chunked Base64 Encoding & Decoding Stress Test
  // -----------------------------------------------------------------------------
  console.log('\n--- Section 2: Chunked Base64 Encoding & Decoding Stress Test ---');

  runTest('2.1 Small (100 B) ArrayBuffer chunked Base64 encoding', () => {
    const buf = new Uint8Array(100).map((_, i) => i % 256).buffer;
    const b64 = contentScript.arrayBufferToBase64(buf);
    assert.ok(typeof b64 === 'string' && b64.length > 0);
  });

  runTest('2.2 Chunk boundary tests (32767, 32768, 32769, 65536 bytes)', () => {
    const sizes = [32767, 32768, 32769, 65536];
    for (const sz of sizes) {
      const arr = new Uint8Array(sz);
      for (let i = 0; i < sz; i++) arr[i] = i % 256;
      const b64 = contentScript.arrayBufferToBase64(arr.buffer);
      
      // Decode and verify exact matching
      const binStr = atob(b64);
      assert.strictEqual(binStr.length, sz);
      for (let i = 0; i < sz; i++) {
        if (binStr.charCodeAt(i) !== (i % 256)) {
          throw new Error(`Mismatch at index ${i} for size ${sz}`);
        }
      }
    }
  });

  runTest('2.3 Large ArrayBuffer stress test (5 MB ArrayBuffer)', () => {
    const size = 5 * 1024 * 1024; // 5 MB
    const arr = new Uint8Array(size);
    for (let i = 0; i < size; i += 1000) {
      arr[i] = (i / 1000) % 256;
    }
    const t0 = Date.now();
    const b64 = contentScript.arrayBufferToBase64(arr.buffer);
    const elapsed = Date.now() - t0;
    
    assert.ok(b64.length >= (size * 4 / 3));
    console.log(`    (5 MB encoding took ${elapsed} ms, base64 length: ${b64.length} chars)`);
  });

  runTest('2.4 Giant ArrayBuffer stress test (15 MB ArrayBuffer)', () => {
    const size = 15 * 1024 * 1024; // 15 MB
    const arr = new Uint8Array(size);
    arr[0] = 0x25; arr[1] = 0x50; arr[2] = 0x44; arr[3] = 0x46; // %PDF
    arr[size - 1] = 0xFF;

    const t0 = Date.now();
    const b64 = contentScript.arrayBufferToBase64(arr.buffer);
    const elapsed = Date.now() - t0;

    assert.ok(b64.length > size);

    // Decode check first and last byte
    const decodedStr = atob(b64);
    assert.strictEqual(decodedStr.charCodeAt(0), 0x25);
    assert.strictEqual(decodedStr.charCodeAt(size - 1), 0xFF);
    console.log(`    (15 MB encoding took ${elapsed} ms, base64 length: ${b64.length} chars)`);
  });

  runTest('2.5 Full 0x00-0xFF byte spectrum data fidelity check', () => {
    const spectrum = new Uint8Array(256);
    for (let i = 0; i < 256; i++) spectrum[i] = i;
    const b64 = contentScript.arrayBufferToBase64(spectrum.buffer);
    const decodedBinStr = atob(b64);
    assert.strictEqual(decodedBinStr.length, 256);
    for (let i = 0; i < 256; i++) {
      assert.strictEqual(decodedBinStr.charCodeAt(i), i);
    }
  });

  runTest('2.6 Empty, null, and undefined buffer edge cases', () => {
    assert.strictEqual(contentScript.arrayBufferToBase64(null), '');
    assert.strictEqual(contentScript.arrayBufferToBase64(undefined), '');
    assert.strictEqual(contentScript.arrayBufferToBase64(new ArrayBuffer(0)), '');
  });


  // -----------------------------------------------------------------------------
  // SECTION 3: Storage Quota & Manifest Verification
  // -----------------------------------------------------------------------------
  console.log('\n--- Section 3: Storage Quota & Manifest Verification ---');

  runTest('3.1 manifest.json permissions include "unlimitedStorage" and "file:///*"', () => {
    const manifestPath = path.join(__dirname, '../manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

    assert.ok(manifest.permissions.includes('unlimitedStorage'), 'permissions must contain unlimitedStorage');
    assert.ok(manifest.host_permissions.includes('file:///*'), 'host_permissions must contain file:///*');
    assert.ok(manifest.content_scripts[0].matches.includes('file:///*'), 'content_scripts matches must contain file:///*');
    assert.ok(manifest.web_accessible_resources[0].matches.includes('file:///*'), 'web_accessible_resources matches must contain file:///*');
  });

  await runAsyncTest('3.2 Large payload storage set and removal cycle', async () => {
    const largeData = 'A'.repeat(6 * 1024 * 1024); // 6 MB Base64 string
    const pendingPayload = {
      name: 'large_document.pdf',
      data: largeData,
      url: 'file:///C:/large_document.pdf'
    };

    await chrome.storage.local.set({ pendingLocalPdf: pendingPayload });

    const fetched = await new Promise(r => chrome.storage.local.get('pendingLocalPdf', r));
    assert.strictEqual(fetched.pendingLocalPdf.name, 'large_document.pdf');
    assert.strictEqual(fetched.pendingLocalPdf.data.length, 6 * 1024 * 1024);

    // Simulate viewer.js cleanup
    await chrome.storage.local.remove('pendingLocalPdf');

    const afterCleanup = await new Promise(r => chrome.storage.local.get('pendingLocalPdf', r));
    assert.strictEqual(afterCleanup.pendingLocalPdf, undefined);
  });


  // -----------------------------------------------------------------------------
  // SECTION 4: read_file_bytes Message Handler Stress Test
  // -----------------------------------------------------------------------------
  console.log('\n--- Section 4: read_file_bytes Message Handler Stress Test ---');

  await runAsyncTest('4.1 read_file_bytes returns pendingLocalPdf data when available', async () => {
    const testData = { name: 'sample.pdf', data: 'SGVsbG8gV29ybGQ=', url: 'file:///C:/sample.pdf' };
    await chrome.storage.local.set({ pendingLocalPdf: testData });

    const response = await new Promise((resolve) => {
      background.handleReadFileBytes({ action: 'read_file_bytes', url: 'file:///C:/sample.pdf' }, {}, resolve);
    });

    assert.strictEqual(response.success, true);
    assert.strictEqual(response.data, 'SGVsbG8gV29ybGQ=');
  });

  await runAsyncTest('4.2 read_file_bytes matches when url argument is omitted in message', async () => {
    const testData = { name: 'sample.pdf', data: 'SGVsbG8gV29ybGQ=', url: 'file:///C:/sample.pdf' };
    await chrome.storage.local.set({ pendingLocalPdf: testData });

    const response = await new Promise((resolve) => {
      background.handleReadFileBytes({ action: 'read_file_bytes' }, {}, resolve);
    });

    assert.strictEqual(response.success, true);
    assert.strictEqual(response.data, 'SGVsbG8gV29ybGQ=');
  });

  await runAsyncTest('4.3 read_file_bytes handles script execution fallback when pendingLocalPdf is absent', async () => {
    await chrome.storage.local.remove('pendingLocalPdf');

    const mockSender = { tab: { id: 42 } };
    
    // Set up chrome.scripting.executeScript mock
    chrome.scripting = {
      executeScript: (options, callback) => {
        assert.strictEqual(options.target.tabId, 42);
        callback([{ result: 'RlZCY0FBQUE=' }]);
      }
    };

    const response = await new Promise((resolve) => {
      background.handleReadFileBytes({ action: 'read_file_bytes', url: 'file:///C:/other.pdf' }, mockSender, resolve);
    });

    assert.strictEqual(response.success, true);
    assert.strictEqual(response.data, 'RlZCY0FBQUE=');
  });

  await runAsyncTest('4.4 read_file_bytes error handling on null/missing storage & missing tabId', async () => {
    await chrome.storage.local.remove('pendingLocalPdf');
    delete chrome.scripting;

    const response = await new Promise((resolve) => {
      background.handleReadFileBytes({ action: 'read_file_bytes' }, {}, resolve);
    });

    assert.strictEqual(response.success, false);
    assert.strictEqual(response.error, 'File data unavailable');
  });

  await runAsyncTest('4.5 read_file_bytes null/undefined message and sender tolerance', async () => {
    const response = await new Promise((resolve) => {
      background.handleReadFileBytes(null, null, resolve);
    });

    assert.strictEqual(response.success, false);
    assert.strictEqual(response.error, 'File data unavailable');
  });


  // -----------------------------------------------------------------------------
  // SUMMARY
  // -----------------------------------------------------------------------------
  console.log('\n=================================================================');
  console.log(`STRESS TEST SUMMARY: ${totalPasses} Passed, ${totalFails} Failed`);
  console.log('=================================================================\n');

  if (totalFails > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

main().catch(err => {
  console.error('Fatal error running stress harness:', err);
  process.exit(1);
});
