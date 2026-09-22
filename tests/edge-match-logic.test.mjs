/**
 * Edge decision-logic tests — executes the REAL
 * supabase/functions/visual-match/index.ts logic in Node:
 *
 *   groupByProduct  — image candidates → per-product best score, sorted
 *   determineMatch  — identified / uncertain / no-match branching
 *   parseStoredEmbedding — pgvector wire-form tolerance
 *
 * The client twin (analyzeMatchOutcome) was already tested in
 * tests/visual-match.test.mjs — but that could never catch a drift between
 * the two implementations. This suite imports the edge file itself, so any
 * divergence between the client contract and the edge behavior fails here.
 *
 * Run: node tests/edge-match-logic.test.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { register } from 'node:module';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// The edge reads Deno.env and calls Deno.serve at import time — shim BEFORE
// the import. serve() must not bind anything; the logic under test is pure.
globalThis.Deno = {
  env: new Map(),
  serve: () => ({ finished: false }),
};

register(pathToFileURL(path.join(ROOT, 'tests', 'edge-match-loader.mjs')).href);

let passed = 0;
let failed = 0;
const failures = [];

async function test(name, fn) {
  try {
    await Promise.resolve().then(fn);
    passed += 1;
    console.log(`  ✅ ${name}`);
  } catch (error) {
    failed += 1;
    failures.push({ name, error });
    console.log(`  ❌ ${name}\n     ${error.message}`);
  }
}

const edge = await import(
  pathToFileURL(path.join(ROOT, 'supabase', 'functions', 'visual-match', 'index.ts')).href
);
const { groupByProduct, determineMatch, parseStoredEmbedding } = edge;

console.log('\ngroupByProduct (real edge code)');
const row = (productId, similarity) => ({ product_id: productId, image_id: `${productId}-img`, similarity });

await test('keeps the BEST score per product (never average, never first)', () => {
  const [best] = groupByProduct([row('p1', 0.4), row('p1', 0.9), row('p1', 0.6)]);
  assert.equal(best.best_similarity, 0.9);
});

await test('groups multiple images into one product entry', () => {
  // Both p1 images clear the 0.55 similar threshold → matching_images = 2.
  const results = groupByProduct([row('p1', 0.60), row('p1', 0.70), row('p2', 0.60)]);
  assert.equal(results.length, 2);
  assert.equal(results.find((p) => p.product_id === 'p1').matching_images, 2);
});

await test('matching_images only counts images at or above the SIMILAR threshold (0.55)', () => {
  const results = groupByProduct([row('p1', 0.30), row('p1', 0.54), row('p1', 0.55), row('p1', 0.80)]);
  const p1 = results.find((p) => p.product_id === 'p1');
  assert.equal(p1.best_similarity, 0.80);
  assert.equal(p1.matching_images, 2, '0.30 and 0.54 are below the similar threshold');
});

await test('results are sorted by best similarity, descending', () => {
  const results = groupByProduct([row('pA', 0.5), row('pB', 0.9), row('pC', 0.7)]);
  assert.deepEqual(results.map((p) => p.product_id), ['pB', 'pC', 'pA']);
});

console.log('\ndetermineMatch (real edge code)');
const product = (id, score) => ({ product_id: id, best_similarity: score, matching_images: 1 });

await test('clear winner ≥ main threshold (0.70) → identified; runner-up below similar (0.55) is dropped', () => {
  const result = determineMatch([product('p1', 0.85), product('p2', 0.50)]);
  assert.equal(result.status, 'identified');
  assert.equal(result.main_match.product_id, 'p1');
  assert.equal(result.similar_products.length, 0, '0.50 is below the similar threshold');
  assert.equal(result.confidence, 0.85);
});

await test('main match plus similar products → identified, main excluded from similar', () => {
  const result = determineMatch([product('p1', 0.85), product('p2', 0.65)]);
  assert.equal(result.status, 'identified');
  assert.equal(result.main_match.product_id, 'p1');
  assert.deepEqual(result.similar_products.map((p) => p.product_id), ['p2']);
});

await test('top product ≥ main threshold but runner-up within AMBIGUOUS_MARGIN → uncertain (never a guess)', () => {
  // 0.85 - 0.84 = 0.01 < 0.03 margin, and the runner-up is itself above main.
  const result = determineMatch([product('p1', 0.85), product('p2', 0.84)]);
  assert.equal(result.status, 'uncertain');
  assert.equal(result.main_match, null);
  assert.equal(result.similar_products.length, 2, 'both ambiguous candidates are offered for disambiguation');
});

await test('runner-up below main threshold does NOT trigger the ambiguity downgrade', () => {
  // 0.85 - 0.72 = 0.13 ≥ margin; the margin rule only applies when BOTH are above main.
  const result = determineMatch([product('p1', 0.85), product('p2', 0.72)]);
  assert.equal(result.status, 'identified');
  assert.equal(result.main_match.product_id, 'p1');
});

await test('top product between similar (0.55) and main (0.70) → uncertain with similar list', () => {
  const result = determineMatch([product('p1', 0.60), product('p2', 0.56)]);
  assert.equal(result.status, 'uncertain');
  assert.equal(result.main_match, null);
  assert.equal(result.similar_products.length, 2);
});

await test('everything below the similar threshold → no-match, empty lists', () => {
  const result = determineMatch([product('p1', 0.40), product('p2', 0.30)]);
  assert.equal(result.status, 'no-match');
  assert.equal(result.main_match, null);
  assert.deepEqual(result.similar_products, []);
});

await test('no candidates at all → no-match with confidence 0', () => {
  const result = determineMatch([]);
  assert.equal(result.status, 'no-match');
  assert.equal(result.confidence, 0);
});

await test('the HANDLER echoes thresholds into the response (determineMatch returns only the decision)', () => {
  // thresholds are attached in the request handler's response assembly —
  // verify the assembly wires the module constants (the real values are
  // checked against the client config in the parity test below).
  const source = fs.readFileSync(path.join(ROOT, 'supabase', 'functions', 'visual-match', 'index.ts'), 'utf8');
  assert.match(source, /thresholds:\s*\{\s*main: MAIN_MATCH_THRESHOLD,\s*similar: SIMILAR_PRODUCT_THRESHOLD,\s*ambiguous_margin: AMBIGUOUS_MARGIN/);
});

await test('similar list is capped at 10', () => {
  const many = Array.from({ length: 15 }, (_, i) => product(`p${i}`, 0.60));
  const result = determineMatch(many);
  assert.equal(result.similar_products.length, 10);
});

console.log('\nparseStoredEmbedding (real edge code)');

await test('accepts the pgvector string wire form', () => {
  const vec = parseStoredEmbedding('[0.1,0.2,0.3]');
  assert.deepEqual(vec, [0.1, 0.2, 0.3]);
});

await test('accepts an array (RPC path) unchanged', () => {
  assert.deepEqual(parseStoredEmbedding([0.5, -0.5]), [0.5, -0.5]);
});

await test('rejects NaN / Infinity / non-numeric entries', () => {
  assert.equal(parseStoredEmbedding('[0.1,not-a-number]'), null);
  assert.equal(parseStoredEmbedding([0.1, Number.NaN]), null);
  assert.equal(parseStoredEmbedding([0.1, Number.POSITIVE_INFINITY]), null);
});

await test('rejects malformed JSON and non-array JSON', () => {
  assert.equal(parseStoredEmbedding('not json at all'), null);
  assert.equal(parseStoredEmbedding('{"a":1}'), null);
  assert.equal(parseStoredEmbedding(42), null);
  assert.equal(parseStoredEmbedding(null), null);
});

console.log('\nclient/edge contract parity');

await test('edge defaults equal the client config the UI renders (drift guard)', async () => {
  const { MAIN_MATCH_THRESHOLD, SIMILAR_PRODUCT_THRESHOLD, AMBIGUOUS_MARGIN } = await import(
    pathToFileURL(path.join(ROOT, 'src', 'config', 'visual-match.ts')).href
  );
  // The edge constants are module-scoped (not exported) — verify their
  // DEFAULTS in the source text equal the client values. `String(0.70)` is
  // "0.7", so the pattern allows a trailing zero before the closing quote.
  const source = fs.readFileSync(path.join(ROOT, 'supabase', 'functions', 'visual-match', 'index.ts'), 'utf8');
  const defaultPattern = (name, value) =>
    new RegExp(`${name} = Number\\(Deno\\.env\\.get\\('${name}'\\) \\?\\? '${String(value).replace('.', '\\.')}0?'\\)`);
  assert.match(source, defaultPattern('MAIN_MATCH_THRESHOLD', MAIN_MATCH_THRESHOLD));
  assert.match(source, defaultPattern('SIMILAR_PRODUCT_THRESHOLD', SIMILAR_PRODUCT_THRESHOLD));
  assert.match(source, defaultPattern('AMBIGUOUS_MARGIN', AMBIGUOUS_MARGIN));
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  for (const f of failures) console.error(`FAILED: ${f.name}`);
  process.exit(1);
}
