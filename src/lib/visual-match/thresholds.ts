/**
 * ============================================================================
 * VISUAL MATCH CONFIGURATION — the ONE file to edit thresholds & limits
 * ============================================================================
 * All visual-match decision parameters live here. Change them HERE — the
 * whole app follows. No other file to touch.
 *
 * ▼ HOW TO TUNE
 *   1. Edit the values below.
 *   2. The edge function reads its own copy from environment secrets.
 *   3. The client reads these values directly.
 *   4. Restart the dev server (`npx expo start -c`) — done.
 *
 * ▼ THRESHOLD SEMANTICS
 *   - MAIN_MATCH_THRESHOLD: minimum cosine similarity to auto-show a product
 *     as "identified". Higher = more precise but may miss valid matches.
 *   - SIMILAR_PRODUCT_THRESHOLD: minimum cosine similarity to show as a
 *     "visually similar" alternative. Lower than MAIN to show options.
 *   - AMBIGUOUS_MARGIN: when top TWO candidates are within this margin,
 *     downgrade to "uncertain" (user disambiguates).
 *
 * ▼ RESULT LIMITS
 *   - MAX_SIMILAR_PRODUCTS: maximum similar products shown in UI.
 *   - EDGE_CANDIDATE_LIMIT: how many candidates the edge function returns
 *     (higher = better grouping but slower).
 *
 * ▼ EDGE FUNCTION SECRETS
 *   The edge function reads from environment secrets with these names:
 *   - MAIN_MATCH_THRESHOLD (default: 0.90)
 *   - SIMILAR_PRODUCT_THRESHOLD (default: 0.75)
 *   - AMBIGUOUS_MARGIN (default: 0.03)
 *   - EDGE_CANDIDATE_LIMIT (default: 20)
 *   Set via: supabase secrets set MAIN_MATCH_THRESHOLD=0.90
 * ============================================================================
 */

// ---------------------------------------------------------------------------
// Thresholds
// ---------------------------------------------------------------------------

/**
 * Minimum cosine similarity for a product to be shown as "identified".
 * Range: (0, 1). Default: 0.90.
 *
 * Trade-off: higher = fewer false positives but more "not recognized" results.
 * For MobileCLIP-S0 with retail imagery:
 *   - same product, different angle/lighting: ~0.85–0.97
 *   - similar product (same category, different item): ~0.70–0.85
 *   - unrelated products: < 0.60
 */
export const MAIN_MATCH_THRESHOLD = 0.90;

/**
 * Minimum cosine similarity for a product to appear as "visually similar".
 * Range: (0, 1). Default: 0.75.
 *
 * Must be LOWER than MAIN_MATCH_THRESHOLD. Products above this but below
 * MAIN are shown as alternatives when the top match is uncertain.
 */
export const SIMILAR_PRODUCT_THRESHOLD = 0.75;

/**
 * Minimum gap between the top TWO candidates for an automatic match.
 * Below this margin the result is "uncertain" even if both clear threshold.
 * Range: (0, 1). Default: 0.03.
 *
 * Prevents showing a price when two products are too close to distinguish
 * reliably — the user disambiguates instead.
 */
export const AMBIGUOUS_MARGIN = 0.03;

// ---------------------------------------------------------------------------
// Result limits
// ---------------------------------------------------------------------------

/**
 * Maximum similar products shown in the UI.
 * The edge function may return more for better grouping; the client trims.
 */
export const MAX_SIMILAR_PRODUCTS = 10;

/**
 * How many image-level candidates the edge function fetches from pgvector.
 * Higher = better product-level grouping but slower query.
 * The edge function deduplicates per product before returning.
 */
export const EDGE_CANDIDATE_LIMIT = 20;

// ---------------------------------------------------------------------------
// Timeout and size limits
// ---------------------------------------------------------------------------

/**
 * Hard timeout for the end-to-end match (embed API + vector search +
 * product fetch). Generous enough for slow mobile networks, tight enough
 * that the searching screen can never spin forever.
 */
export const VISUAL_MATCH_TIMEOUT_MS = 20_000;

/**
 * Maximum accepted photo payload (decoded bytes ≈ base64 length × 3/4).
 * Matches the storage-policy cap and the edge-function limit.
 */
export const VISUAL_MATCH_MAX_IMAGE_BYTES = 5 * 1024 * 1024;
