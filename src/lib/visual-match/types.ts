/**
 * Contract for the future visual matching system.
 *
 * The flow is intentionally minimal: the shop-floor user captures ONE
 * product photo; the service matches it against the catalog and returns
 * ranked candidates. No barcode scanning, no continuous camera analysis —
 * a single image in, a single result out.
 */

/** One ranked catalog candidate returned by the matcher. */
export type MatchCandidate = {
  productId: string;
  name: string;
  imageUrl?: string | null;
  /** 0–1 similarity score, if the backend provides one. */
  score?: number;
};

/** What a screen hands to the service after capture. */
export type MatchRequest = {
  /** Local URI of the single captured photo (file:// on device). */
  imageUri: string;
  /** When the photo was taken (epoch ms), for telemetry/dedup. */
  capturedAt?: number;
};

/** Immediate response to a submission attempt. */
export type MatchSubmission = {
  status: 'submitted' | 'not-configured';
  /** Opaque id to poll with `fetchMatchResult` when status is 'submitted'. */
  requestId?: string;
};

/** Polled outcome of a submitted request. */
export type MatchResult = {
  requestId: string;
  status: 'pending' | 'matched' | 'no-match' | 'failed';
  candidates: MatchCandidate[];
  error?: string;
};

export type ServiceResult<T> = { ok: true; data: T } | { ok: false; error: string };
