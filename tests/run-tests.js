/**
 * Automated Test Runner for Portable-Darkument-Format
 * Runs Tier 1, Tier 2, Tier 3, and Tier 4 Test Suites using Node.js native test harness.
 * Computes pass/fail counts dynamically from actual test executions.
 * Executable via: node tests/run-tests.js
 */

const { spawnSync } = require('child_process');
const path = require('path');

const suites = [
  { name: 'Tier 1 (Feature Coverage)', file: path.join(__dirname, 'unit', 'tier1-feature-coverage.test.js') },
  { name: 'Tier 2 (Boundary & Corner Cases)', file: path.join(__dirname, 'unit', 'tier2-boundary-corner.test.js') },
  { name: 'Tier 3 (Cross-Feature Combinations)', file: path.join(__dirname, 'e2e', 'tier3-cross-feature.test.js') },
  { name: 'Tier 4 (Real-World Workloads)', file: path.join(__dirname, 'e2e', 'tier4-real-world.test.js') },
  { name: 'Tier 5 (Firefox Cross-Browser)', file: path.join(__dirname, 'unit', 'tier5-firefox-cross-browser.test.js') }
];

console.log('=================================================================');
console.log('      PORTABLE-DARKUMENT-FORMAT S-TIER AUTOMATED TEST RUNNER      ');
console.log('=================================================================\n');
console.log(`Executing ${suites.length} test suites...\n`);

const startTime = Date.now();
const results = [];
let overallStatus = 0;

for (const suite of suites) {
  const res = spawnSync(process.execPath, ['--test', '--test-reporter=tap', suite.file], {
    encoding: 'utf8',
    env: { ...process.env, FORCE_COLOR: '1' }
  });

  if (res.status !== 0) {
    overallStatus = res.status || 1;
  }

  const stdout = res.stdout || '';
  const passMatch = stdout.match(/# pass (\d+)/);
  const totalMatch = stdout.match(/# tests (\d+)/);

  const passed = passMatch ? parseInt(passMatch[1], 10) : 0;
  const total = totalMatch ? parseInt(totalMatch[1], 10) : 0;

  results.push({
    name: suite.name,
    passed,
    total,
    status: res.status
  });
}

const durationMs = Date.now() - startTime;

let totalPassed = 0;
let totalExecuted = 0;

console.log('=================================================================');
console.log('                       TEST EXECUTION SUMMARY                    ');
console.log('=================================================================');

for (const res of results) {
  totalPassed += res.passed;
  totalExecuted += res.total;
  console.log(`  ${res.name.padEnd(35)}: ${res.passed.toString().padStart(2)} / ${res.total.toString().padStart(2)} Passed`);
}

console.log('-----------------------------------------------------------------');
console.log(`  TOTAL TEST CASES EXECUTED          : ${totalPassed} / ${totalExecuted} Passed`);
console.log(`  EXECUTION DURATION                 : ${(durationMs / 1000).toFixed(2)} seconds`);
console.log('=================================================================\n');

if (overallStatus !== 0 || totalPassed !== totalExecuted) {
  console.error(`❌ Test suite failed with ${totalExecuted - totalPassed} failure(s). Exit code: ${overallStatus}`);
  process.exit(overallStatus || 1);
} else {
  console.log(`✅ ALL ${totalExecuted} AUTOMATED TESTS PASSED SUCCESSFULLY!\n`);
  process.exit(0);
}
