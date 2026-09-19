/**
 * Smoke tests for the visual-match decision logic (pure, no Supabase).
 * Run: npx tsx scripts/visual-match-smoke.ts
 */
import assert from 'node:assert/strict';

import { analyzeMatchOutcome } from '../src/lib/visual-match/decision';
import type { VisualMatchOutcome } from '../src/lib/visual-match/types-client';

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void): void {
  try {
    fn();
    passed++;
    console.log(`✓ ${name}`);
  } catch (error) {
    failed++;
    console.error(`✗ ${name}\n  ${(error as Error).message}`);
  }
}

// Minimal candidate stub — decision logic only reads `candidates.length`.
const stubCandidate = { product: { id: 'p1' }, similarity: 0.9 } as never;

const outcome = (overrides: Partial<VisualMatchOutcome>): VisualMatchOutcome => ({
  status: 'identified',
  confidence: 0.9,
  threshold: 0.82,
  candidates: [stubCandidate],
  ...overrides,
});

// --- analyzeMatchOutcome ---
test('high-confidence single candidate → single', () => {
  const result = analyzeMatchOutcome(
    outcome({ status: 'identified', confidence: 0.93, threshold: 0.82 }),
  );
  assert.equal(result.kind, 'single');
  assert.equal(result.showCandidates, false);
});

test('confidence below threshold → ambiguous with candidates', () => {
  const result = analyzeMatchOutcome(
    outcome({ status: 'uncertain', confidence: 0.74, threshold: 0.82 }),
  );
  assert.equal(result.kind, 'ambiguous');
  assert.equal(result.showCandidates, true);
});

test('exact threshold boundary → single', () => {
  const result = analyzeMatchOutcome(
    outcome({ status: 'identified', confidence: 0.82, threshold: 0.82 }),
  );
  assert.equal(result.kind, 'single');
});

test('just below threshold → ambiguous', () => {
  const result = analyzeMatchOutcome(
    outcome({ status: 'uncertain', confidence: 0.819, threshold: 0.82 }),
  );
  assert.equal(result.kind, 'ambiguous');
  assert.equal(result.showCandidates, true);
});

test('no-match → none', () => {
  const result = analyzeMatchOutcome(
    outcome({ status: 'no-match', confidence: 0, candidates: [] }),
  );
  assert.equal(result.kind, 'none');
  assert.equal(result.showCandidates, false);
});

test('zero candidates → none regardless of status', () => {
  const result = analyzeMatchOutcome(outcome({ candidates: [] }));
  assert.equal(result.kind, 'none');
});

test('candidates present but status uncertain → ambiguous (never claims identified)', () => {
  const result = analyzeMatchOutcome(
    outcome({ status: 'uncertain', confidence: 0.7, threshold: 0.82 }),
  );
  assert.equal(result.kind, 'ambiguous');
  assert.equal(result.showCandidates, true);
});

test('custom (stricter) threshold is respected', () => {
  // Backend threshold 0.86; similarity 0.85 → NOT identified even though
  // the default 0.82 would have passed it.
  const strict = analyzeMatchOutcome(
    outcome({ status: 'identified', confidence: 0.85, threshold: 0.86 }),
    0.86,
  );
  assert.equal(strict.kind, 'ambiguous');
  assert.equal(strict.showCandidates, true);
});

// --- result-screen price invariant (result.tsx structural checks) ---
test('result screen shows prices only from product rows, never guesses', async () => {
  const fs = await import('node:fs');
  const source = fs.readFileSync('src/app/find-product/result.tsx', 'utf8');

  // Price formatting is applied only to product fields.
  assert.match(source, /formatPrice\(product\.selling_price\)/);
  assert.match(source, /formatPrice\(product\.mrp\)/);
  // No literal price strings (₹ followed by digits) hard-coded anywhere.
  assert.doesNotMatch(source, /₹\s?\d/, 'no hard-coded rupee amounts in the screen');
  // Candidate rows must not display prices before selection.
  const candidateRow = source.match(/function CandidateRow\([\s\S]*?\n\}/)?.[0] ?? '';
  assert.ok(candidateRow.length > 0, 'CandidateRow exists');
  assert.doesNotMatch(candidateRow, /formatPrice|selling_price/, 'no price in candidate rows');
});

// --- manual fallback wiring ---
test('manual fallback: prompt + Search Manually reach the search screen', async () => {
  const fs = await import('node:fs');
  const result = fs.readFileSync('src/app/find-product/result.tsx', 'utf8');
  const searching = fs.readFileSync('src/app/find-product/searching.tsx', 'utf8');
  const search = fs.readFileSync('src/app/find-product/search.tsx', 'utf8');

  assert.match(result, /Can’t identify this product\?/);
  assert.match(result, /Search Manually/);
  assert.match(result, /\/find-product\/search/);
  assert.match(searching, /Search Manually/, 'error state offers manual search');

  // Search screen selects via the session (price comes from DB on result).
  assert.match(search, /setManualResult/);
  assert.doesNotMatch(search, /₹\s?\d/, 'no hard-coded prices in search rows');

  // Result screen renders the manual pick without inventing a score.
  assert.match(result, /getManualResult/);
});

// --- price invariant (structural check on the client module) ---
test('edge response type carries NO price fields; products come from the DB', async () => {
  const fs = await import('node:fs');
  const source = fs.readFileSync('src/lib/visual-match/client.ts', 'utf8');

  // The edge-function response shape must not contain any price-like field.
  const interfaceMatch = source.match(/interface EdgeMatchResponse \{[\s\S]*?\}/);
  assert.ok(interfaceMatch, 'EdgeMatchResponse interface exists');
  assert.doesNotMatch(interfaceMatch[0], /price/i, 'no price in the AI response shape');

  // Products (with prices) are fetched from Supabase by id.
  assert.match(source, /\.from\('products'\)/, 'products read from the DB');
  assert.match(source, /\.in\('id', productIds\)/, 'fetched by matched ids');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
