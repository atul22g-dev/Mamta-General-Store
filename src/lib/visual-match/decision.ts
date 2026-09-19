import type { VisualMatchOutcome } from '@/lib/visual-match/types-client';

/**
 * Pure decision logic — deterministic UI state machine for a match outcome.
 * Dependency-free so it can be unit-tested without Supabase or React Native.
 */
export function analyzeMatchOutcome(
  outcome: VisualMatchOutcome,
  LOW_CONFIDENCE = 0.82,
): {
  kind: 'single' | 'ambiguous' | 'none';
  showCandidates: boolean;
} {
  if (outcome.status === 'no-match' || outcome.candidates.length === 0) {
    return { kind: 'none', showCandidates: false };
  }

  if (outcome.status === 'identified' && outcome.confidence >= LOW_CONFIDENCE) {
    return { kind: 'single', showCandidates: false };
  }

  // Uncertain or below-threshold: show multiple possible products.
  return { kind: 'ambiguous', showCandidates: true };
}
