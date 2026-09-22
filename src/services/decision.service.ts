import type { VisualMatchOutcome } from '@/types/product';
import {
  MAIN_MATCH_THRESHOLD,
} from '@/config/visual-match';

/**
 * Pure decision logic — deterministic UI state machine for a match outcome.
 * Dependency-free so it can be unit-tested without Supabase or React Native.
 *
 * Decision contract (user requirement, in order):
 *  1. Main match exists AND passes MAIN_MATCH_THRESHOLD
 *     → 'single' → auto-show the matched product.
 *  2. Similar products exist but no main match
 *     → 'ambiguous' → user disambiguates from similar products.
 *  3. Nothing at all (nothing in the catalog looked like the photo)
 *     → 'none' → the UI shows "Product not recognized" + Try Again.
 *
 * "Product not recognized + Try Again" is rendered by the result screen
 * for BOTH 'none' and the below-threshold 'ambiguous' case, per spec;
 * 'ambiguous' additionally offers the ranked candidate list.
 *
 * WHY THE MAIN MATCH IS CHECKED FIRST (2026-09-22)
 * ---------------------------------------------------------------------------
 * This function used to treat an empty `all_candidates` as "nothing was
 * found". But the flags are not independent: `similar_products` and
 * `all_candidates` DELIBERATELY EXCLUDE the main match (see the client's
 * dedupe), so when a product is the only thing in the catalog that looks like
 * the photo, the main match is present and every candidate list is empty at
 * the same time. The screen then showed "Product not found" for a photo the
 * backend had just identified with confidence 1.000 — a match that works was
 * reported as a failure. A tiny catalog (one product) hit it every time.
 *
 * So "nothing was found" means no main match AND no candidates of any kind,
 * never "the candidate list is empty".
 */
export function analyzeMatchOutcome(
  outcome: VisualMatchOutcome,
  thresholds?: { main: number; similar: number; ambiguous_margin: number },
): {
  kind: 'single' | 'ambiguous' | 'none';
  showCandidates: boolean;
} {
  const mainThreshold = thresholds?.main ?? outcome.thresholds?.main ?? MAIN_MATCH_THRESHOLD;

  // Main match exists and passes threshold — checked FIRST, because the
  // candidate lists below exclude it and can therefore be empty on a match.
  if (outcome.main_match && outcome.confidence >= mainThreshold) {
    return { kind: 'single', showCandidates: false };
  }

  const candidateCount = outcome.similar_products.length + outcome.all_candidates.length;

  // Nothing was found at all
  if (outcome.status === 'no-match' || candidateCount === 0) {
    return { kind: 'none', showCandidates: false };
  }

  // Candidates exist but none of them clearly dominates
  return { kind: 'ambiguous', showCandidates: true };
}
