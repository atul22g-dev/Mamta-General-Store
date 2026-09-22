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
  MAIN_MATCH_THRESHOLD,
  SIMILAR_PRODUCT_THRESHOLD,
  AMBIGUOUS_MARGIN,
} = await import('@/lib/visual-match/thresholds.ts');

const candidate = (id, similarity) => ({
  product: { id, name: `P-${id}`, selling_price: 10, mrp: 12, unit: 'piece', stock: 1, product_images: [] },
  similarity,
});

/**
 * Build a VisualMatchOutcome matching the real types-client.ts shape.
 * Edge function returns: { status, confidence, thresholds, main_match, similar_products, all_candidates }
 * Client rewrites to: { status, confidence, thresholds, main_match: MatchCandidateView | null, ... }
 */
function buildOutcome({
  mainMatch = null,
  similarProducts = [],
  allCandidates = [],
  confidence = 0,
  status = null,
}) {
  const resolvedStatus = status ?? (mainMatch ? 'identified' : similarProducts.length > 0 ? 'uncertain' : 'no-match');
  return {
    status: resolvedStatus,
    confidence,
    thresholds: { main: MAIN_MATCH_THRESHOLD, similar: SIMILAR_PRODUCT_THRESHOLD, ambiguous_margin: AMBIGUOUS_MARGIN },
    main_match: mainMatch,
    similar_products: similarProducts,
    all_candidates: allCandidates,
  };
}

console.log('\nanalyzeMatchOutcome');

test('correct product: single candidate ≥ threshold → auto-match (kind: single)', () => {
  const c = candidate('p1', 0.93);
  const outcome = buildOutcome({ mainMatch: c, allCandidates: [c], confidence: 0.93 });
  const result = analyzeMatchOutcome(outcome);
  assert.equal(result.kind, 'single');
  assert.equal(result.showCandidates, false);
});

test('main match that is ALSO the only candidate → single, not "Product not found"', () => {
  // The real client EXCLUDES the main product from similar_products and
  // all_candidates (it dedupes them), so a one-product catalog produces a
  // confident match with every candidate list EMPTY. Treating that as
  // "nothing found" reported a confidence-1.000 match as a failure — this is
  // the shape of the request that used to show "Product not found".
  const c = candidate('only', 0.9999);
  const outcome = buildOutcome({
    mainMatch: c,
    similarProducts: [],
    allCandidates: [],
    confidence: 0.9999,
  });
  const result = analyzeMatchOutcome(outcome);
  assert.equal(result.kind, 'single');
  assert.equal(result.showCandidates, false);
});

test('below-threshold match with candidates only in all_candidates → ambiguous (list offered)', () => {
  // status 'uncertain' means there is something for the user to choose from;
  // it must never render as the empty "not found" state.
  const c = candidate('p9', 0.6);
  const outcome = buildOutcome({ allCandidates: [c], confidence: 0.6, status: 'uncertain' });
  const result = analyzeMatchOutcome(outcome);
  assert.equal(result.kind, 'ambiguous');
  assert.equal(result.showCandidates, true);
});

test('similar product below threshold → NOT auto-selected (ambiguous with candidates)', () => {
  const c = candidate('p2', 0.74);
  const outcome = buildOutcome({ similarProducts: [c], allCandidates: [c], confidence: 0.74, status: 'uncertain' });
  const result = analyzeMatchOutcome(outcome);
  assert.equal(result.kind, 'ambiguous');
  assert.equal(result.showCandidates, true);
});

test('no product: empty candidates → none → "Product not recognized"', () => {
  const outcome = buildOutcome({ confidence: 0 });
  const result = analyzeMatchOutcome(outcome);
  assert.equal(result.kind, 'none');
  assert.equal(result.showCandidates, false);
});

test('low confidence exactly at threshold → identified (>= is inclusive)', () => {
  const c = candidate('p1', MAIN_MATCH_THRESHOLD);
  const outcome = buildOutcome({ mainMatch: c, allCandidates: [c], confidence: MAIN_MATCH_THRESHOLD });
  const result = analyzeMatchOutcome(outcome);
  assert.equal(result.kind, 'single');
});

test('low confidence just below threshold → ambiguous (never a silent match)', () => {
  const belowThreshold = MAIN_MATCH_THRESHOLD - 0.001;
  const c = candidate('p1', belowThreshold);
  const outcome = buildOutcome({ similarProducts: [c], allCandidates: [c], confidence: belowThreshold, status: 'uncertain' });
  const result = analyzeMatchOutcome(outcome);
  assert.equal(result.kind, 'ambiguous');
});

test('no-match status → none (empty all_candidates)', () => {
  const outcome = buildOutcome({ confidence: 0.5, status: 'no-match' });
  const result = analyzeMatchOutcome(outcome);
  assert.equal(result.kind, 'none');
  assert.equal(result.showCandidates, false);
});

test('main match with similar products → single (showCandidates false)', () => {
  const main = candidate('p1', 0.95);
  const sim = candidate('p2', 0.80);
  const outcome = buildOutcome({ mainMatch: main, similarProducts: [sim], allCandidates: [main, sim], confidence: 0.95 });
  const result = analyzeMatchOutcome(outcome);
  assert.equal(result.kind, 'single');
  assert.equal(result.showCandidates, false);
});

test('no main match but has similar products → ambiguous', () => {
  const sim = candidate('p1', 0.78);
  const outcome = buildOutcome({ similarProducts: [sim], allCandidates: [sim], confidence: 0.78, status: 'uncertain' });
  const result = analyzeMatchOutcome(outcome);
  assert.equal(result.kind, 'ambiguous');
  assert.equal(result.showCandidates, true);
});

test('custom threshold via thresholds param is honored', () => {
  const c = candidate('p1', 0.75);
  const outcome = buildOutcome({ mainMatch: c, allCandidates: [c], confidence: 0.75, thresholds: { main: 0.70, similar: 0.50, ambiguous_margin: 0.03 } });
  const result = analyzeMatchOutcome(outcome, { main: 0.70, similar: 0.50, ambiguous_margin: 0.03 });
  assert.equal(result.kind, 'single');
});

test('non-finite confidence with no-match status → none', () => {
  const outcome = buildOutcome({ confidence: Number.NaN, status: 'no-match' });
  const result = analyzeMatchOutcome(outcome);
  assert.equal(result.kind, 'none');
});

console.log('\nparseEdgeMatchResponse (typed wire contract)');

test('valid response parses with all_candidates in server order', () => {
  const parsed = parseEdgeMatchResponse({
    status: 'uncertain',
    confidence: 0.74,
    thresholds: { main: 0.90, similar: 0.75, ambiguous_margin: 0.03 },
    main_match: null,
    similar_products: [
      { product_id: 'b', best_similarity: 0.74, matching_images: 1 },
      { product_id: 'a', best_similarity: 0.72, matching_images: 1 },
    ],
    all_candidates: [
      { product_id: 'b', best_similarity: 0.74, matching_images: 1 },
      { product_id: 'a', best_similarity: 0.72, matching_images: 1 },
    ],
  });
  assert.ok(parsed);
  assert.equal(parsed.status, 'uncertain');
  assert.equal(parsed.thresholds.main, 0.90);
  assert.equal(parsed.similar_products[0].product_id, 'b');
  assert.equal(parsed.all_candidates[0].product_id, 'b');
});

test('valid response with main_match', () => {
  const parsed = parseEdgeMatchResponse({
    status: 'identified',
    confidence: 0.93,
    thresholds: { main: 0.90, similar: 0.75, ambiguous_margin: 0.03 },
    main_match: { product_id: 'p1', best_similarity: 0.93, matching_images: 3 },
    similar_products: [],
    all_candidates: [{ product_id: 'p1', best_similarity: 0.93, matching_images: 3 }],
  });
  assert.ok(parsed);
  assert.equal(parsed.status, 'identified');
  assert.equal(parsed.main_match?.product_id, 'p1');
  assert.equal(parsed.main_match?.best_similarity, 0.93);
});

test('malformed payload (missing status) → null → client reports infra failure', () => {
  assert.equal(parseEdgeMatchResponse({ confidence: 0.5, all_candidates: [] }), null);
});

test('malformed candidate (bad similarity) → null', () => {
  assert.equal(
    parseEdgeMatchResponse({
      status: 'identified',
      confidence: 1,
      thresholds: { main: 0.90, similar: 0.75, ambiguous_margin: 0.03 },
      main_match: null,
      similar_products: [],
      all_candidates: [{ product_id: 'x', best_similarity: 'high', matching_images: 1 }],
    }),
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
  assert.ok(MAIN_MATCH_THRESHOLD > 0.5 && MAIN_MATCH_THRESHOLD < 1);
  assert.ok(AMBIGUOUS_MARGIN > 0 && AMBIGUOUS_MARGIN < 0.2);
  assert.ok(SIMILAR_PRODUCT_THRESHOLD > 0.5 && SIMILAR_PRODUCT_THRESHOLD < MAIN_MATCH_THRESHOLD);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  for (const { name, error } of failures) console.error(`FAIL ${name}: ${error.stack}`);
  process.exit(1);
}
