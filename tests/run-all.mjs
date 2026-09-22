/**
 * Aggregate test runner — replaces the `&&`-chained test:all script.
 *
 * Why: a chained runner STOPS at the first failing suite, so one failure
 * hides every suite after it (exactly how the excluded live suites and the
 * production-drift failure stayed invisible). This runner:
 *
 *   1. runs EVERY suite, always — one failure never masks the rest
 *   2. prints one line per suite + a summary table
 *   3. exits non-zero if ANY suite failed (CI-honest)
 *
 * Suites are read from tests/*.test.mjs so a new suite can never be
 * forgotten (the root cause this runner exists to fix).
 *
 * Run: node tests/run-all.mjs   (or: npm run test:all)
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TESTS_DIR = path.dirname(fileURLToPath(import.meta.url));

const suites = fs
  .readdirSync(TESTS_DIR)
  .filter((f) => f.endsWith('.test.mjs'))
  .sort();

const results = [];
let totalPassed = 0;
let totalFailed = 0;

console.log(`Running ${suites.length} suites…\n`);

for (const suite of suites) {
  const started = Date.now();
  const proc = spawnSync(process.execPath, [path.join(TESTS_DIR, suite)], {
    encoding: 'utf8',
    timeout: 180_000,
  });
  const ms = Date.now() - started;

  // Suites print "N passed, M failed" on their summary line.
  const summary = (proc.stdout ?? '').match(/(\d+) passed, (\d+) failed/);
  const passed = summary ? Number(summary[1]) : 0;
  const failed = summary ? Number(summary[2]) : 0;
  const crashed = proc.status !== 0 && !summary; // no summary → died before reporting
  const ok = proc.status === 0;

  totalPassed += passed;
  totalFailed += failed;

  results.push({ suite, passed, failed, ms, ok, crashed });
  console.log(
    `${ok ? '✅' : '❌'} ${suite.padEnd(34)} ${passed} passed, ${failed} failed (${ms} ms)${crashed ? ' — CRASHED before summary' : ''}`,
  );

  if (!ok) {
    // Surface the failure output inline so nobody has to re-run the suite.
    const tail = `${proc.stdout ?? ''}\n${proc.stderr ?? ''}`.trim().split('\n').slice(-8);
    console.log(tail.map((l) => `    │ ${l}`).join('\n'));
  }
}

console.log(`\n${'—'.repeat(60)}`);
const failedSuites = results.filter((r) => !r.ok);
for (const r of failedSuites) {
  console.log(`❌ ${r.suite}: ${r.failed} failed test(s)`);
}
console.log(
  `${results.length} suites · ${totalPassed} passed, ${totalFailed} failed · ${failedSuites.length} failing suite(s)`,
);

if (failedSuites.length > 0) {
  console.log('\nNOTE: a "deploy migration 0013" failure means PRODUCTION drift,');
  console.log('not broken tests — run `npm run db:deploy` to apply the migrations.');
  process.exit(1);
}
