/**
 * Visual search ranking tests — the presentation contract:
 *
 *   1. Candidates are de-duplicated per product (strongest image wins) and
 *      sorted by similarity, descending.
 *   2. Tier bands come from CONFIG (thresholds.ts), not magic numbers, and
 *      sit inside the MEASURED score gap (tests/image-descriptor.test.mjs).
 *   3. The primary product is promoted ONLY from a likely-match top score;
 *      a medium/low score is a similar product with an honest label —
 *      never presented as the product the user photographed.
 *   4. The result screen routes ALL candidates through the ranking and
 *      renders primary vs similar distinctly.
 *
 * Pure logic runs against the REAL TS modules via tests/alias-loader.mjs.
 *
 * Run: node tests/visual-search-ranking.test.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { register } from 'node:module';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

register(pathToFileURL(path.join(ROOT, 'tests', 'alias-loader.mjs')).href);

const { rankCandidates, tierForScore } = await import(
  pathToFileURL(path.join(ROOT, 'src', 'services', 'ranking.service.ts')).href
);
const {
  TIER_LIKELY_MATCH,
  TIER_SIMILAR_FLOOR,
  TIER_RELATED_FLOOR,
  MATCH_TIER_LABELS,
  MAIN_MATCH_THRESHOLD,
  SIMILAR_PRODUCT_THRESHOLD,
} = await import(
  pathToFileURL(path.join(ROOT, 'src', 'config', 'visual-match.ts')).href
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

/** Minimal candidate factory. */
function cand(id, name, similarity) {
  return {
    product: {
      id,
      name,
      product_images: [{ id: `img-${id}`, image_url: `https://cdn.test/${id}.jpg` }],
      selling_price: 45,
      mrp: 60,
    },
    similarity,
  };
}

// ---------------------------------------------------------------------------
// 1. Config sanity — bands exist, are ordered, and sit in the measured gap
// ---------------------------------------------------------------------------
section('Tier configuration (tested, not arbitrary)');

test('bands are configured values in valid order', () => {
  assert.ok(TIER_SIMILAR_FLOOR > 0 && TIER_SIMILAR_FLOOR < 1);
  assert.ok(TIER_LIKELY_MATCH > TIER_SIMILAR_FLOOR, 'likely band must sit above the floor');
  assert.ok(TIER_LIKELY_MATCH <= MAIN_MATCH_THRESHOLD + 0.2,
    'likely band must stay near the auto-show threshold');
  assert.equal(TIER_SIMILAR_FLOOR, SIMILAR_PRODUCT_THRESHOLD,
    'tier floor and similar threshold must agree by design');
});

test('bands sit inside the MEASURED score gap (calibration guard)', () => {
  // Measured score groups from tests/image-descriptor.test.mjs:
  const weakestGenuineReshot = 0.83;
  const strongestLookalike = 0.29;
  const strongestUnrelated = 0.12;
  const clippedPhoto = 0.64;

  // "Likely match" must be reachable by the weakest genuine re-shot…
  assert.ok(TIER_LIKELY_MATCH <= weakestGenuineReshot,
    `TIER_LIKELY_MATCH (${TIER_LIKELY_MATCH}) must be ≤ weakest genuine re-shot (${weakestGenuineReshot})`);
  // …and unreachable by any lookalike.
  assert.ok(TIER_LIKELY_MATCH > strongestLookalike,
    `TIER_LIKELY_MATCH (${TIER_LIKELY_MATCH}) must be > strongest lookalike (${strongestLookalike})`);

  // The similar floor must admit the clipped-photo case (offer, not identify)
  // and reject everything unrelated.
  assert.ok(TIER_SIMILAR_FLOOR <= clippedPhoto,
    'clipped photos (0.64) should be offered as similar products');
  assert.ok(TIER_SIMILAR_FLOOR > strongestUnrelated,
    `floor must exclude unrelated photos (≤ ${strongestUnrelated})`);

  // The related floor must sit BETWEEN unrelated noise and the lookalike
  // groups, so colour variants (0.29) and same-colour/other-shape (0.21)
  // surface as "Related product" instead of a dead no-match — while noise
  // (≤ 0.12) stays out.
  assert.ok(TIER_RELATED_FLOOR > strongestUnrelated,
    `related floor (${TIER_RELATED_FLOOR}) must exclude unrelated noise (≤ ${strongestUnrelated})`);
  assert.ok(TIER_RELATED_FLOOR < 0.21,
    `related floor (${TIER_RELATED_FLOOR}) must admit the same-colour/other-shape lookalike (0.21)`);
  assert.ok(TIER_RELATED_FLOOR < TIER_SIMILAR_FLOOR,
    'related band must sit below the similar band');
});

test('tier labels use the required wording', () => {
  assert.equal(MATCH_TIER_LABELS.likely_match, 'Likely match');
  assert.equal(MATCH_TIER_LABELS.similar_product, 'Similar product');
  assert.equal(MATCH_TIER_LABELS.related_product, 'Related product');
});

// ---------------------------------------------------------------------------
// 2. tierForScore
// ---------------------------------------------------------------------------
section('tierForScore');

test('0.83+ is a likely match, below is a similar product', () => {
  assert.equal(tierForScore(1.0), 'likely_match');
  assert.equal(tierForScore(TIER_LIKELY_MATCH), 'likely_match');
  assert.equal(tierForScore(0.70), 'similar_product');
  assert.equal(tierForScore(0.55), 'similar_product');
  assert.equal(tierForScore(0.29), 'related_product', 'colour-variant score is a related product');
  assert.equal(tierForScore(0.21), 'related_product', 'same-colour/other-shape score is a related product');
  assert.equal(tierForScore(0.12), 'related_product', 'tierForScore never upgrades; the ranker drops it');
});

// ---------------------------------------------------------------------------
// 3. rankCandidates — sorting, dedupe, tiers
// ---------------------------------------------------------------------------
section('rankCandidates');

test('sorts by similarity descending across all candidates', () => {
  const result = rankCandidates([
    cand('a', 'Alpha', 0.6),
    cand('b', 'Beta', 0.95),
    cand('c', 'Gamma', 0.75),
  ]);
  const scores = [result.primary, ...result.similar]
    .filter(Boolean)
    .map((r) => r.similarity);
  assert.deepEqual(scores, [...scores].sort((x, y) => y - x));
  assert.equal(result.primary.product.id, 'b');
});

test('high similarity → primary with "Likely match" label', () => {
  const result = rankCandidates([cand('a', 'Alpha', 0.93)]);
  assert.ok(result.primary);
  assert.equal(result.primary.tier, 'likely_match');
  assert.equal(result.primary.tierLabel, 'Likely match');
  assert.deepEqual(result.similar, []);
});

test('MEDIUM similarity top score → NO primary, similar list only', () => {
  const result = rankCandidates([
    cand('m', 'Medium Match', 0.64),
    cand('l', 'Lower', 0.58),
  ]);
  assert.equal(result.primary, null, 'a 0.64 must never be presented as the answer');
  assert.equal(result.similar.length, 2);
  assert.equal(result.similar[0].tierLabel, 'Similar product');
  assert.equal(result.hasResults, true);
});

test('at-threshold boundary: exactly TIER_LIKELY_MATCH promotes, floor passes', () => {
  const at = rankCandidates([cand('a', 'Alpha', TIER_LIKELY_MATCH)]);
  assert.ok(at.primary, 'exactly at the likely band promotes');
  const atFloor = rankCandidates([cand('b', 'Beta', TIER_SIMILAR_FLOOR)]);
  assert.equal(atFloor.primary, null);
  assert.equal(atFloor.similar.length, 1, 'at-floor result is still shown as similar');
});

test('low similarity (< related floor) is dropped entirely', () => {
  const result = rankCandidates([
    cand('noise', 'Noise', 0.12),
    cand('unrelated', 'Unrelated', 0.05),
  ]);
  assert.equal(result.primary, null);
  assert.equal(result.similar.length, 0);
  assert.equal(result.related.length, 0);
  assert.equal(result.hasResults, false);
});

test('colour-variant score (0.29) surfaces as a Related product, not dropped', () => {
  const result = rankCandidates([cand('v', 'Green Ball Variant', 0.29)]);
  assert.equal(result.primary, null, 'a lookalike is never the answer');
  assert.equal(result.similar.length, 0, 'a lookalike never claims the Similar band');
  assert.equal(result.related.length, 1);
  assert.equal(result.related[0].tier, 'related_product');
  assert.equal(result.related[0].tierLabel, 'Related product');
  assert.equal(result.hasResults, true, 'the user gets tap-able suggestions, not a dead end');
});

test('same-colour/other-shape score (0.21) also surfaces as Related', () => {
  const result = rankCandidates([cand('s', 'Yellow Box', 0.21)]);
  assert.equal(result.related.length, 1);
  assert.equal(result.hasResults, true);
});

test('primary/related split: likely match first, related excluded from primary', () => {
  const result = rankCandidates([
    cand('top', 'Top', 0.95),
    cand('lookalike', 'Lookalike', 0.29),
  ]);
  assert.ok(result.primary);
  assert.equal(result.primary.product.id, 'top');
  assert.equal(result.similar.length, 0);
  assert.equal(result.related.length, 1);
  assert.ok(!result.related.some((r) => r.product.id === 'top'));
});

test('duplicate product rows collapse to the strongest image', () => {
  const result = rankCandidates([
    cand('a', 'Alpha', 0.6),
    cand('a', 'Alpha', 0.9),
    cand('a', 'Alpha', 0.7),
  ]);
  assert.equal(result.similar.length + (result.primary ? 1 : 0), 1);
  assert.ok(result.primary, 'the 0.9 row should win and promote');
  assert.equal(result.primary.similarity, 0.9);
});

test('empty input → no results, no crash', () => {
  const result = rankCandidates([]);
  assert.equal(result.primary, null);
  assert.equal(result.similar.length, 0);
  assert.equal(result.hasResults, false);
});

test('primary is excluded from the similar list', () => {
  const result = rankCandidates([
    cand('top', 'Top', 0.95),
    cand('other', 'Other', 0.7),
  ]);
  assert.ok(!result.similar.some((r) => r.product.id === 'top'));
  assert.equal(result.similar.length, 1);
});

test('results carry id, name, price and image per requirement', () => {
  const result = rankCandidates([cand('a', 'Alpha', 0.93)]);
  const p = result.primary.product;
  assert.equal(p.id, 'a');
  assert.equal(p.name, 'Alpha');
  assert.equal(p.selling_price, 45);
  assert.ok(p.product_images[0].image_url);
  assert.equal(typeof result.primary.similarity, 'number');
});

// ---------------------------------------------------------------------------
// 4. Result screen wiring (static checks)
// ---------------------------------------------------------------------------
section('Result screen wiring');

const resultScreen = fs.readFileSync(
  path.join(ROOT, 'src/app/find-product/result.tsx'),
  'utf8',
);

test('screen routes ALL candidates through rankCandidates', () => {
  assert.match(resultScreen, /rankCandidates\(all\)/);
  assert.match(resultScreen, /\.\.\.outcome\.similar_products/);
  assert.match(resultScreen, /\.\.\.outcome\.all_candidates/);
});

test('primary promotion requires the likely-match tier', () => {
  assert.match(resultScreen, /ranked\.primary/);
  assert.match(resultScreen, /featured = \{ product: ranked\.primary\.product/);
});

test('tier labels come from config, no hardcoded 0.9 bands remain', () => {
  assert.ok(!/matchTier|scoreBadgeVariant/.test(resultScreen),
    'old hardcoded tier helpers must be gone');
  assert.ok(!/>= 0\.9/.test(resultScreen), 'no hardcoded 0.9 band');
  assert.match(resultScreen, /tierLabel/);
});

test('manual pick renders without a similarity claim', () => {
  assert.match(resultScreen, /candidate: null, source: 'catalog'/);
});

test('no-results path still distinguishes ambiguous candidates from true no-match', () => {
  assert.match(resultScreen, /decision\?\.kind !== 'ambiguous'/);
});

test('related products render as their own honest section (never a match claim)', () => {
  assert.match(resultScreen, /RelatedProductsSection/);
  assert.match(resultScreen, /Related products/);
  assert.match(resultScreen, /related: RankedCandidate\[\]/);
  assert.match(resultScreen, /ranked\.related/);
  assert.ok(!/> 0\.8/.test(resultScreen), 'no hardcoded bands in the screen');
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
