import type { VisualMatchOutcome } from '@/lib/visual-match/types-client';
import { VISUAL_MATCH_AMBIGUOUS_MARGIN, VISUAL_MATCH_THRESHOLD } from '@/lib/visual-match/threshold';

/**
 * Pure decision logic — deterministic UI state machine for a match outcome.
 * Dependency-free so it can be unit-tested without Supabase or React Native.
 *
 * Decision contract (user requirement, in order):
 *  1. No candidates (nothing in the catalog looked like the photo)
 *     → 'none' → the UI shows "Product not recognized" + Try Again.
 *  2. Top similarity ≥ threshold AND (single candidate OR clear margin
 *     over the runner-up) → 'single' → auto-show the matched product.
 *  3. Top similarity ≥ threshold but the runner-up is within
 *     AMBIGUOUS_MARGIN → 'ambiguous' → user disambiguates; the system
 *     never silently picks between two near-identical scores.
 *  4. Top similarity < threshold → 'ambiguous' with candidates → the
 *     closest existing product is NOT selected just because it exists.
 *
 * "Product not recognized + Try Again" is rendered by the result screen
 * for BOTH 'none' and the below-threshold 'ambiguous' case, per spec;
 * 'ambiguous' additionally offers the ranked candidate list.
 */
export function analyzeMatchOutcome(
  outcome: VisualMatchOutcome,
  threshold: number = outcome.threshold || VISUAL_MATCH_THRESHOLD,
  ambiguousMargin: number = VISUAL_MATCH_AMBIGUOUS_MARGIN,
): {
  kind: 'single' | 'ambiguous' | 'none';
  showCandidates: boolean;
} {
  if (outcome.status === 'no-match' || outcome.candidates.length === 0) {
    return { kind: 'none', showCandidates: false };
  }

  const confidence = outcome.confidence;
  if (!Number.isFinite(confidence) || confidence < threshold) {
    return { kind: 'ambiguous', showCandidates: true };
  }

  // Two candidates that are equally plausible must not be silently
  // resolved — the price difference between them could be significant.
  if (
    outcome.candidates.length > 1 &&
    outcome.candidates[1].similarity >= threshold &&
    confidence - outcome.candidates[1].similarity < ambiguousMargin
  ) {
    return { kind: 'ambiguous', showCandidates: true };
  }

  return { kind: 'single', showCandidates: false };
}
