import type { VisualMatchOutcome } from '@/lib/visual-match/types-client';
import {
  MAIN_MATCH_THRESHOLD,
} from '@/lib/visual-match/thresholds';

/**
 * Pure decision logic — deterministic UI state machine for a match outcome.
 * Dependency-free so it can be unit-tested without Supabase or React Native.
 *
 * Decision contract (user requirement, in order):
 *  1. No candidates (nothing in the catalog looked like the photo)
 *     → 'none' → the UI shows "Product not recognized" + Try Again.
 *  2. Main match exists AND passes MAIN_MATCH_THRESHOLD
 *     → 'single' → auto-show the matched product.
 *  3. Similar products exist but no main match
 *     → 'ambiguous' → user disambiguates from similar products.
 *  4. Nothing passes SIMILAR_PRODUCT_THRESHOLD
 *     → 'none' → the UI shows "Product not recognized" + Try Again.
 *
 * "Product not recognized + Try Again" is rendered by the result screen
 * for BOTH 'none' and the below-threshold 'ambiguous' case, per spec;
 * 'ambiguous' additionally offers the ranked candidate list.
 */
export function analyzeMatchOutcome(
  outcome: VisualMatchOutcome,
  thresholds?: { main: number; similar: number; ambiguous_margin: number },
): {
  kind: 'single' | 'ambiguous' | 'none';
  showCandidates: boolean;
} {
  const mainThreshold = thresholds?.main ?? outcome.thresholds?.main ?? MAIN_MATCH_THRESHOLD;

  // No match at all
  if (outcome.status === 'no-match' || outcome.all_candidates.length === 0) {
    return { kind: 'none', showCandidates: false };
  }

  // Main match exists and passes threshold
  if (outcome.main_match && outcome.confidence >= mainThreshold) {
    return { kind: 'single', showCandidates: false };
  }

  // Has similar products but no clear main match
  if (outcome.similar_products.length > 0) {
    return { kind: 'ambiguous', showCandidates: true };
  }

  // Nothing passes the similar threshold
  return { kind: 'none', showCandidates: false };
}
