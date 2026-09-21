import type { ProductWithImages } from '@/lib/products/product-service';

/**
 * Client-side match outcome types. Type-only module — safe to import from
 * dependency-free logic files (types are erased at runtime).
 */

/** One candidate joined from the matcher + the products table. */
export type MatchCandidateView = {
  product: ProductWithImages;
  /** Cosine similarity (0–1) from the vector search. */
  similarity: number;
  /** Number of reference images that matched above the similar threshold. */
  matching_images?: number;
};

/** Final screen-ready verdict. */
export type VisualMatchOutcome = {
  /**
   * 'identified': main product passes MAIN_MATCH_THRESHOLD with clear margin.
   * 'uncertain': candidates exist but none clearly dominate, or below threshold.
   * 'no-match': nothing passes SIMILAR_PRODUCT_THRESHOLD.
   */
  status: 'identified' | 'uncertain' | 'no-match';
  /** Best product-level similarity (0–1). */
  confidence: number;
  /** Thresholds used for the decision. */
  thresholds: {
    main: number;
    similar: number;
    ambiguous_margin: number;
  };
  /** The main matched product (null if status is 'no-match' or 'uncertain'). */
  main_match: MatchCandidateView | null;
  /** Visually similar products (excludes main_match, sorted by similarity). */
  similar_products: MatchCandidateView[];
  /** All product-level candidates (for client-side filtering if needed). */
  all_candidates: MatchCandidateView[];
};
