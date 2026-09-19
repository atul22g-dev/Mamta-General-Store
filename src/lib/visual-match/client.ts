/**
 * App-side visual-search client.
 *
 * The app NEVER talks to an AI provider directly and holds NO AI keys.
 * It invokes the `visual-match` Supabase Edge Function with the user's
 * photo; the function does embedding + similarity search and returns
 * product IDs + similarity scores only.
 *
 * Prices are then read from the `products` table — the single source of
 * truth — so what the user sees is always the current selling_price.
 */
import { supabase } from '@/lib/supabase';
import { toUserMessage } from '@/lib/errors';
import type { ProductWithImages } from '@/lib/products/product-service';
import type {
  MatchCandidateView,
  VisualMatchOutcome,
} from '@/lib/visual-match/types-client';
import type { ServiceResult } from '@/lib/visual-match/types';

export type { MatchCandidateView, VisualMatchOutcome };

interface EdgeMatchResponse {
  status?: 'identified' | 'uncertain';
  confidence?: number;
  threshold?: number;
  candidates?: { product_id: string; similarity: number }[];
  error?: string;
}

/**
 * Runs the end-to-end visual match for one captured photo.
 * Prices are fetched from the products DB in step 2 — never from the AI.
 */
export async function matchProductFromPhoto(
  dataUri: string,
): Promise<ServiceResult<VisualMatchOutcome>> {
  // 1. Embed + similarity search via the edge function.
  const { data, error } = await supabase.functions.invoke('visual-match', {
    body: { image: dataUri },
  });

  if (error) {
    return { ok: false, error: toUserMessage(error, 'Visual matching is unavailable right now.') };
  }

  const response = data as EdgeMatchResponse;
  if (response?.error) {
    return { ok: false, error: toUserMessage(response.error, 'Visual matching failed.') };
  }

  const edgeCandidates = response?.candidates ?? [];

  if (edgeCandidates.length === 0) {
    return {
      ok: true,
      data: {
        status: 'no-match',
        confidence: 0,
        threshold: response?.threshold ?? 0.82,
        candidates: [],
      },
    };
  }

  // 2. Fetch CURRENT product data (price included) from Supabase — the AI
  //    never supplies any of this.
  const productIds = [...new Set(edgeCandidates.map((candidate) => candidate.product_id))];
  const { data: rows, error: productError } = await supabase
    .from('products')
    .select('*, product_images(id, image_url)')
    .in('id', productIds);

  if (productError) {
    return { ok: false, error: toUserMessage(productError, 'Could not load product details.') };
  }

  const products = new Map<string, ProductWithImages>(
    ((rows ?? []) as ProductWithImages[]).map((product) => [product.id, product]),
  );

  // 3. Join candidates with live products (drops deleted rows) and apply
  //    the threshold decision on the client using the backend's threshold.
  const candidates: MatchCandidateView[] = edgeCandidates
    .filter((candidate) => products.has(candidate.product_id))
    .map((candidate) => ({
      product: products.get(candidate.product_id)!,
      similarity: candidate.similarity,
    }));

  if (candidates.length === 0) {
    return {
      ok: true,
      data: { status: 'no-match', confidence: 0, threshold: response?.threshold ?? 0.82, candidates: [] },
    };
  }

  const threshold = response?.threshold ?? 0.82;
  const confidence = candidates[0].similarity;

  return {
    ok: true,
    data: {
      status: confidence >= threshold ? 'identified' : 'uncertain',
      confidence,
      threshold,
      candidates,
    },
  };
}

/**
 * Pure decision logic lives in ./decision (dependency-free, unit-testable);
 * re-exported here for a single import surface.
 */
export { analyzeMatchOutcome } from '@/lib/visual-match/decision';
