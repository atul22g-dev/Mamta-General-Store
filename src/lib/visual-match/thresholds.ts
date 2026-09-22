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
 * ▼ WHAT THE SCORE MEANS (this is not a plain cosine)
 *   A photo is compared with a catalog image on TWO independent signals:
 *     shape  — where the edges are, and what the product's outline is
 *     colour — which colours are present, and how they are laid out
 *   The score is the WEAKER of the two, so a threshold reads as:
 *     "shape AND colour both agreed at least this well".
 *
 *   That is deliberate. With a single summed score, one signal pays for the
 *   other and both of these were accepted at 0.82:
 *     - a green ball  against a yellow ball  (perfect outline, wrong colour)
 *     - a yellow box  against a yellow ball  (perfect colour, wrong shape)
 *   Scored on two signals they measure 0.29 and 0.21, while a genuine re-shot
 *   of the same product measures 0.83–1.00.
 *
 * ▼ MEASURED SCORES (tests/image-descriptor.test.mjs, per-product fixtures)
 *   same product, re-shot (brighter/dimmer/closer/further/off-centre/
 *     lower resolution/re-encoded/back of it)       0.83 – 1.00
 *   same colour, different shape (box vs ball)                0.21
 *   same shape, different colour (green vs yellow ball)       0.29
 *   other products, text, noise, blank photo                  0.00 – 0.12
 *   same product CLIPPED by the frame (a real limit: the outline is
 *     cut off, so it is offered as a candidate, not identified)        0.64
 *
 *   Re-run that test after changing anything below; it fails if the
 *   thresholds stop sitting inside the measured gap between those groups.
 *
 * ▼ THRESHOLD SEMANTICS
 *   - MAIN_MATCH_THRESHOLD: minimum score to auto-show a product as
 *     "identified". Higher = more precise but may miss valid matches.
 *   - SIMILAR_PRODUCT_THRESHOLD: minimum score to show as a "visually
 *     similar" alternative. Lower than MAIN to show options.
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
 *   - MAIN_MATCH_THRESHOLD (default: 0.70)
 *   - SIMILAR_PRODUCT_THRESHOLD (default: 0.55)
 *   - AMBIGUOUS_MARGIN (default: 0.03)
 *   - EDGE_CANDIDATE_LIMIT (default: 20)
 *   - EDGE_CANDIDATE_COSINE_FLOOR (default: 0.30) — see EDGE_CANDIDATE_LIMIT.
 *     This one is a RETRIEVAL floor on the pgvector cosine, not a decision:
 *     it only decides which candidates reach the two-signal rule above, so it
 *     is deliberately far below both thresholds.
 *   Set via: supabase secrets set MAIN_MATCH_THRESHOLD=0.70
 * ============================================================================
 */

// ---------------------------------------------------------------------------
// Thresholds
// ---------------------------------------------------------------------------

/**
 * Minimum score (the weaker of shape/colour) to show a product as "identified".
 * Range: (0, 1). Default: 0.70.
 *
 * Trade-off: higher = fewer false positives but more "not recognized" results.
 * Calibrated on the measured table above: the weakest genuine re-shot scored
 * 0.83 and the strongest lookalike 0.29, so 0.70 sits inside that gap with
 * room on both sides for the differences a real photo adds (background,
 * lighting, blur).
 */
export const MAIN_MATCH_THRESHOLD = 0.70;

/**
 * Minimum score (the weaker of shape/colour) to appear as "visually similar".
 * Range: (0, 1). Default: 0.55.
 *
 * Must be LOWER than MAIN_MATCH_THRESHOLD. Products above this but below
 * MAIN are shown as alternatives when the top match is uncertain — which
 * includes a photo that cut the product off (measured 0.64): it is offered
 * for the user to confirm rather than silently identified.
 */
export const SIMILAR_PRODUCT_THRESHOLD = 0.55;

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
