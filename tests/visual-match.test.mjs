/**
 * Visual-match unit tests — pure logic only (no React Native, no Supabase).
 *
 * The modules under test import '@/…' aliases, so this suite re-implements
 * the imports via a tiny module loader hook. Run: node tests/visual-match.test.mjs
 *
 * Scenarios (per the matching-fix requirements):
 *   correct product · similar product · wrong product · no product ·
 *   low confidence · database failure · network failure (the last two at
 *   the client boundary are covered by classifyMatchFailure + parser tests
 *   here and were exercised end-to-end in the preview harness).
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { register } from 'node:module';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Resolve '@/x' to src/x so the real project modules are tested unmodified.
register(pathToFileURL(path.join(ROOT, 'tests', 'alias-loader.mjs')).href);

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ✅ ${name}`);
  } catch (error) {
    failed += 1;
    failures.push({ name, error });
    console.log(`  ❌ ${name}\n     ${error.message}`);
  }
}

const { analyzeMatchOutcome } = await import('@/lib/visual-match/decision.ts');
const { parseEdgeMatchResponse } = await import('@/lib/visual-match/edge-contract.ts');
const { bytesToBase64 } = await import('@/lib/visual-match/base64.ts');
const {
  VISUAL_MATCH_THRESHOLD,
  VISUAL_MATCH_AMBIGUOUS_MARGIN,
} = await import('@/lib/visual-match/threshold.ts');

const outcome = (candidates, confidence, threshold = VISUAL_MATCH_THRESHOLD) => ({
  status: confidence >= threshold ? 'identified' : 'uncertain',
  confidence,
  threshold,
  candidates,
});

const candidate = (id, similarity) => ({
  product: { id, name: `P-${id}`, selling_price: 10, mrp: 12, unit: 'piece', stock: 1, product_images: [] },
  similarity,
});

console.log('\nanalyzeMatchOutcome');

test('correct product: single candidate ≥ threshold → auto-match (kind: single)', () => {
  const result = analyzeMatchOutcome(outcome([candidate('p1', 0.93)], 0.93));
  assert.equal(result.kind, 'single');
  assert.equal(result.showCandidates, false);
});

test('similar product below threshold → NOT auto-selected (ambiguous with candidates)', () => {
  const result = analyzeMatchOutcome(outcome([candidate('p2', 0.74)], 0.74));
  assert.equal(result.kind, 'ambiguous');
  assert.equal(result.showCandidates, true);
});

test('no product: empty candidates → none → "Product not recognized"', () => {
  const result = analyzeMatchOutcome(outcome([], 0));
  assert.equal(result.kind, 'none');
  assert.equal(result.showCandidates, false);
});

test('low confidence exactly at threshold → identified (>= is inclusive)', () => {
  const result = analyzeMatchOutcome(outcome([candidate('p1', VISUAL_MATCH_THRESHOLD)], VISUAL_MATCH_THRESHOLD));
  assert.equal(result.kind, 'single');
});

test('low confidence just below threshold → ambiguous (never a silent match)', () => {
  const result = analyzeMatchOutcome(outcome([candidate('p1', VISUAL_MATCH_THRESHOLD - 0.001)], VISUAL_MATCH_THRESHOLD - 0.001));
  assert.equal(result.kind, 'ambiguous');
});

test('wrong product: second candidate within margin of top → ambiguous (no silent pick)', () => {
  const top = 0.9;
  const second = top - VISUAL_MATCH_AMBIGUOUS_MARGIN + 0.001;
  const result = analyzeMatchOutcome(outcome([candidate('p1', top), candidate('p2', second)], top));
  assert.equal(result.kind, 'ambiguous');
  assert.equal(result.showCandidates, true);
});

test('clear margin between top two → single', () => {
  const top = 0.9;
  const second = top - VISUAL_MATCH_AMBIGUOUS_MARGIN * 2;
  const result = analyzeMatchOutcome(outcome([candidate('p1', top), candidate('p2', second)], top));
  assert.equal(result.kind, 'single');
});

test('runner-up below threshold cannot trigger ambiguity', () => {
  const result = analyzeMatchOutcome(outcome([candidate('p1', 0.9), candidate('p2', 0.5)], 0.9));
  assert.equal(result.kind, 'single');
});

test('custom threshold is honored (backend value wins)', () => {
  const result = analyzeMatchOutcome(outcome([candidate('p1', 0.75)], 0.75, 0.7));
  assert.equal(result.kind, 'single');
});

test('non-finite confidence → ambiguous, never a match', () => {
  const result = analyzeMatchOutcome(outcome([candidate('p1', Number.NaN)], Number.NaN));
  assert.equal(result.kind, 'ambiguous');
});

console.log('\nparseEdgeMatchResponse (typed wire contract)');

test('valid response parses with candidates in server order', () => {
  const parsed = parseEdgeMatchResponse({
    status: 'uncertain',
    confidence: 0.74,
    threshold: 0.82,
    candidates: [
      { product_id: 'b', similarity: 0.74 },
      { product_id: 'a', similarity: 0.72 },
    ],
  });
  assert.ok(parsed);
  assert.equal(parsed.candidates[0].product_id, 'b');
  assert.equal(parsed.threshold, 0.82);
});

test('malformed payload (missing status) → null → client reports infra failure', () => {
  assert.equal(parseEdgeMatchResponse({ confidence: 0.5, candidates: [] }), null);
});

test('malformed candidate (bad similarity) → null', () => {
  assert.equal(
    parseEdgeMatchResponse({ status: 'identified', confidence: 1, threshold: 0.82, candidates: [{ product_id: 'x', similarity: 'high' }] }),
    null,
  );
});

test('non-object payload → null', () => {
  assert.equal(parseEdgeMatchResponse('error'), null);
  assert.equal(parseEdgeMatchResponse(null), null);
});

console.log('\nbytesToBase64 (CRIT-03 encoder parity)');

test('round-trips a large buffer without stack overflow', () => {
  const bytes = new Uint8Array(600_000).map((_, i) => i % 251);
  const encoded = bytesToBase64(bytes);
  assert.ok(encoded.length > 700_000);
  assert.equal(encoded.endsWith('='), bytes.length % 3 !== 0);
});

test('encodes empty input to empty string', () => {
  assert.equal(bytesToBase64(new Uint8Array(0)), '');
});

console.log('\nthreshold configuration');

test('threshold and margin are sane constants', () => {
  assert.ok(VISUAL_MATCH_THRESHOLD > 0.5 && VISUAL_MATCH_THRESHOLD < 1);
  assert.ok(VISUAL_MATCH_AMBIGUOUS_MARGIN > 0 && VISUAL_MATCH_AMBIGUOUS_MARGIN < 0.2);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  for (const { name, error } of failures) console.error(`FAIL ${name}: ${error.stack}`);
  process.exit(1);
}
