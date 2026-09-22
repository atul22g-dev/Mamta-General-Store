/**
 * Embedding pipeline contract tests — guards the requirements that keep
 * Find Product trustworthy after an admin save:
 *
 *   1. The 512-dimension contract (model == DB == RPC), with strict
 *      validation: no truncation, no padding, no non-finite values.
 *   2. pgvector wire-format parsing (PostgREST returns vectors as strings).
 *   3. Search-result mapping (product findable → searchable verdict).
 *   4. Static checks on the pipeline wiring: upload optimizes images,
 *      embed edge enforces the contract before persist, screens verify
 *      searchability, price-only edits never re-embed.
 *
 * Pure logic runs via tests/alias-loader.mjs against the REAL TS modules.
 *
 * Run: node tests/embedding-contract.test.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { register } from 'node:module';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

register(pathToFileURL(path.join(ROOT, 'tests', 'alias-loader.mjs')).href);

const {
  EMBEDDING_DIMENSIONS,
  validateEmbedding,
  parsePgvector,
  formatPgvector,
  isProductInSearchResults,
} = await import(pathToFileURL(path.join(ROOT, 'src/services/embedding-contract.service.ts')).href);

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

// ---------------------------------------------------------------------------
// 1. Dimension contract
// ---------------------------------------------------------------------------
console.log('\nEmbedding dimension contract');

test('contract width is 512 (matches DB vector(512) and the edge engine)', () => {
  assert.equal(EMBEDDING_DIMENSIONS, 512);
  const engine = fs.readFileSync(
    path.join(ROOT, 'supabase/functions/_shared/embedding-engine.ts'),
    'utf8',
  );
  assert.match(engine, /const EMBEDDING_DIMS = 512/);
  const m5 = fs.readFileSync(
    path.join(ROOT, 'supabase/migrations/0005_visual_search.sql'),
    'utf8',
  );
  assert.match(m5, /vector\(512\)/);
});

test('exactly-512 finite vector is valid', () => {
  const vector = Array.from({ length: 512 }, (_, i) => (i % 5) * 0.01 - 0.1);
  const result = validateEmbedding(vector);
  assert.equal(result.valid, true);
  if (result.valid) assert.equal(result.vector.length, 512);
});

test('511 values is invalid — no padding', () => {
  const result = validateEmbedding(Array.from({ length: 511 }, () => 0));
  assert.equal(result.valid, false);
  assert.match(result.reason, /dimension mismatch/);
  assert.match(result.reason, /got 511/);
});

test('513 values is invalid — no truncation', () => {
  const result = validateEmbedding(Array.from({ length: 513 }, () => 0));
  assert.equal(result.valid, false);
  assert.match(result.reason, /got 513/);
});

test('non-array and NaN/Infinity values are invalid', () => {
  assert.equal(validateEmbedding('not a vector').valid, false);
  assert.equal(validateEmbedding(null).valid, false);
  const withNaN = Array.from({ length: 512 }, () => 0);
  withNaN[7] = Number.NaN;
  assert.equal(validateEmbedding(withNaN).valid, false);
  const withInf = Array.from({ length: 512 }, () => 0);
  withInf[100] = Number.POSITIVE_INFINITY;
  assert.equal(validateEmbedding(withInf).valid, false);
});

// ---------------------------------------------------------------------------
// 2. pgvector wire format
// ---------------------------------------------------------------------------
console.log('\npgvector wire format');

test('parses the PostgREST string form "[0.1,0.2,...]" into 512 numbers', () => {
  const vector = Array.from({ length: 512 }, (_, i) => Number((i * 0.001 - 0.25).toFixed(4)));
  const parsed = parsePgvector(`[${vector.join(',')}]`);
  assert.ok(parsed, 'must parse');
  assert.equal(parsed.length, 512);
  assert.ok(parsed.every((n, i) => Math.abs(n - vector[i]) < 1e-9));
});

test('JSON array input parses too (defensive)', () => {
  const parsed = parsePgvector(Array.from({ length: 512 }, () => 0.5));
  assert.ok(parsed);
  assert.equal(parsed.length, 512);
});

test('null/undefined stays null — no embedding is not corrupt', () => {
  assert.equal(parsePgvector(null), null);
  assert.equal(parsePgvector(undefined), null);
});

test('wrong-width or corrupt strings are rejected (no silent fix-up)', () => {
  const short = `[${Array.from({ length: 511 }, () => 0.1).join(',')}]`;
  assert.equal(parsePgvector(short), null);
  assert.equal(parsePgvector('[1,2,not-a-number,4]'), null);
  assert.equal(parsePgvector('garbage'), null);
  assert.equal(parsePgvector('[]'), null);
});

test('formatPgvector round-trips through parsePgvector', () => {
  const vector = Array.from({ length: 512 }, (_, i) => (i % 9) * 0.1 - 0.4);
  const parsed = parsePgvector(formatPgvector(vector));
  assert.deepEqual(parsed, vector);
});

// ---------------------------------------------------------------------------
// 3. Searchability verdict
// ---------------------------------------------------------------------------
console.log('\nSearchability verdict');

test('product present in RPC results → searchable with its similarity', () => {
  const check = isProductInSearchResults('p1', [
    { product_id: 'other', similarity: 0.99 },
    { product_id: 'p1', similarity: 0.42 },
  ]);
  assert.equal(check.searchable, true);
  assert.equal(check.similarity, 0.42);
});

test('product absent from RPC results → not searchable, clear reason', () => {
  const check = isProductInSearchResults('p1', [{ product_id: 'other', similarity: 0.99 }]);
  assert.equal(check.searchable, false);
  assert.equal(check.similarity, null);
  assert.match(check.reason, /does not return this product/);
});

test('empty RPC result → not searchable', () => {
  const check = isProductInSearchResults('p1', []);
  assert.equal(check.searchable, false);
});

// ---------------------------------------------------------------------------
// 4. Pipeline wiring (static source checks)
// ---------------------------------------------------------------------------
console.log('\nPipeline wiring');

const upload = fs.readFileSync(path.join(ROOT, 'src/services/product.service.ts'), 'utf8');
const edge = fs.readFileSync(
  path.join(ROOT, 'supabase/functions/embed-product-image/index.ts'),
  'utf8',
);
const add = fs.readFileSync(path.join(ROOT, 'src/hooks/use-admin-product-form.ts'), 'utf8');
const edit = fs.readFileSync(path.join(ROOT, 'src/hooks/use-admin-product-form.ts'), 'utf8');
const optimization = fs.readFileSync(
  path.join(ROOT, 'src/services/image.service.ts'),
  'utf8',
);
const optimizer = fs.readFileSync(
  path.join(ROOT, 'src/utils/image-optimizer.ts'),
  'utf8',
);

test('upload optimizes the image BEFORE upload (root-cause fix for the memory crash)', () => {
  assert.match(upload, /optimizeImageUri\(localUri\)/);
  const optimizeFirst = upload.indexOf('optimizeImageUri(localUri)');
  const readBytes = upload.indexOf('readImageBytes(optimizedUri)');
  assert.ok(optimizeFirst >= 0 && readBytes > optimizeFirst, 'optimization must precede byte read');
});

test('optimization caps the longest edge at 1024 px and re-encodes JPEG', () => {
  assert.match(optimizer, /MAX_EDGE_PX = 1024/);
  assert.match(optimization, /SaveFormat\.JPEG/);
  assert.match(upload, /contentType: 'image\/jpeg'/);
});

test('embed edge validates the 512 contract BEFORE persisting anything', () => {
  const gate = edge.indexOf('Contract gate');
  const persist = edge.indexOf('Persist embeddings concurrently');
  assert.ok(gate >= 0 && persist > gate, 'contract gate must run before persistence');
  assert.match(edge, /vector\.length === EMBEDDING_DIMENSIONS/);
  assert.match(edge, /Number\.isFinite/);
  assert.ok(
    !/update\(\{ embedding: vectors\[index\] \}\)/.test(edge),
    'raw provider vectors must not be persisted directly',
  );
});

test('the admin pipeline verifies searchability through the REAL RPC after embedding', () => {
  assert.match(add, /verifyProductSearchable\(/);
  assert.match(edit, /verifyProductSearchable\(/);
  assert.match(
    fs.readFileSync(path.join(ROOT, 'src/services/embedding.service.ts'), 'utf8'),
    /visual_search_matches/,
  );
});

test('price-only edit does NOT regenerate embeddings unnecessarily', () => {
  // Window on the metadata-only branch: verify first, heal only if guarded.
  const checkIdx = edit.indexOf('verifyProductEmbedding(');
  assert.ok(checkIdx >= 0, 'price-only path verifies stored embeddings first');
  const window = edit.slice(checkIdx, checkIdx + 700);
  const guardIdx = window.indexOf('validEmbedding === null');
  const genIdx = window.indexOf('generateProductEmbedding(');
  if (genIdx >= 0) {
    assert.ok(guardIdx >= 0 && guardIdx < genIdx, 'heal must be guarded by missing/corrupt check');
  }
});

test('failures clear the embedding banner and never fake success', () => {
  // The hook reports through patch({ embeddingStatus: null }).
  const failureCount = (add.match(/embeddingStatus: null/g) ?? []).length;
  assert.ok(failureCount >= 2, 'every failure path must clear the banner');
});

test('edge errors are read from FunctionsHttpError.context (real message, not non-2xx)', () => {
  const service = fs.readFileSync(
    path.join(ROOT, 'src/services/embedding.service.ts'),
    'utf8',
  );
  assert.match(service, /context instanceof Response/);
  assert.match(service, /console\.error\(/);
});

test('searchability probe bypasses the threshold (tests machinery, not self-similarity)', () => {
  const service = fs.readFileSync(
    path.join(ROOT, 'src/services/embedding.service.ts'),
    'utf8',
  );
  assert.match(service, /match_threshold: -1/);
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  for (const f of failures) console.error(`FAILED: ${f.name}`);
  process.exit(1);
}
