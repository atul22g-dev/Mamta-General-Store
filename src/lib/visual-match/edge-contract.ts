/**
 * Wire contract of the `visual-match` Edge Function (see
 * supabase/functions/visual-match/index.ts). Kept in one place so the
 * app-side parser and the function can evolve against a named type.
 */

/** One raw matcher candidate as sent by the edge function. */
export type EdgeMatchCandidate = {
  product_id: string;
  /** Cosine similarity in [0, 1] (higher = more similar). */
  similarity: number;
};

/** Successful edge-function response. */
export type EdgeMatchResponse = {
  /** 'identified' when the top similarity ≥ the function's threshold. */
  status: 'identified' | 'uncertain';
  /** Cosine similarity of the best candidate (0 when none). */
  confidence: number;
  /** The threshold the function used for its decision. */
  threshold: number;
  candidates: EdgeMatchCandidate[];
};

/** Error body of the edge function (non-2xx or internal failure). */
export type EdgeMatchError = {
  error: string;
};

/** Validates an unknown payload as an EdgeMatchResponse. Returns null when the shape is wrong. */
export function parseEdgeMatchResponse(payload: unknown): EdgeMatchResponse | null {
  if (!payload || typeof payload !== 'object') return null;
  const raw = payload as Record<string, unknown>;

  const status = raw.status;
  if (status !== 'identified' && status !== 'uncertain') return null;

  const confidence = raw.confidence;
  const threshold = raw.threshold;
  if (typeof confidence !== 'number' || !Number.isFinite(confidence)) return null;
  if (typeof threshold !== 'number' || !Number.isFinite(threshold)) return null;

  if (!Array.isArray(raw.candidates)) return null;
  const candidates: EdgeMatchCandidate[] = [];
  for (const entry of raw.candidates) {
    if (!entry || typeof entry !== 'object') return null;
    const item = entry as Record<string, unknown>;
    if (typeof item.product_id !== 'string' || item.product_id.length === 0) return null;
    if (typeof item.similarity !== 'number' || !Number.isFinite(item.similarity)) return null;
    candidates.push({ product_id: item.product_id, similarity: item.similarity });
  }

  return { status, confidence, threshold, candidates };
}
