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
// Result-tier bands — how confident a match is presented to the user
// ---------------------------------------------------------------------------
// Three presentation tiers, each anchored to the MEASURED score table above
// (tests/image-descriptor.test.mjs — re-run it after changing anything here):
//
//   TIER_LIKELY_MATCH   ≥ 0.83  — the weakest GENUINE re-shot measured 0.83
//                                 and the strongest lookalike 0.29, so the
//                                 bottom of the genuine band is the right
//                                 floor for "Likely match".
//   TIER_SIMILAR_FLOOR  ≥ 0.55  — same floor as SIMILAR_PRODUCT_THRESHOLD:
//                                 above it a product may appear as a similar
//                                 alternative, never as a confident answer.
//                                 (The measured clip case, 0.64, lands here:
//                                 offered, not identified.)
//   TIER_RELATED_FLOOR  ≥ 0.15  — below "Similar" but NOT dropped: a
//                                 "Related product" band. Anchored between
//                                 the strongest unrelated/noise photo
//                                 (measured 0.12) and the two measured
//                                 lookalike groups (0.21 / 0.29) so a
//                                 different-colour variant or a similar-
//                                 looking product becomes a tap-able
//                                 suggestion instead of a dead "no match"
//                                 — without ever claiming to be a match.
//   below 0.15                 — DROPPED from results entirely. It may still
//                                 be visible in the catalog by name; a photo
//                                 score that low is noise, not evidence.
//
// The bands must satisfy: TIER_SIMILAR_FLOOR ≤ TIER_LIKELY_MATCH ≤
// MAIN_MATCH_THRESHOLD. MAIN_MATCH_THRESHOLD (0.70) decides AUTO-SHOW
// behavior; TIER_LIKELY_MATCH (0.83) decides what the LABEL claims. A 0.72
// auto-show is therefore presented as a strong suggestion with its meter,
// not as an identification claim.
// ---------------------------------------------------------------------------

/**
 * Minimum score to label a result "Likely match" — the strongest wording the
 * UI may use. Range: (0, 1). Default: 0.83 (bottom of the measured genuine
 * re-shot band).
 */
export const TIER_LIKELY_MATCH = 0.83;

/**
 * Minimum score to show ANY result at all. Below this the product is not
 * shown as a match candidate. Range: (0, 1). Default: 0.55 — kept equal to
 * SIMILAR_PRODUCT_THRESHOLD so the similar list and the tier floor agree.
 */
export const TIER_SIMILAR_FLOOR = 0.55;

/**
 * Minimum score to appear as a "Related product" — BELOW the similar band,
 * but still worth a tap when nothing matched better. Anchored in the
 * MEASURED gap: the strongest unrelated/noise photo scored 0.12 and the
 * lookalike groups measured 0.21 and 0.29, so 0.15 keeps noise out while
 * letting colour variants and similar shapes surface honestly.
 * Range: (0, TIER_SIMILAR_FLOOR). Default: 0.15.
 */
export const TIER_RELATED_FLOOR = 0.15;

/** User-facing copy for each presentation tier. */
export type MatchTierName = 'likely_match' | 'similar_product' | 'related_product';

export const MATCH_TIER_LABELS: Record<MatchTierName, string> = {
  likely_match: 'Likely match',
  similar_product: 'Similar product',
  related_product: 'Related product',
};

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
