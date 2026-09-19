import type {
  MatchRequest,
  MatchResult,
  MatchSubmission,
  ServiceResult,
} from '@/lib/visual-match/types';

/**
 * Visual matching service — the seam between the camera flow and the
 * future AI layer.
 *
 * Today this validates the request and reports `not-configured`; the UI
 * treats that as an honest "matching arrives later" state instead of a
 * fake result. When the real system exists (edge function / backend
 * endpoint), only this file changes — no screen or hook edits.
 *
 * Design constraints baked in:
 *  - one photo per request (no video frames, no live analysis);
 *  - no barcode involvement anywhere in the contract.
 */

/** Whether a real matcher is wired up. Flip when the backend lands. */
export const isVisualMatchConfigured = false;

export const VISUAL_MATCH_NOT_CONFIGURED_MESSAGE =
  'Visual matching is not connected yet. Your photo flow is ready — results will appear once the AI layer is enabled.';

/**
 * Submits the captured photo for matching.
 * Returns `not-configured` until a real backend is connected.
 */
export async function submitForMatching(
  request: MatchRequest,
): Promise<ServiceResult<MatchSubmission>> {
  if (!request.imageUri || request.imageUri.trim().length === 0) {
    return { ok: false, error: 'No captured photo was provided.' };
  }

  if (!isVisualMatchConfigured) {
    return { ok: true, data: { status: 'not-configured' } };
  }

  // TODO(visual-match): upload `request.imageUri` to the matching backend
  // (e.g. a Supabase Edge Function) and return { status: 'submitted', requestId }.
  return { ok: true, data: { status: 'not-configured' } };
}

/**
 * Polls the result of a previously submitted request.
 * Returns a `failed` result with the not-configured message until the
 * real matcher exists.
 */
export async function fetchMatchResult(requestId: string): Promise<MatchResult> {
  void requestId;

  if (!isVisualMatchConfigured) {
    return {
      requestId,
      status: 'failed',
      candidates: [],
      error: VISUAL_MATCH_NOT_CONFIGURED_MESSAGE,
    };
  }

  // TODO(visual-match): GET the result by requestId and map candidates.
  return {
    requestId,
    status: 'failed',
    candidates: [],
    error: VISUAL_MATCH_NOT_CONFIGURED_MESSAGE,
  };
}
