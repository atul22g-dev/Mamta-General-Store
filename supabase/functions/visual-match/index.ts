/**
 * visual-match edge function — visual product matching.
 *
 * Flow (the AI NEVER touches prices):
 *   user photo (base64 data URI)
 *     → descriptor via the configured provider (see _shared/embedding.ts:
 *       the pure-JS image descriptor — free, no API key, no model download)
 *     → validate embedding dimensions + finite values
 *     → pgvector cosine over product_images.embedding as a CANDIDATE FILTER
 *     → re-score each candidate on shape and colour separately, keeping the
 *       weaker signal (see compareDescriptors) — a summed cosine lets a
 *       correct outline pay for a wrong colour, and vice versa
 *     → group results by product (best score per product)
 *     → determine main match (above MAIN_MATCH_THRESHOLD)
 *     → determine similar products (above SIMILAR_PRODUCT_THRESHOLD)
 *     → return structured response
 *     → (the app re-reads the products table for the CURRENT selling_price)
 *
 * No price field exists anywhere in this function's response by design.
 *
 * AuthZ: publishable-key callers (anonymous shop-floor scans) and valid
 * session JWTs are both accepted — see the gate in the request handler.
 *
 * Configurable (set via supabase secrets):
 *   - MAIN_MATCH_THRESHOLD (default: 0.70)
 *   - SIMILAR_PRODUCT_THRESHOLD (default: 0.55)
 *   - AMBIGUOUS_MARGIN (default: 0.03)
 *   - EDGE_CANDIDATE_LIMIT (default: 20)
 *   - EDGE_CANDIDATE_COSINE_FLOOR (default: 0.30)
 */
import { getEmbeddingProvider, EMBEDDING_DIMENSIONS, validateEmbeddingVector } from '../_shared/embedding.ts';
import { compareDescriptors } from '../_shared/embedding-engine.ts';

// STATIC npm specifier — deliberately not `await import('https://esm.sh/…')`.
// A dynamic import of a REMOTE URL is not fetched into the deployed module
// graph, so the edge runtime failed at request time with
// `Module not found: https://esm.sh/@supabase/supabase-js@2` (HTTP 500 on
// every photo). Static `npm:` specifiers are resolved and bundled at deploy
// time — the same pattern _shared/embedding-engine.ts already relies on for
// jpeg-js/pngjs.
import { createClient } from 'npm:@supabase/supabase-js@2';

// ---------------------------------------------------------------------------
// Configuration from environment secrets
// ---------------------------------------------------------------------------

// Keep these in sync with src/lib/visual-match/thresholds.ts, which documents
// the measured score table they were calibrated from.
const MAIN_MATCH_THRESHOLD = Number(Deno.env.get('MAIN_MATCH_THRESHOLD') ?? '0.70');
const SIMILAR_PRODUCT_THRESHOLD = Number(Deno.env.get('SIMILAR_PRODUCT_THRESHOLD') ?? '0.55');
const AMBIGUOUS_MARGIN = Number(Deno.env.get('AMBIGUOUS_MARGIN') ?? '0.03');
const EDGE_CANDIDATE_LIMIT = Number(Deno.env.get('EDGE_CANDIDATE_LIMIT') ?? '20');

/**
 * Retrieval floor for the pgvector cosine, NOT a decision threshold.
 *
 * It only decides which candidates reach the two-signal rule below, so it sits
 * far under both thresholds: filtering candidates on the summed cosine would
 * throw away photos that the shape/colour rule would happily have matched (a
 * genuine re-shot with an unusual background is exactly that case).
 */
const EDGE_CANDIDATE_COSINE_FLOOR = Number(Deno.env.get('EDGE_CANDIDATE_COSINE_FLOOR') ?? '0.30');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** ~7 MB base64 ≈ 5 MB binary — matches the app and storage caps. */
const MAX_DATA_URI_CHARS = 7_000_000;
const ALLOWED_IMAGE_MIME = /^data:image\/(png|jpeg|jpg);base64,/;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MatchRequest {
  /** The user's captured photo as a data URI (image/jpeg|png). */
  image: string;
}

/** One image-level candidate from pgvector. */
interface ImageCandidate {
  product_id: string;
  image_id: string;
  similarity: number;
}

/** One product-level result after grouping. */
interface ProductResult {
  product_id: string;
  /** Best similarity score across all images of this product. */
  best_similarity: number;
  /** Number of images that matched above the similar threshold. */
  matching_images: number;
}

/**
 * pgvector values arrive over PostgREST as a string ("[0.1,0.2,…]"), and as an
 * array when they come from an RPC. Accept both, and reject anything that is not
 * a usable vector rather than comparing against garbage.
 */
function parseStoredEmbedding(value: unknown): number[] | null {
  let raw: unknown = value;
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!Array.isArray(raw)) return null;
  const vector = raw.map((entry) => (typeof entry === 'number' ? entry : Number.NaN));
  return vector.every((entry) => Number.isFinite(entry)) ? vector : null;
}

interface MatchResponse {
  /**
   * 'identified' when top product passes MAIN_MATCH_THRESHOLD with clear margin.
   * 'uncertain' when there are candidates but none clearly dominate.
   * 'no-match' when nothing passes SIMILAR_PRODUCT_THRESHOLD.
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
  main_match: ProductResult | null;

  /** Visually similar products (excludes main_match, sorted by similarity). */
  similar_products: ProductResult[];

  /** All product-level candidates (for client-side filtering if needed). */
  all_candidates: ProductResult[];
}

// ---------------------------------------------------------------------------
// Algorithm
// ---------------------------------------------------------------------------

/**
 * Groups image-level candidates by product and calculates product-level
 * similarity scores. Uses the BEST score per product (not average) to
 * avoid penalizing products with many reference images.
 */
function groupByProduct(rows: ImageCandidate[]): ProductResult[] {
  const productMap = new Map<string, { best: number; count: number }>();

  for (const row of rows) {
    const existing = productMap.get(row.product_id);
    if (!existing) {
      productMap.set(row.product_id, {
        best: row.similarity,
        count: row.similarity >= SIMILAR_PRODUCT_THRESHOLD ? 1 : 0,
      });
    } else {
      // Track best score and how many images matched above similar threshold
      if (row.similarity > existing.best) {
        existing.best = row.similarity;
      }
      if (row.similarity >= SIMILAR_PRODUCT_THRESHOLD) {
        existing.count++;
      }
    }
  }

  return [...productMap.entries()]
    .map(([product_id, data]) => ({
      product_id,
      best_similarity: data.best,
      matching_images: data.count,
    }))
    .sort((a, b) => b.best_similarity - a.best_similarity);
}

/**
 * Determines the main match and similar products from grouped results.
 *
 * Rules:
 * - Main match: top product above MAIN_MATCH_THRESHOLD with clear margin
 * - Similar products: above SIMILAR_PRODUCT_THRESHOLD, excluding main
 * - No-confidence: below threshold shows "not recognized" + similar options
 */
// Exported for the Node decision-logic tests (tests/edge-match-logic.test.mjs);
// runtime behavior is unchanged. groupByProduct is exported for the same tests.
export { determineMatch, groupByProduct, parseStoredEmbedding };

function determineMatch(products: ProductResult[]): {
  status: 'identified' | 'uncertain' | 'no-match';
  confidence: number;
  main_match: ProductResult | null;
  similar_products: ProductResult[];
} {
  if (products.length === 0) {
    return {
      status: 'no-match',
      confidence: 0,
      main_match: null,
      similar_products: [],
    };
  }

  const topProduct = products[0];
  const confidence = topProduct.best_similarity;

  // Check if top product passes main threshold
  if (confidence >= MAIN_MATCH_THRESHOLD) {
    // Check for ambiguity: if second product is too close, downgrade
    if (products.length > 1) {
      const secondProduct = products[1];
      const margin = confidence - secondProduct.best_similarity;

      if (
        secondProduct.best_similarity >= MAIN_MATCH_THRESHOLD &&
        margin < AMBIGUOUS_MARGIN
      ) {
        // Too close to call — user must disambiguate
        return {
          status: 'uncertain',
          confidence,
          main_match: null,
          similar_products: products.filter(
            (p) => p.best_similarity >= SIMILAR_PRODUCT_THRESHOLD,
          ),
        };
      }
    }

    // Clear winner above threshold
    const mainMatch = topProduct;
    const similar = products
      .filter(
        (p) =>
          p.product_id !== mainMatch.product_id &&
          p.best_similarity >= SIMILAR_PRODUCT_THRESHOLD,
      )
      .slice(0, 10); // Max 10 similar products

    return {
      status: 'identified',
      confidence,
      main_match: mainMatch,
      similar_products: similar,
    };
  }

  // Top product below main threshold — show similar products only
  const similar = products
    .filter((p) => p.best_similarity >= SIMILAR_PRODUCT_THRESHOLD)
    .slice(0, 10);

  return {
    status: similar.length > 0 ? 'uncertain' : 'no-match',
    confidence,
    main_match: null,
    similar_products: similar,
  };
}

// ---------------------------------------------------------------------------
// Request handler
// ---------------------------------------------------------------------------

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  const startTime = Date.now();

  try {
    // Public shop-floor search: the function is read-only and the database RPC
    // is explicitly granted to anon/authenticated. Do NOT compare the mobile
    // publishable key with SUPABASE_ANON_KEY here. Modern Supabase projects
    // use sb_publishable_* keys, while SUPABASE_ANON_KEY inside the Edge
    // runtime may still be the legacy JWT-shaped anon key. That comparison
    // caused valid mobile requests to be rejected as 401.
    // Supabase's API gateway handles the public API key; this function only
    // performs read-only catalog search and never exposes service-role data.
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
    );

    const { image } = (await req.json()) as MatchRequest;

    // Validate input
    if (!image || typeof image !== 'string' || !ALLOWED_IMAGE_MIME.test(image)) {
      return json({ error: 'A data-URI product photo is required (png/jpeg).' }, 400);
    }
    if (image.length > MAX_DATA_URI_CHARS) {
      return json({ error: 'The submitted photo is too large.' }, 413);
    }

    console.log(`[visual-match] Processing image (${(image.length / 1024).toFixed(0)} KB data URI)`);

    // 1. Embed the user photo with the configured free MobileCLIP provider.
    // Provider configuration/transport failures are surfaced to the caller
    // (never flattened into a generic 500): a useful backend error is much
    // easier to diagnose than a generic "Visual matching failed" message.
    let provider;
    try {
      provider = getEmbeddingProvider();
    } catch (configError) {
      const message = configError instanceof Error ? configError.message : 'Embedding provider is not configured.';
      console.error(`[visual-match] Provider config error: ${message}`);
      return json({ error: message }, 500);
    }

    let embedResult;
    try {
      embedResult = await provider.embedImages([image]);
    } catch (embedError) {
      const message = embedError instanceof Error ? embedError.message : 'Embedding provider request failed.';
      console.error(`[visual-match] Embedding provider error: ${message}`);
      return json({ error: `Embedding failed: ${message}` }, 502);
    }
    const { vectors, model, dimensions } = embedResult;

    // Validate the embedding result before using it
    if (!vectors || !Array.isArray(vectors) || vectors.length === 0) {
      console.error('[visual-match] Embedding generation returned no vectors');
      return json({ error: 'Embedding generation returned no vectors.' }, 500);
    }

    const queryVector = vectors[0];

    const vectorError = validateEmbeddingVector(queryVector);
    if (vectorError) {
      console.error(`[visual-match] Embedding validation failed: ${vectorError}`);
      return json({ error: vectorError }, 500);
    }

    console.log(`[visual-match] Embedding generated: model=${model} dims=${dimensions} len=${queryVector.length} (${Date.now() - startTime}ms)`);

    // 2. Candidate retrieval in Postgres (pgvector cosine distance)
    //    Fetch more candidates than needed for better product grouping. The
    //    cosine here is only a RETRIEVAL filter — the decision is made below.
    const { data, error } = await supabase.rpc('visual_search_matches', {
      query_embedding: queryVector,
      match_threshold: EDGE_CANDIDATE_COSINE_FLOOR,
      match_count: EDGE_CANDIDATE_LIMIT,
    });

    if (error) {
      console.error(`[visual-match] RPC error: ${error.message} (code=${error.code})`);
      return json({ error: `Similarity search failed: ${error.message.slice(0, 200)}` }, 500);
    }

    const rows = (data ?? []) as { product_id: string; image_id: string; similarity: number }[];

    console.log(`[visual-match] RPC returned ${rows.length} image-level candidates (${Date.now() - startTime}ms total)`);

    // 2b. Re-score every candidate on shape and colour separately.
    //     The cosine above is a weighted SUM, so one aspect can pay for another:
    //     measured, a green ball scored 0.82 against a yellow ball (its outline
    //     is identical) and a yellow box 0.82 as well (its colour is identical).
    //     compareDescriptors keeps the WEAKER signal, so a candidate is only as
    //     good as its worst aspect — the lookalikes above drop to 0.29 and 0.21
    //     while a genuine re-shot of the product stays at 0.83–1.00.
    let candidates = rows;
    if (rows.length > 0) {
      const { data: imageData, error: imageError } = await supabase
        .from('product_images')
        .select('id, embedding')
        .in('id', rows.map((row) => row.image_id));

      if (imageError) {
        console.error(`[visual-match] Candidate re-scoring failed: ${imageError.message}`);
        return json(
          { error: `Could not compare candidates: ${imageError.message.slice(0, 200)}` },
          500,
        );
      }

      const storedVectors = new Map<string, number[]>();
      for (const row of (imageData ?? []) as { id: string; embedding: unknown }[]) {
        const vector = parseStoredEmbedding(row.embedding);
        if (vector && vector.length === EMBEDDING_DIMENSIONS) storedVectors.set(row.id, vector);
      }

      const scored: { row: ImageCandidate; comparison: ReturnType<typeof compareDescriptors> }[] = [];
      for (const row of rows) {
        const stored = storedVectors.get(row.image_id);
        if (!stored) continue; // image deleted mid-search, or an unusable vector
        scored.push({ row, comparison: compareDescriptors(queryVector, stored) });
      }

      scored.sort((a, b) => b.comparison.score - a.comparison.score);

      const best = scored[0];
      if (best) {
        console.log(
          `[visual-match] Top candidate ${best.row.image_id}: cosine=${best.row.similarity.toFixed(3)} ` +
            `shape=${best.comparison.shape.toFixed(3)} colour=${best.comparison.colour.toFixed(3)} ` +
            `score=${best.comparison.score.toFixed(3)}`,
        );
      }
      const skipped = rows.length - scored.length;
      if (skipped > 0) {
        console.warn(`[visual-match] ${skipped} candidate(s) had no usable embedding and were skipped`);
      }

      candidates = scored.map(({ row, comparison }) => ({
        product_id: row.product_id,
        image_id: row.image_id,
        similarity: comparison.score,
      }));
    }

    // 3. Group by product and calculate product-level scores
    const productResults = groupByProduct(candidates);

    // 4. Determine main match and similar products
    const { status, confidence, main_match, similar_products } = determineMatch(productResults);

    console.log(`[visual-match] Result: status=${status} confidence=${confidence.toFixed(3)} products=${productResults.length} main=${main_match?.product_id ?? 'none'}`);

    // 5. Build response
    const response: MatchResponse = {
      status,
      confidence,
      thresholds: {
        main: MAIN_MATCH_THRESHOLD,
        similar: SIMILAR_PRODUCT_THRESHOLD,
        ambiguous_margin: AMBIGUOUS_MARGIN,
      },
      main_match,
      similar_products,
      all_candidates: productResults,
    };

    return json(response, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[visual-match] Unhandled error: ${message}`);
    return json(
      { error: `Visual matching failed: ${message.slice(0, 240)}` },
      500,
    );
  }
});

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}
