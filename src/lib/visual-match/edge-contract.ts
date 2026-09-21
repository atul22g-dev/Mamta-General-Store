/**
 * Wire contract of the `visual-match` Edge Function (see
 * supabase/functions/visual-match/index.ts). Kept in one place so the
 * app-side parser and the function can evolve against a named type.
 */

/** One product-level result from the edge function. */
export type EdgeProductResult = {
  product_id: string;
  /** Best similarity score across all images of this product. */
  best_similarity: number;
  /** Number of images that matched above the similar threshold. */
  matching_images: number;
};

/** Thresholds used by the edge function. */
export type EdgeThresholds = {
  main: number;
  similar: number;
  ambiguous_margin: number;
};

/** Successful edge-function response. */
export type EdgeMatchResponse = {
  /**
   * 'identified': main product passes MAIN_MATCH_THRESHOLD.
   * 'uncertain': candidates exist but none clearly dominate.
   * 'no-match': nothing passes SIMILAR_PRODUCT_THRESHOLD.
   */
  status: 'identified' | 'uncertain' | 'no-match';
  /** Best product-level similarity (0–1). */
  confidence: number;
  /** Thresholds used for the decision. */
  thresholds: EdgeThresholds;
  /** The main matched product (null if status is 'no-match' or 'uncertain'). */
  main_match: EdgeProductResult | null;
  /** Visually similar products (excludes main_match, sorted by similarity). */
  similar_products: EdgeProductResult[];
  /** All product-level candidates (for client-side filtering if needed). */
  all_candidates: EdgeProductResult[];
};

/** Error body of the edge function (non-2xx or internal failure). */
export type EdgeMatchError = {
  error: string;
};

/** Validates an unknown payload as an EdgeMatchResponse. Returns null when the shape is wrong. */
export function parseEdgeMatchResponse(payload: unknown): EdgeMatchResponse | null {
  if (!payload || typeof payload !== 'object') return null;
  const raw = payload as Record<string, unknown>;

  // Validate status
  const status = raw.status;
  if (status !== 'identified' && status !== 'uncertain' && status !== 'no-match') return null;

  // Validate confidence
  const confidence = raw.confidence;
  if (typeof confidence !== 'number' || !Number.isFinite(confidence)) return null;

  // Validate thresholds
  if (!raw.thresholds || typeof raw.thresholds !== 'object') return null;
  const thresholds = raw.thresholds as Record<string, unknown>;
  if (typeof thresholds.main !== 'number' || !Number.isFinite(thresholds.main)) return null;
  if (typeof thresholds.similar !== 'number' || !Number.isFinite(thresholds.similar)) return null;
  if (typeof thresholds.ambiguous_margin !== 'number' || !Number.isFinite(thresholds.ambiguous_margin)) return null;

  // Validate main_match (can be null)
  let mainMatch: EdgeProductResult | null = null;
  if (raw.main_match !== null && raw.main_match !== undefined) {
    if (typeof raw.main_match !== 'object') return null;
    const main = raw.main_match as Record<string, unknown>;
    if (typeof main.product_id !== 'string' || main.product_id.length === 0) return null;
    if (typeof main.best_similarity !== 'number' || !Number.isFinite(main.best_similarity)) return null;
    if (typeof main.matching_images !== 'number' || !Number.isFinite(main.matching_images)) return null;
    mainMatch = {
      product_id: main.product_id,
      best_similarity: main.best_similarity,
      matching_images: main.matching_images,
    };
  }

  // Validate similar_products array
  if (!Array.isArray(raw.similar_products)) return null;
  const similarProducts: EdgeProductResult[] = [];
  for (const entry of raw.similar_products) {
    if (!entry || typeof entry !== 'object') return null;
    const item = entry as Record<string, unknown>;
    if (typeof item.product_id !== 'string' || item.product_id.length === 0) return null;
    if (typeof item.best_similarity !== 'number' || !Number.isFinite(item.best_similarity)) return null;
    if (typeof item.matching_images !== 'number' || !Number.isFinite(item.matching_images)) return null;
    similarProducts.push({
      product_id: item.product_id,
      best_similarity: item.best_similarity,
      matching_images: item.matching_images,
    });
  }

  // Validate all_candidates array
  if (!Array.isArray(raw.all_candidates)) return null;
  const allCandidates: EdgeProductResult[] = [];
  for (const entry of raw.all_candidates) {
    if (!entry || typeof entry !== 'object') return null;
    const item = entry as Record<string, unknown>;
    if (typeof item.product_id !== 'string' || item.product_id.length === 0) return null;
    if (typeof item.best_similarity !== 'number' || !Number.isFinite(item.best_similarity)) return null;
    if (typeof item.matching_images !== 'number' || !Number.isFinite(item.matching_images)) return null;
    allCandidates.push({
      product_id: item.product_id,
      best_similarity: item.best_similarity,
      matching_images: item.matching_images,
    });
  }

  return {
    status,
    confidence,
    thresholds: {
      main: thresholds.main,
      similar: thresholds.similar,
      ambiguous_margin: thresholds.ambiguous_margin,
    },
    main_match: mainMatch,
    similar_products: similarProducts,
    all_candidates: allCandidates,
  };
}
