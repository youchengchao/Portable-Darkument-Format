/**
 * S-TIER EMPIRICAL STRESS TEST HARNESS FOR MILESTONE 2 (R2 HEATMAP)
 * 
 * Stress Vectors Tested:
 * 1. Empty `dailyStats` object or `analytics` undefined
 * 2. Sparse reading data (scattered single-day entries)
 * 3. High volume reading data (large minute/page counts)
 * 4. Rapid supporter status toggling (gold accent vs default violet theme)
 * 5. Verification of standard test suite execution
 */

const assert = require('assert');
const path = require('path');
const { execSync } = require('child_process');

const popup = require('../popup.js');
const { renderReadingHeatmap, renderPopupStats, calculateActiveStreak } = popup;

// Helper: Setup DOM mock environment for Heatmap testing
function setupMockHeatmapDOM() {
  const children = [];
  const cardClassList = new Set();
  const wrapperClassList = new Set();
  const gridClassList = new Set();

  const cardEl = {
    classList: {
      add: (c) => cardClassList.add(c),
      remove: (c) => cardClassList.delete(c),
      contains: (c) => cardClassList.has(c),
      toggle: (c, val) => val ? cardClassList.add(c) : cardClassList.delete(c)
    }
  };

  const wrapperEl = {
    id: 'reading-heatmap-wrapper',
    scrollLeft: 0,
    scrollWidth: 800,
    classList: {
      add: (c) => wrapperClassList.add(c),
      remove: (c) => wrapperClassList.delete(c),
      contains: (c) => wrapperClassList.has(c),
      toggle: (c, val) => val ? wrapperClassList.add(c) : wrapperClassList.delete(c)
    }
  };

  const gridEl = {
    id: 'reading-heatmap-grid',
    innerHTML: '',
    children: children,
    classList: {
      add: (c) => gridClassList.add(c),
      remove: (c) => gridClassList.delete(c),
      contains: (c) => gridClassList.has(c),
      toggle: (c, val) => val ? gridClassList.add(c) : gridClassList.delete(c)
    },
    appendChild: (child) => { children.push(child); },
    closest: (selector) => (selector === '.heatmap-card' ? cardEl : null)
  };

  const totalDaysEl = {
    id: 'heatmap-total-days',
    textContent: ''
  };

  const streakBadgeEl = { id: 'top-streak-badge', textContent: '' };
  const streakValEl = { id: 'popup-streak-val', textContent: '' };
  const timeValEl = { id: 'popup-time-val', textContent: '' };
  const pagesValEl = { id: 'popup-pages-val', textContent: '' };

  const mockDoc = {
    getElementById: (id) => {
      if (id === 'reading-heatmap-grid') return gridEl;
      if (id === 'heatmap-total-days') return totalDaysEl;
      if (id === 'reading-heatmap-wrapper') return wrapperEl;
      if (id === 'top-streak-badge') return streakBadgeEl;
      if (id === 'popup-streak-val') return streakValEl;
      if (id === 'popup-time-val') return timeValEl;
      if (id === 'popup-pages-val') return pagesValEl;
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

  return { mockDoc, gridEl, totalDaysEl, wrapperEl, cardEl, children, cardClassList, wrapperClassList, gridClassList };
}

// Helper: Setup mock Chrome Storage API
function setupMockChromeStorage(storageData = {}) {
  global.chrome = {
    storage: {
      local: {
        get: (keys, callback) => {
          const result = {};
          if (Array.isArray(keys)) {
            keys.forEach(k => { result[k] = storageData[k]; });
          } else if (typeof keys === 'string') {
            result[keys] = storageData[keys];
          } else {
            Object.assign(result, storageData);
          }
          callback(result);
        }
      }
    }
  };
}

let passedCount = 0;
let totalCount = 0;

function runTest(name, fn) {
  totalCount++;
  try {
    fn();
    passedCount++;
    console.log(`  [PASS] ${name}`);
  } catch (err) {
    console.error(`  [FAIL] ${name}`);
    console.error(`         ${err.stack || err.message}`);
  }
}

console.log('=================================================================');
console.log('       EMPIRICAL STRESS TEST HARNESS: R2 HEATMAP FEATURE        ');
console.log('=================================================================\n');

// -----------------------------------------------------------------------------
// VECTOR 1: Empty dailyStats object or analytics undefined
// -----------------------------------------------------------------------------
console.log('--- VECTOR 1: Empty dailyStats or analytics undefined ---');

runTest('1.1 Empty dailyStats object renders 365 level-0 cells & 0 active days', () => {
  const origDoc = global.document;
  const { mockDoc, children, totalDaysEl } = setupMockHeatmapDOM();
  global.document = mockDoc;
  try {
    renderReadingHeatmap({}, false, false);
    assert.strictEqual(children.length, 365, 'Should render exactly 365 cells');
    assert.strictEqual(totalDaysEl.textContent, '0 active days in past year');
    const nonZeroLevel = children.filter(c => c.className !== 'heatmap-cell level-0');
    assert.strictEqual(nonZeroLevel.length, 0, 'All cells should be level-0');
  } finally {
    global.document = origDoc;
  }
});

runTest('1.2 null dailyStats parameter handles gracefully without throwing', () => {
  const origDoc = global.document;
  const { mockDoc, children } = setupMockHeatmapDOM();
  global.document = mockDoc;
  try {
    assert.doesNotThrow(() => renderReadingHeatmap(null, false, false));
    assert.strictEqual(children.length, 365, 'Should render 365 cells for null input');
  } finally {
    global.document = origDoc;
  }
});

runTest('1.3 undefined dailyStats parameter handles gracefully without throwing', () => {
  const origDoc = global.document;
  const { mockDoc, children } = setupMockHeatmapDOM();
  global.document = mockDoc;
  try {
    assert.doesNotThrow(() => renderReadingHeatmap(undefined, false, false));
    assert.strictEqual(children.length, 365, 'Should render 365 cells for undefined input');
  } finally {
    global.document = origDoc;
  }
});

runTest('1.4 Malformed dailyStats entries (null, {}, string) do not throw errors', () => {
  const origDoc = global.document;
  const { mockDoc, children } = setupMockHeatmapDOM();
  global.document = mockDoc;
  const now = new Date();
  const todayISO = now.toISOString().split('T')[0];
  const malformedStats = {
    [todayISO]: null,
    '2026-01-01': {},
    '2026-01-02': 'invalid string',
    '2026-01-03': { seconds: null, pages: undefined },
    '2026-01-04': { seconds: -500, pages: -10 }
  };
  try {
    assert.doesNotThrow(() => renderReadingHeatmap(malformedStats, false, false));
    assert.strictEqual(children.length, 365);
  } finally {
    global.document = origDoc;
  }
});

runTest('1.5 renderPopupStats with undefined analytics and supporter in storage', () => {
  const origDoc = global.document;
  const origChrome = global.chrome;
  const { mockDoc, children } = setupMockHeatmapDOM();
  global.document = mockDoc;
  setupMockChromeStorage({ analytics: undefined, supporter: undefined });
  try {
    assert.doesNotThrow(() => renderPopupStats());
    assert.strictEqual(children.length, 365);
  } finally {
    global.document = origDoc;
    global.chrome = origChrome;
  }
});


// -----------------------------------------------------------------------------
// VECTOR 2: Sparse reading data (scattered single-day entries)
// -----------------------------------------------------------------------------
console.log('\n--- VECTOR 2: Sparse reading data ---');

runTest('2.1 Single entry 364 days ago (earliest boundary of 365-day window)', () => {
  const origDoc = global.document;
  const { mockDoc, children, totalDaysEl } = setupMockHeatmapDOM();
  global.document = mockDoc;
  const d = new Date();
  d.setDate(d.getDate() - 364);
  const oldestDateISO = d.toISOString().split('T')[0];

  const sparseStats = {
    [oldestDateISO]: { seconds: 1800, pages: 12 } // 30 mins -> level 3
  };

  try {
    renderReadingHeatmap(sparseStats, false, false);
    assert.strictEqual(totalDaysEl.textContent, '1 active day in past year');
    const cell = children.find(c => c.dataset.date === oldestDateISO);
    assert.ok(cell, 'Oldest date cell should exist');
    assert.strictEqual(cell.className, 'heatmap-cell level-3');
  } finally {
    global.document = origDoc;
  }
});

runTest('2.2 Single entry today (latest boundary of 365-day window)', () => {
  const origDoc = global.document;
  const { mockDoc, children, totalDaysEl } = setupMockHeatmapDOM();
  global.document = mockDoc;
  const todayISO = new Date().toISOString().split('T')[0];

  const sparseStats = {
    [todayISO]: { seconds: 3600, pages: 50 } // 60 mins -> level 4
  };

  try {
    renderReadingHeatmap(sparseStats, false, false);
    assert.strictEqual(totalDaysEl.textContent, '1 active day in past year');
    const todayCell = children[children.length - 1];
    assert.strictEqual(todayCell.dataset.date, todayISO);
    assert.strictEqual(todayCell.className, 'heatmap-cell level-4');
  } finally {
    global.document = origDoc;
  }
});

runTest('2.3 Out-of-window entries (older than 365 days or future dates) do not corrupt grid', () => {
  const origDoc = global.document;
  const { mockDoc, children, totalDaysEl } = setupMockHeatmapDOM();
  global.document = mockDoc;
  
  const dOld = new Date();
  dOld.setDate(dOld.getDate() - 500);
  const oldISO = dOld.toISOString().split('T')[0];

  const dFuture = new Date();
  dFuture.setDate(dFuture.getDate() + 30);
  const futureISO = dFuture.toISOString().split('T')[0];

  const stats = {
    [oldISO]: { seconds: 7200, pages: 100 },
    [futureISO]: { seconds: 7200, pages: 100 }
  };

  try {
    renderReadingHeatmap(stats, false, false);
    assert.strictEqual(children.length, 365);
    assert.strictEqual(totalDaysEl.textContent, '0 active days in past year');
  } finally {
    global.document = origDoc;
  }
});

runTest('2.4 Rounding threshold: 29s (0 mins) vs 30s (1 min -> level 1)', () => {
  const origDoc = global.document;
  const { mockDoc, children, totalDaysEl } = setupMockHeatmapDOM();
  global.document = mockDoc;
  
  const d1 = new Date();
  d1.setDate(d1.getDate() - 1);
  const date29s = d1.toISOString().split('T')[0];

  const d2 = new Date();
  d2.setDate(d2.getDate() - 2);
  const date30s = d2.toISOString().split('T')[0];

  const stats = {
    [date29s]: { seconds: 29, pages: 1 }, // Math.round(29/60) = 0 mins -> level 0
    [date30s]: { seconds: 30, pages: 1 }  // Math.round(30/60) = 1 min -> level 1
  };

  try {
    renderReadingHeatmap(stats, false, false);
    const cell29 = children.find(c => c.dataset.date === date29s);
    const cell30 = children.find(c => c.dataset.date === date30s);

    assert.strictEqual(cell29.className, 'heatmap-cell level-0');
    assert.strictEqual(cell30.className, 'heatmap-cell level-1');
    assert.strictEqual(totalDaysEl.textContent, '1 active day in past year');
  } finally {
    global.document = origDoc;
  }
});

runTest('2.5 Fallback to pagesRead property when pages is missing', () => {
  const origDoc = global.document;
  const { mockDoc, children } = setupMockHeatmapDOM();
  global.document = mockDoc;
  const todayISO = new Date().toISOString().split('T')[0];

  const stats = {
    [todayISO]: { seconds: 600, pagesRead: 15 }
  };

  try {
    renderReadingHeatmap(stats, false, false);
    const cell = children[children.length - 1];
    assert.strictEqual(cell.dataset.pages, 15);
    assert.ok(cell.title.includes('15 pages'));
  } finally {
    global.document = origDoc;
  }
});


// -----------------------------------------------------------------------------
// VECTOR 3: High volume reading data (large minute/page counts)
// -----------------------------------------------------------------------------
console.log('\n--- VECTOR 3: High volume reading data ---');

runTest('3.1 All 365 days populated with high activity (86400s / 10000 pages)', () => {
  const origDoc = global.document;
  const { mockDoc, children, totalDaysEl } = setupMockHeatmapDOM();
  global.document = mockDoc;

  const now = new Date();
  const denseStats = {};
  for (let i = 0; i < 365; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const iso = d.toISOString().split('T')[0];
    denseStats[iso] = { seconds: 86400, pages: 10000 };
  }

  try {
    renderReadingHeatmap(denseStats, false, false);
    assert.strictEqual(children.length, 365);
    assert.strictEqual(totalDaysEl.textContent, '365 active days in past year');
    const level4Cells = children.filter(c => c.className === 'heatmap-cell level-4');
    assert.strictEqual(level4Cells.length, 365, 'All cells should be level-4');
  } finally {
    global.document = origDoc;
  }
});

runTest('3.2 Extreme value handling (1 billion seconds, 1 million pages)', () => {
  const origDoc = global.document;
  const { mockDoc, children } = setupMockHeatmapDOM();
  global.document = mockDoc;
  const todayISO = new Date().toISOString().split('T')[0];

  const extremeStats = {
    [todayISO]: { seconds: 1e9, pages: 1e6 }
  };

  try {
    renderReadingHeatmap(extremeStats, false, false);
    const cell = children[children.length - 1];
    assert.strictEqual(cell.className, 'heatmap-cell level-4');
    assert.strictEqual(cell.dataset.mins, 16666667);
    assert.strictEqual(cell.dataset.pages, 1000000);
    assert.ok(cell.title.includes('16666667 mins, 1000000 pages'));
  } finally {
    global.document = origDoc;
  }
});

runTest('3.3 Heatmap performance benchmark (100 rapid re-renders of dense 365-day dataset)', () => {
  const origDoc = global.document;
  const { mockDoc } = setupMockHeatmapDOM();
  global.document = mockDoc;

  const now = new Date();
  const denseStats = {};
  for (let i = 0; i < 365; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    denseStats[d.toISOString().split('T')[0]] = { seconds: 3600, pages: 40 };
  }

  const startTime = Date.now();
  try {
    for (let iteration = 0; iteration < 100; iteration++) {
      renderReadingHeatmap(denseStats, iteration % 2 === 0, iteration % 3 === 0);
    }
    const durationMs = Date.now() - startTime;
    console.log(`         [PERF] 100 full-year renders executed in ${durationMs}ms`);
    assert.ok(durationMs < 1000, `Performance budget exceeded: ${durationMs}ms > 1000ms`);
  } finally {
    global.document = origDoc;
  }
});


// -----------------------------------------------------------------------------
// VECTOR 4: Rapid supporter status toggling
// -----------------------------------------------------------------------------
console.log('\n--- VECTOR 4: Rapid supporter status toggling ---');

runTest('4.1 Rapid toggling (1,000 cycles) of isSupporter and goldAccent flags', () => {
  const origDoc = global.document;
  const { mockDoc, cardClassList, wrapperClassList, gridClassList } = setupMockHeatmapDOM();
  global.document = mockDoc;

  try {
    for (let i = 0; i < 1000; i++) {
      const isSupporter = (i % 2 === 1);
      const goldAccent = (i % 4 >= 2);
      renderReadingHeatmap({}, isSupporter, goldAccent);

      const expectGold = isSupporter || goldAccent;
      assert.strictEqual(cardClassList.has('supporter-heatmap'), expectGold);
      assert.strictEqual(cardClassList.has('theme-gold-accent'), expectGold);
      assert.strictEqual(wrapperClassList.has('supporter-heatmap'), expectGold);
      assert.strictEqual(wrapperClassList.has('theme-gold-accent'), expectGold);
      assert.strictEqual(gridClassList.has('supporter-heatmap'), expectGold);
      assert.strictEqual(gridClassList.has('theme-gold-accent'), expectGold);
    }

    // Final clean state check (false, false)
    renderReadingHeatmap({}, false, false);
    assert.strictEqual(cardClassList.has('supporter-heatmap'), false);
    assert.strictEqual(cardClassList.has('theme-gold-accent'), false);
    assert.strictEqual(wrapperClassList.has('supporter-heatmap'), false);
    assert.strictEqual(wrapperClassList.has('theme-gold-accent'), false);
    assert.strictEqual(gridClassList.has('supporter-heatmap'), false);
    assert.strictEqual(gridClassList.has('theme-gold-accent'), false);
  } finally {
    global.document = origDoc;
  }
});


// -----------------------------------------------------------------------------
// VECTOR 5: Verification of standard test suite execution
// -----------------------------------------------------------------------------
console.log('\n--- VECTOR 5: Test suite execution verification ---');

runTest('5.1 Executing node tests/run-tests.js via child process', () => {
  const testRunnerPath = path.join(__dirname, 'run-tests.js');
  const output = execSync(`node "${testRunnerPath}"`, { encoding: 'utf8' });
  assert.ok(output.includes('145 / 145 Passed'), 'All 145 tests must pass in standard runner');
  assert.ok(output.includes('ALL 145 AUTOMATED TESTS PASSED SUCCESSFULLY'), 'Summary banner must be present');
});


// -----------------------------------------------------------------------------
// SUMMARY
// -----------------------------------------------------------------------------
console.log('\n=================================================================');
console.log(`STRESS TEST RESULTS: ${passedCount} / ${totalCount} Passed`);
console.log('=================================================================');

if (passedCount !== totalCount) {
  process.exit(1);
}
