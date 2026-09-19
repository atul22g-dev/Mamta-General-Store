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
};

/** Final screen-ready verdict. */
export type VisualMatchOutcome = {
  status: 'identified' | 'uncertain' | 'no-match';
  /** Best similarity, if any candidate exists. */
  confidence: number;
  /** Threshold the backend used for its decision. */
  threshold: number;
  candidates: MatchCandidateView[];
};
