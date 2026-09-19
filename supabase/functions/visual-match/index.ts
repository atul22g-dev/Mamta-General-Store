/**
 * visual-match edge function.
 *
 * Flow (exactly as architected — the AI NEVER touches prices):
 *   user photo (base64 data URI)
 *     → embedding provider (Cohere embed-v4.0, 512-dim)
 *     → pgvector cosine similarity over product_images.embedding
 *     → ranked product IDs + similarity scores
 *     → (the app re-reads the products table for the CURRENT selling_price)
 *
 * No price field exists anywhere in this function's response by design.
 *
 * Secrets (set via `supabase secrets set`): COHERE_API_KEY
 * The publishable anon key travels in the Authorization header from the
 * app; the service-role key is not needed because the RPC is granted to
 * anon/authenticated.
 */
import { getEmbeddingProvider } from '../_shared/embedding.ts';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface MatchRequest {
  /** The user's captured photo as a data URI (image/jpeg|png|webp). */
  image: string;
}

interface MatchCandidate {
  product_id: string;
  similarity: number;
}

interface MatchResponse {
  /** 'identified' when top similarity ≥ threshold; 'uncertain' otherwise. */
  status: 'identified' | 'uncertain';
  /** Cosine similarity of the best candidate (0–1). */
  confidence: number;
  /** Threshold used for the decision (from env, default 0.82). */
  threshold: number;
  candidates: MatchCandidate[];
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  try {
    const { image } = (await req.json()) as MatchRequest;

    if (!image || typeof image !== 'string' || !image.startsWith('data:image/')) {
      return json({ error: 'A data-URI product photo is required.' }, 400);
    }

    // 1. Embed the user photo.
    const provider = getEmbeddingProvider();
    const { vectors } = await provider.embedImages([image]);
    const queryVector = vectors[0];

    // 2. Similarity search in Postgres (pgvector cosine distance).
    const threshold = Number(Deno.env.get('MATCH_THRESHOLD') ?? '0.82');
    const candidateLimit = Number(Deno.env.get('MATCH_CANDIDATES') ?? '5');

    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
    );

    const { data, error } = await supabase.rpc('visual_search_matches', {
      query_embedding: queryVector,
      match_threshold: threshold,
      match_count: candidateLimit,
    });

    if (error) {
      return json({ error: `Similarity search failed: ${error.message}` }, 500);
    }

    const rows = (data ?? []) as { product_id: string; similarity: number }[];

    // 3. Decide: identified only above threshold; otherwise return several
    //    candidates for the user to disambiguate.
    const candidates: MatchCandidate[] = rows.map((row) => ({
      product_id: row.product_id,
      similarity: row.similarity,
    }));

    const confidence = candidates.length > 0 ? candidates[0].similarity : 0;
    const response: MatchResponse = {
      status: confidence >= threshold ? 'identified' : 'uncertain',
      confidence,
      threshold,
      candidates,
    };

    return json(response, 200);
  } catch (error) {
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
