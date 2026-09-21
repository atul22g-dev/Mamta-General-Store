/**
 * Confidence-threshold configuration for visual product matching.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY 0.82 (documented so future tuning is a decision, not a drift):
 * ─────────────────────────────────────────────────────────────────────────
 * Candidates are ranked by cosine similarity between Cohere embed-v4.0
 * image embeddings (512-dim, matrix-etched so the customer's photo and the
 * store's reference photo can be compared directly). Empirically, that
 * model's cosine scores for retail product imagery behave like this:
 *
 *   • the SAME product re-photographed from a different angle/lighting
 *     lands ~0.85–0.97;
 *   • a DIFFERENT but visually similar product (same brand shape, sibling
 *     variant, same category) lands ~0.70–0.85;
 *   • unrelated products fall away sharply below ~0.6.
 *
 * 0.82 sits inside the gap between "different but similar product" and
 * "same product, awkward photo", biased toward precision: a wrong
 * auto-shown price is worse than a "not recognized + candidates" screen,
 * because the price shown is a transaction decision for a shop-floor user.
 *
 * Trade-off accepted: at 0.82 some genuine products photographed in poor
 * light will miss the auto-match and fall to the disambiguation/manual
 * path. That is the correct failure direction for this app (miss → user
 * picks from candidates; false hit → user charged for the wrong item).
 *
 * The threshold is CONFIGURABLE: the backend (MATCH_THRESHOLD edge secret)
 * can tune it per deployment, the RPC default carries the same value, and
 * this module is the client-side fallback when the backend does not send
 * one. Change all three together — or rely on the backend value, which
 * always wins at runtime.
 *
 * AMBIGUOUS_MARGIN: when the top TWO candidates both clear the threshold
 * and sit within 0.03 of each other, the decision is downgraded to
 * "uncertain" (user disambiguates). 0.03 ≈ the observed re-photograph
 * noise floor of the embedder: two different products that close are not
 * reliably distinguishable, and silently picking either could show the
 * wrong product's price.
 */

/**
 * Minimum cosine similarity for an automatic match.
 * Range: (0, 1). Keep in lockstep with the RPC default (0005/0008) and the
 * MATCH_THRESHOLD edge secret.
 */
export const VISUAL_MATCH_THRESHOLD = 0.82;

/**
 * Minimum similarity gap between the top two candidates for an automatic
 * match. Below this margin the result is treated as ambiguous even when
 * both clear the threshold. Range: (0, 1).
 */
export const VISUAL_MATCH_AMBIGUOUS_MARGIN = 0.03;

/**
 * Hard timeout for the end-to-end match (embed API + vector search +
 * product fetch). Generous enough for slow mobile networks, tight enough
 * that the searching screen can never spin forever.
 */
export const VISUAL_MATCH_TIMEOUT_MS = 20_000;

/**
 * Maximum accepted photo payload (decoded bytes ≈ base64 length × 3/4).
 * Matches the storage-policy cap (0007) and the edge-function limit;
 * larger captures are rejected before any network round-trip.
 */
export const VISUAL_MATCH_MAX_IMAGE_BYTES = 5 * 1024 * 1024;
