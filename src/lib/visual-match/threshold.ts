/**
 * Confidence-threshold configuration for visual product matching.
 *
 * This file is kept for backward compatibility. All threshold values
 * are now defined in ./thresholds.ts — import from there instead.
 *
 * @deprecated Import from '@/lib/visual-match/thresholds' instead.
 */
export {
  MAIN_MATCH_THRESHOLD as VISUAL_MATCH_THRESHOLD,
  SIMILAR_PRODUCT_THRESHOLD as VISUAL_MATCH_SIMILAR_THRESHOLD,
  AMBIGUOUS_MARGIN as VISUAL_MATCH_AMBIGUOUS_MARGIN,
  VISUAL_MATCH_TIMEOUT_MS,
  VISUAL_MATCH_MAX_IMAGE_BYTES,
} from '@/lib/visual-match/thresholds';
