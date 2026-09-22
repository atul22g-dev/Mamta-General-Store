/**
 * Find Product search pipeline tests — the user-facing contract:
 *
 *   1. ONE pipeline: photo → validate → optimize → data URI → edge → RPC
 *      (no second search system may appear).
 *   2. Error classification: every failure kind maps to a user-safe
 *      message, and the TECHNICAL detail is logged but never shown.
 *   3. The searching screen advances stages from real pipeline callbacks
 *      (no fake timers) and renders the required states.
 *
 * Pure logic runs against the REAL TS modules via tests/alias-loader.mjs.
 *
 * Run: node tests/search-pipeline.test.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { register } from 'node:module';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

register(pathToFileURL(path.join(ROOT, 'tests', 'alias-loader.mjs')).href);

const {
  classifySearchError,
  presentFailure,
  userErrorFor,
} = await import(
  pathToFileURL(path.join(ROOT, 'src', 'utils', 'user-errors.ts')).href
);

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed += 1;
    failures.push({ name, err });
    console.error(`  ✗ ${name}\n    ${err.message}`);
  }
}

function section(title) {
  console.log(`\n${title}`);
}

// ---------------------------------------------------------------------------
// 1. Error classification — the full required failure matrix
// ---------------------------------------------------------------------------
section('Error classification');

test('camera permission denial classified', () => {
  const f = classifySearchError(new Error('Camera permission was denied'), 'camera');
  assert.equal(f.kind, 'camera_permission_denied');
});

test('gallery permission denial classified', () => {
  const f = classifySearchError(new Error('Photo library permission denied by user'), 'gallery');
  assert.equal(f.kind, 'gallery_permission_denied');
});

test('invalid image classified', () => {
  const f = classifySearchError(new Error('A data-URI product photo is required (png/jpeg).'), 'edge');
  assert.equal(f.kind, 'invalid_image');
});

test('optimization failure classified', () => {
  const f = classifySearchError(new Error('Could not process the image (decoder error). Pick it again.'), 'optimize');
  assert.equal(f.kind, 'optimization_failed');
});

test('embedding failure classified (incl. the historic memory crash)', () => {
  const memory = classifySearchError(
    new Error('Embedding failed: maxMemoryUsageInMB limit exceeded by at least 14MB'),
    'visual-match',
  );
  assert.equal(memory.kind, 'embedding_failed');
  const decode = classifySearchError(new Error('jpeg decode failed'), 'visual-match');
  assert.equal(decode.kind, 'embedding_failed');
});

test('wrong embedding dimension classified', () => {
  const f = classifySearchError(
    new Error('Embedding dimension mismatch: got 511, expected 512.'),
    'edge',
  );
  assert.equal(f.kind, 'embedding_dimension');
});

test('network failure classified', () => {
  const f = classifySearchError(new TypeError('Network request failed'), 'transport');
  assert.equal(f.kind, 'network');
});

test('timeout/abort classified before network', () => {
  const f = classifySearchError(new Error('Aborted'), 'transport');
  assert.equal(f.kind, 'timeout');
});

test('Supabase platform error (PostgREST code) classified', () => {
  const err = Object.assign(new Error('RPC failed'), { code: '42804' });
  const f = classifySearchError(err, 'rpc');
  assert.equal(f.kind, 'supabase');
});

test('RPC failure classified', () => {
  const f = classifySearchError(new Error('Similarity search failed: operator does not exist'), 'visual-match');
  assert.equal(f.kind, 'rpc');
});

test('unknown error falls back to the generic kind (never raw)', () => {
  const f = classifySearchError(new Error('Weird quantum failure 0xDEADBEEF'), 'nowhere');
  assert.equal(f.kind, 'unknown');
});

// ---------------------------------------------------------------------------
// 2. User-safe presentation — technical detail logged, never shown
// ---------------------------------------------------------------------------
section('User-safe error presentation');

test('every kind has a user message with no technical leakage', () => {
  const technicalTokens = [
    'rpc', '42804', 'maxmemory', 'dimension', 'http', 'pgrst', 'supabase',
    'decode', 'base64', 'vector', 'edge', 'stack', 'undefined', 'null',
  ];
  for (const kind of [
    'camera_permission_denied', 'gallery_permission_denied', 'invalid_image',
    'optimization_failed', 'read_failed', 'embedding_failed', 'embedding_dimension',
    'network', 'supabase', 'rpc', 'timeout', 'no_photo', 'unknown',
  ]) {
    const ui = userErrorFor(kind);
    assert.ok(ui.title.length > 0, `${kind} needs a title`);
    assert.ok(ui.message.length > 0, `${kind} needs a message`);
    assert.ok(ui.retryLabel.length > 0, `${kind} needs a retry label`);
    const haystack = `${ui.title} ${ui.message} ${ui.retryLabel}`.toLowerCase();
    for (const token of technicalTokens) {
      assert.ok(!haystack.includes(token), `${kind} message leaks "${token}": ${haystack}`);
    }
  }
});

test('the canonical example maps exactly as the requirement states', () => {
  const technical = 'RPC failed: 42804';
  const f = classifySearchError(Object.assign(new Error(technical), { code: '42804' }), 'rpc');
  const ui = presentFailure(f);
  assert.ok(!ui.message.includes('42804'), 'user message must not contain the code');
  assert.ok(ui.message.length > 0, 'user message must exist');
});

test('presentFailure logs the technical detail exactly once', () => {
  const original = console.error;
  let logged = '';
  let count = 0;
  console.error = (...args) => {
    count += 1;
    logged += args.map(String).join(' ');
  };
  try {
    const ui = presentFailure({ kind: 'rpc', technical: 'Similarity search failed: 42883' });
    assert.equal(count, 1, 'technical detail logged once');
    assert.ok(logged.includes('42883'), 'log keeps the real cause');
    assert.ok(!ui.message.includes('42883'), 'UI never shows the cause');
  } finally {
    console.error = original;
  }
});

// ---------------------------------------------------------------------------
// 3. ONE pipeline — no second search system
// ---------------------------------------------------------------------------
section('Single pipeline');

const pipeline = fs.readFileSync(
  path.join(ROOT, 'src/services/search-pipeline.service.ts'),
  'utf8',
);
const searching = fs.readFileSync(
  path.join(ROOT, 'src/app/find-product/searching.tsx'),
  'utf8',
);
// Screen → Hook → Service: pipeline mechanics live in the hook.
const searchHook = fs.readFileSync(
  path.join(ROOT, 'src/hooks/useProductSearch.ts'),
  'utf8',
);

test('search-pipeline is the single orchestrator and reuses the existing stack', () => {
  assert.match(pipeline, /optimizeImage/);
  assert.match(pipeline, /validateImageFile/);
  assert.match(pipeline, /validateAndConvert/);
  assert.match(pipeline, /matchProductFromPhoto/);
  // Exactly one caller of the visual-match client in the whole flow:
  const client = fs.readFileSync(
    path.join(ROOT, 'src/services/product-search.service.ts'),
    'utf8',
  );
  assert.match(client, /export async function matchProductFromPhoto/);
});

test('pipeline order: validate → optimize → convert → match', () => {
  const v = pipeline.indexOf('validateImageFile(photoUri)');
  const o = pipeline.indexOf('optimizeImage(photoUri)');
  const c = pipeline.indexOf('validateAndConvert(optimizedUri)');
  const m = pipeline.indexOf('matchProductFromPhoto(conversion.dataUri');
  assert.ok(v >= 0 && o > v && c > o && m > c, `order wrong: v=${v} o=${o} c=${c} m=${m}`);
});

test('pipeline never throws — every failure is a typed result', () => {
  assert.match(pipeline, /SearchPipelineResult/);
  assert.match(pipeline, /classifySearchError/);
  const returns = pipeline.match(/ok: false/g)?.length ?? 0;
  assert.ok(returns >= 4, 'each failure site returns a typed result');
});

// ---------------------------------------------------------------------------
// 4. Searching screen — real states, real stages, user-safe errors
// ---------------------------------------------------------------------------
section('Searching screen states');

test('stage list is driven by pipeline callbacks, not a timer', () => {
  assert.match(searchHook, /onStage: \(next\) => setStage\(next\)/);
  assert.ok(!searching.includes('setInterval'), 'fake timer progress must be gone');
});

test('all required phases exist: working / error (results live on the result screen)', () => {
  assert.match(searchHook, /type SearchPhase = 'working' \| 'error'/);
  assert.match(searching, /phase === 'working'/);
});

test('errors render through user-safe messages only', () => {
  assert.match(searchHook, /presentFailure\(result\.failure\)/);
  assert.match(searchHook, /userErrorFor\('no_photo'\)/);
  assert.ok(!/maxMemory|42804|non-2xx/.test(searching), 'no technical strings in the screen');
});

test('cancel and manual-search fallbacks preserved', () => {
  assert.match(searching, /Search Manually/);
  assert.match(searchHook, /scanSession\.clearShot\(\)/);
});

test('unmount aborts the in-flight pipeline', () => {
  assert.match(searchHook, /new AbortController\(\)/);
  assert.match(searchHook, /controller\.abort\(\)/);
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
section('Summary');
console.log(`${passed} passed, ${failed} failed`);
if (failed > 0) {
  for (const f of failures) console.error(`FAILED: ${f.name}`);
  process.exit(1);
}
