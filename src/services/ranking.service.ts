/**
 * Visual search result ranking — pure, deterministic, fully unit-tested.
 *
 * Takes the client's ranked candidates (already joined with live DB rows and
 * sorted by the edge function) and produces the screen-ready result model:
 *
 *   • ONE flat candidate list per product, sorted by similarity (desc),
 *     de-duplicated per product (an image-level list can contain several
 *     rows of the same product — the strongest image wins).
 *   • A confidence tier per candidate from the CONFIGURED bands in
 *     thresholds.ts — never a magic number here.
 *   • The primary/similar split: the PRIMARY product is the top candidate
 *     ONLY when it clears TIER_LIKELY_MATCH. Everything else is a similar
 *     product. A medium-score product is never presented as the answer.
 *
 * Real database results only: this module never invents, pads or re-orders
 * by anything other than the similarity that came back from pgvector.
 */
import {
  TIER_LIKELY_MATCH,
  TIER_SIMILAR_FLOOR,
  MATCH_TIER_LABELS,
  type MatchTierName,
} from '@/config/visual-match';
import type { MatchCandidateView } from '@/types/product';

/** One ranked result with its presentation tier. */
export type RankedCandidate = {
  product: MatchCandidateView['product'];
  /** Cosine-derived score (0–1) — the weak signal the thresholds compare. */
  similarity: number;
  /** Presentation tier decided by the configured bands. */
  tier: MatchTierName;
  /** User-facing tier copy ("Likely match" / "Similar product"). */
  tierLabel: string;
};

/** The screen-ready ranking. */
export type RankedResult = {
  /**
   * The primary product — ONLY when the top candidate is a likely match.
   * A medium/low top candidate leaves this null: the UI then shows similar
   * products without ever claiming one of them is the requested product.
   */
  primary: RankedCandidate | null;
  /** All other candidates, best-first, capped by the caller's UI limit. */
  similar: RankedCandidate[];
  /** True when at least one candidate cleared TIER_SIMILAR_FLOOR. */
  hasResults: boolean;
};

/**
 * Decides the presentation tier for one score using the configured bands.
 * Exported for tests and for the result screen's meter labels.
 */
export function tierForScore(similarity: number): MatchTierName {
  if (similarity >= TIER_LIKELY_MATCH) return 'likely_match';
  if (similarity >= TIER_SIMILAR_FLOOR) return 'similar_product';
  // The caller filters below-floor candidates before ranking; this branch
  // exists so a misconfigured floor can never silently upgrade a weak score.
  return 'similar_product';
}

/**
 * Ranks candidates for display.
 *
 * @param candidates product-level candidates (any order, may repeat products)
 * @param options.likelyMatchAt override for tests/experiments (default config)
 * @param options.similarFloorAt override for tests/experiments (default config)
 */
export function rankCandidates(
  candidates: readonly MatchCandidateView[],
  options: {
    likelyMatchAt?: number;
    similarFloorAt?: number;
  } = {},
): RankedResult {
  const likelyAt = options.likelyMatchAt ?? TIER_LIKELY_MATCH;
  const floorAt = options.similarFloorAt ?? TIER_SIMILAR_FLOOR;

  // 1. De-duuplicate per product — strongest image wins — and drop anything
  //    below the configured floor (low similarity is not shown at all).
  const best = new Map<string, MatchCandidateView>();
  for (const candidate of candidates) {
    if (candidate.similarity < floorAt) continue;
    const current = best.get(candidate.product.id);
    if (!current || candidate.similarity > current.similarity) {
      best.set(candidate.product.id, candidate);
    }
  }

  // 2. Sort by similarity, descending. Tie-break on name for determinism.
  const ranked: RankedCandidate[] = [...best.values()]
    .sort(
      (a, b) =>
        b.similarity - a.similarity ||
        a.product.name.localeCompare(b.product.name),
    )
    .map((candidate) => {
      const tier: MatchTierName =
        candidate.similarity >= likelyAt ? 'likely_match' : 'similar_product';
      return {
        product: candidate.product,
        similarity: candidate.similarity,
        tier,
        tierLabel: MATCH_TIER_LABELS[tier],
      };
    });

  // 3. Primary ONLY from a likely-match top candidate — never a medium/low
  //    score presented as "the product you photographed".
  const top = ranked[0];
  const primary =
    top && top.tier === 'likely_match'
      ? top
      : null;

  // 4. Similar = everything that is not the promoted primary.
  const similar = primary ? ranked.slice(1) : ranked;

  return {
    primary,
    similar,
    hasResults: ranked.length > 0,
  };
}
