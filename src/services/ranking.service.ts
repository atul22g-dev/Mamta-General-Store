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
 *     thresholds.ts — never a magic number here. THREE honest tiers:
 *       likely_match    ≥ TIER_LIKELY_MATCH  (0.83)  — "Likely match"
 *       similar_product ≥ TIER_SIMILAR_FLOOR (0.55)  — "Similar product"
 *       related_product ≥ TIER_RELATED_FLOOR (0.15)  — "Related product"
 *     The related band is anchored to the MEASURED scores: a different-colour
 *     variant measures 0.29 and a same-colour different-shape lookalike 0.21
 *     (both previously DROPPED at the old 0.55 floor → dead "no match");
 *     unrelated noise tops out at 0.12. Below 0.15 remains noise and is
 *     dropped. Nothing below the similar band is ever labelled a match.
 *   • The primary/similar/related split: the PRIMARY product is the top
 *     candidate ONLY when it clears TIER_LIKELY_MATCH. Everything else is
 *     presented as a similar or related product. A medium/low score is never
 *     presented as the answer.
 *
 * Real database results only: this module never invents, pads or re-orders
 * by anything other than the similarity that came back from pgvector.
 */
import {
  TIER_LIKELY_MATCH,
  TIER_SIMILAR_FLOOR,
  TIER_RELATED_FLOOR,
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
  /** User-facing tier copy ("Likely match" / "Similar product" / "Related product"). */
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
  /** Similar-tier candidates (≥ TIER_SIMILAR_FLOOR), best-first, excluding primary. */
  similar: RankedCandidate[];
  /** Related-tier candidates (≥ TIER_RELATED_FLOOR, below similar), best-first. */
  related: RankedCandidate[];
  /** True when at least one candidate cleared TIER_RELATED_FLOOR. */
  hasResults: boolean;
};

/**
 * Decides the presentation tier for one score using the configured bands.
 * Exported for tests and for the result screen's meter labels.
 */
export function tierForScore(similarity: number): MatchTierName {
  if (similarity >= TIER_LIKELY_MATCH) return 'likely_match';
  if (similarity >= TIER_SIMILAR_FLOOR) return 'similar_product';
  if (similarity >= TIER_RELATED_FLOOR) return 'related_product';
  // The caller filters below-floor candidates before ranking; this branch
  // exists so a misconfigured floor can never silently upgrade a weak score.
  return 'related_product';
}

/**
 * Ranks candidates for display.
 *
 * @param candidates product-level candidates (any order, may repeat products)
 * @param options.likelyMatchAt override for tests/experiments (default config)
 * @param options.similarFloorAt override for tests/experiments (default config)
 * @param options.relatedFloorAt override for tests/experiments (default config)
 */
export function rankCandidates(
  candidates: readonly MatchCandidateView[],
  options: {
    likelyMatchAt?: number;
    similarFloorAt?: number;
    relatedFloorAt?: number;
  } = {},
): RankedResult {
  const likelyAt = options.likelyMatchAt ?? TIER_LIKELY_MATCH;
  const similarAt = options.similarFloorAt ?? TIER_SIMILAR_FLOOR;
  const relatedAt = options.relatedFloorAt ?? TIER_RELATED_FLOOR;

  // 1. De-duuplicate per product — strongest image wins — and drop anything
  //    below the configured related floor (that low is noise, not evidence).
  const best = new Map<string, MatchCandidateView>();
  for (const candidate of candidates) {
    if (candidate.similarity < relatedAt) continue;
    const current = best.get(candidate.product.id);
    if (!current || candidate.similarity > current.similarity) {
      best.set(candidate.product.id, candidate);
    }
  }

  // 2. Sort by similarity, descending. Tie-break on name for determinism.
  //    The tier comes from the CONFIGURED bands, in order.
  const ranked: RankedCandidate[] = [...best.values()]
    .sort(
      (a, b) =>
        b.similarity - a.similarity ||
        a.product.name.localeCompare(b.product.name),
    )
    .map((candidate) => {
      const tier: MatchTierName =
        candidate.similarity >= likelyAt
          ? 'likely_match'
          : candidate.similarity >= similarAt
            ? 'similar_product'
            : 'related_product';
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

  // 4. Split the rest by tier — similar first, then related — both excluding
  //    the promoted primary. The related list is the honest home for
  //    colour variants and similar-looking products: tap-able, clearly
  //    labelled, never claimed as a match.
  const similar = ranked.filter(
    (c) => c.tier !== 'related_product' && c.product.id !== primary?.product.id,
  );
  const related = ranked.filter(
    (c) => c.tier === 'related_product' && c.product.id !== primary?.product.id,
  );

  return {
    primary,
    similar,
    related,
    hasResults: ranked.length > 0,
  };
}
