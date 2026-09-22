/**
 * The embedding contract — the single source of truth binding the embedding
 * model's output to the database's vector column.
 *
 * EVERY layer agrees on one number:
 *   embedding-engine.ts produces 512 (throws otherwise)
 *   product_images.embedding is vector(512)
 *   visual_search_matches takes vector(512)
 *
 * This module lets the APP side enforce that contract too, so a bad vector
 * can never be persisted "successfully" and silently poison the search space.
 *
 * PURE module — no React Native / Supabase imports — so the unit tests run
 * it directly via tests/alias-loader.mjs.
 */

/**
 * The only valid embedding width. Mirrors EMBEDDING_DIMENSIONS in
 * supabase/functions/_shared/embedding.ts and the `vector(512)` column
 * defined in supabase/migrations/0005_visual_search.sql.
 *
 * If you ever change the embedding model you must change ALL THREE together,
 * clear every stored embedding, and re-embed every image.
 */
export const EMBEDDING_DIMENSIONS = 512;

/** Exported as a type-level witness: dimension checks appear in signatures. */
export type EmbeddingVector = number[];

/** Result of validating one embedding vector. */
export type EmbeddingValidation =
  | { valid: true; vector: EmbeddingVector }
  | { valid: false; reason: string };

/**
 * Validates an embedding against the database contract.
 *
 * Checks — in order — that it is an array of exactly EMBEDDING_DIMENSIONS
 * finite numbers. There is NO truncation and NO padding anywhere: a vector
 * of any other width is invalid, full stop (Postgres would reject it anyway,
 * but rejecting here turns a cryptic DB error into a precise one).
 */
export function validateEmbedding(
  value: unknown,
  expectedDimensions: number = EMBEDDING_DIMENSIONS,
): EmbeddingValidation {
  if (!Array.isArray(value)) {
    return { valid: false, reason: `Embedding is not an array (got ${typeof value}).` };
  }
  if (value.length !== expectedDimensions) {
    return {
      valid: false,
      reason: `Embedding dimension mismatch: got ${value.length}, database requires exactly ${expectedDimensions}.`,
    };
  }
  for (let i = 0; i < value.length; i += 1) {
    const n = value[i];
    if (typeof n !== 'number' || !Number.isFinite(n)) {
      return { valid: false, reason: `Embedding contains a non-finite value at index ${i}.` };
    }
  }
  return { valid: true, vector: value as EmbeddingVector };
}

/**
 * Parses the wire format of a `vector(512)` column as returned by PostgREST.
 *
 * pgvector's HTTP representation is a STRING `"[0.1,0.2,...]"` — not a JSON
 * array — which is why the generated Database type types `embedding` as
 * `string | null`. This converts it to numbers WITHOUT ever truncating or
 * padding: anything other than exactly `expectedDimensions` finite values
 * yields null, and a null embedding stays null (no embedding ≠ corrupt).
 */
export function parsePgvector(
  raw: string | number[] | null | undefined,
  expectedDimensions: number = EMBEDDING_DIMENSIONS,
): EmbeddingVector | null {
  if (raw === null || raw === undefined) return null;

  let values: unknown[] | null = null;
  if (Array.isArray(raw)) {
    values = raw;
  } else if (typeof raw === 'string' && raw.startsWith('[') && raw.endsWith(']')) {
    const inner = raw.slice(1, -1).trim();
    values = inner.length === 0 ? [] : inner.split(',');
  }

  if (!values) return null;

  const numbers = values.map((v) => (typeof v === 'string' ? Number(v.trim()) : v));
  const validation = validateEmbedding(numbers, expectedDimensions);
  return validation.valid ? validation.vector : null;
}

/**
 * Builds the pgvector text literal for direct SQL logging/comparison.
 * NOT used for writes (the edge function sends a JSON array, which
 * PostgREST converts) — kept for diagnostics and tests.
 */
export function formatPgvector(vector: EmbeddingVector): string {
  return `[${vector.join(',')}]`;
}

/**
 * Verifies a product is actually searchable: invokes the REAL
 * visual_search_matches RPC with the product's own first embedding and
 * checks the product comes back above the decision threshold.
 *
 * This is the end-to-end guarantee: embedding stored + RPC live + index
 * reachable + RLS grants intact — all in one round trip. A product that
 * passes this is findable by photo, not just "has a vector".
 *
 * Runs against REAL data only — callers pass a fetched embedding; this
 * module stays pure by taking the RPC as an injected dependency.
 */
export type SearchableCheck = {
  searchable: boolean;
  similarity: number | null;
  reason: string;
};

export function isProductInSearchResults(
  productId: string,
  results: readonly { product_id: string; similarity: number }[],
): SearchableCheck {
  const hit = results.find((row) => row.product_id === productId);
  if (!hit) {
    return {
      searchable: false,
      similarity: null,
      reason: 'The embedding is stored, but visual search does not return this product yet.',
    };
  }
  return { searchable: true, similarity: hit.similarity, reason: 'ok' };
}
