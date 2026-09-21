/**
 * visual-match edge function — FREE visual product matching algorithm.
 *
 * Flow (the AI NEVER touches prices):
 *   user photo (base64 data URI)
 *     → MobileCLIP-S0 embedding (free, ONNX, 512-dim float32)
 *     → validate embedding dimensions + finite values
 *     → pgvector cosine similarity over product_images.embedding
 *     → group results by product (best score per product)
 *     → determine main match (above MAIN_MATCH_THRESHOLD)
 *     → determine similar products (above SIMILAR_PRODUCT_THRESHOLD)
 *     → return structured response
 *     → (the app re-reads the products table for the CURRENT selling_price)
 *
 * No price field exists anywhere in this function's response by design.
 *
 * Configurable thresholds (set via supabase secrets):
 *   - MAIN_MATCH_THRESHOLD (default: 0.90)
 *   - SIMILAR_PRODUCT_THRESHOLD (default: 0.75)
 *   - AMBIGUOUS_MARGIN (default: 0.03)
 *   - EDGE_CANDIDATE_LIMIT (default: 20)
 */
import { getEmbeddingProvider, EMBEDDING_DIMENSIONS, validateEmbeddingVector } from '../_shared/embedding.ts';

// ---------------------------------------------------------------------------
// Configuration from environment secrets
// ---------------------------------------------------------------------------

const MAIN_MATCH_THRESHOLD = Number(Deno.env.get('MAIN_MATCH_THRESHOLD') ?? '0.90');
const SIMILAR_PRODUCT_THRESHOLD = Number(Deno.env.get('SIMILAR_PRODUCT_THRESHOLD') ?? '0.75');
const AMBIGUOUS_MARGIN = Number(Deno.env.get('AMBIGUOUS_MARGIN') ?? '0.03');
const EDGE_CANDIDATE_LIMIT = Number(Deno.env.get('EDGE_CANDIDATE_LIMIT') ?? '20');

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
    const { image } = (await req.json()) as MatchRequest;

    // Validate input
    if (!image || typeof image !== 'string' || !ALLOWED_IMAGE_MIME.test(image)) {
      return json({ error: 'A data-URI product photo is required (png/jpeg).' }, 400);
    }
    if (image.length > MAX_DATA_URI_CHARS) {
      return json({ error: 'The submitted photo is too large.' }, 413);
    }

    console.log(`[visual-match] Processing image (${(image.length / 1024).toFixed(0)} KB data URI)`);

    // 1. Embed the user photo using MobileCLIP-S0 (FREE, no API keys)
    const provider = getEmbeddingProvider();
    const { vectors, model, dimensions } = await provider.embedImages([image]);

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

    // 2. Similarity search in Postgres (pgvector cosine distance)
    //    Fetch more candidates than needed for better product grouping
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
    );

    const { data, error } = await supabase.rpc('visual_search_matches', {
      query_embedding: queryVector,
      match_threshold: SIMILAR_PRODUCT_THRESHOLD, // Lower threshold to get more candidates
      match_count: EDGE_CANDIDATE_LIMIT,
    });

    if (error) {
      console.error(`[visual-match] RPC error: ${error.message} (code=${error.code})`);
      return json({ error: `Similarity search failed: ${error.message}` }, 500);
    }

    const rows = (data ?? []) as { product_id: string; image_id: string; similarity: number }[];

    console.log(`[visual-match] RPC returned ${rows.length} image-level candidates (${Date.now() - startTime}ms total)`);

    // 3. Group by product and calculate product-level scores
    const productResults = groupByProduct(rows);

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
    console.error(`[visual-match] Unhandled error: ${error instanceof Error ? error.message : error}`);
    return json(
      { error: error instanceof Error ? error.message : 'Visual matching failed.' },
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
