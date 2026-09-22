/**
 * App-side visual-search client.
 *
 * The app NEVER talks to an AI provider directly and holds NO AI keys.
 * It invokes the `visual-match` Supabase Edge Function with the user's
 * photo; the function does embedding + similarity search + product grouping
 * and returns structured results with main match and similar products.
 *
 * CRITICAL PRICE RULE: prices are then read from the `products` table —
 * the single source of truth — so what the user sees is always the
 * current selling_price. The AI layer contributes the product identity
 * and a similarity score; it NEVER supplies, guesses, or derives a price.
 */
import { supabase } from '@/services/supabase.service';
import { toUserMessage } from '@/services/errors.service';
import type { ProductWithImages } from '@/services/product.service';
import type { MatchCandidateView, VisualMatchOutcome } from '@/types/product';
import { parseEdgeMatchResponse } from '@/services/edge-contract.service';
import {
  MAIN_MATCH_THRESHOLD,
  SIMILAR_PRODUCT_THRESHOLD,
  AMBIGUOUS_MARGIN,
  VISUAL_MATCH_TIMEOUT_MS,
} from '@/config/visual-match';
import { isValidEmbeddingDataUri } from '@/services/image-pipeline.service';

export type { MatchCandidateView, VisualMatchOutcome };

type ServiceResult<T> = { ok: true; data: T } | { ok: false; error: string };

/** Read the real JSON error returned by the Supabase Edge Function. */
async function readEdgeError(error: unknown): Promise<string | null> {
  if (!error || typeof error !== 'object') return null;
  const context = (error as { context?: unknown }).context;
  if (!context || typeof context !== 'object') return null;

  const response = context as {
    clone?: () => Response;
    status?: number;
    text?: () => Promise<string>;
  };

  try {
    const body = typeof response.clone === 'function'
      ? await response.clone().text()
      : typeof response.text === 'function'
        ? await response.text()
        : '';

    if (body) {
      try {
        const parsed = JSON.parse(body) as { error?: unknown; message?: unknown };
        if (typeof parsed.error === 'string' && parsed.error.trim()) {
          return parsed.error;
        }
        if (typeof parsed.message === 'string' && parsed.message.trim()) {
          return parsed.message;
        }
      } catch {
        if (body.length < 300) return body;
      }
    }

    if (typeof response.status === 'number' && response.status > 0) {
      return `Find Product server error (HTTP ${response.status}).`;
    }
  } catch {
    // Fall through to the normal Supabase error mapper.
  }

  return null;
}

/**
 * Combines the caller's abort signal with a hard timeout. The timeout is
 * the answer to "infinite spinner": whatever the edge function or network
 * does, this promise settles within VISUAL_MATCH_TIMEOUT_MS.
 */
function withTimeout(
  signal: AbortSignal | undefined,
  timeoutMs: number,
): { signal: AbortSignal; cancel: () => void } {
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', onAbort);
  }
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return {
    signal: controller.signal,
    cancel: () => {
      clearTimeout(timer);
      if (signal) signal.removeEventListener('abort', onAbort);
    },
  };
}

/** Build a "no-match" outcome. */
function noMatch(thresholds: { main: number; similar: number; ambiguous_margin: number }): VisualMatchOutcome {
  return {
    status: 'no-match',
    confidence: 0,
    thresholds,
    main_match: null,
    similar_products: [],
    all_candidates: [],
  };
}

/**
 * Fetches product data from the database for the given product IDs.
 * Returns a Map of product_id → ProductWithImages.
 * Only returns active products (defense in depth — RPC already filters).
 */
async function fetchProducts(
  productIds: string[],
): Promise<Map<string, ProductWithImages>> {
  if (productIds.length === 0) return new Map();

  const { data: rows, error } = await supabase
    .from('products')
    .select('*, product_images(id, image_url)')
    .in('id', productIds)
    .eq('is_active', true); // Defense in depth: only show active products

  if (error) throw new Error(toUserMessage(error, 'Could not load product details.'));

  return new Map<string, ProductWithImages>(
    ((rows ?? []) as ProductWithImages[]).map((product) => [product.id, product]),
  );
}

/**
 * Runs the end-to-end visual match for one captured photo:
 *
 *   data URI → edge function (embed → vector search → product grouping)
 *     → live `products` rows (price!) → structured result
 *
 * @param dataUri the captured photo as `data:image/…;base64,…`
 * @param signal  optional abort signal (screen unmount / cancel)
 * @returns screen-ready `VisualMatchOutcome`, or `ok: false` for
 *          infrastructure failures (network, timeout, DB errors).
 *          "Nothing matched" is NOT a failure — it is `no-match`.
 */
export async function matchProductFromPhoto(
  dataUri: string,
  signal?: AbortSignal,
): Promise<ServiceResult<VisualMatchOutcome>> {
  if (!isValidEmbeddingDataUri(dataUri)) {
    return {
      ok: false,
      error:
        dataUri.length > 7_000_000
          ? 'The captured photo is too large to analyze.'
          : 'The captured photo could not be read for analysis.',
    };
  }

  const timeout = withTimeout(signal, VISUAL_MATCH_TIMEOUT_MS);

  try {
    // 1. Embed + similarity search + product grouping via the edge function.
    const { data, error } = await supabase.functions.invoke('visual-match', {
      body: { image: dataUri },
      signal: timeout.signal,
    });

    if (error) {
      // Supabase's FunctionsHttpError stores the actual Edge Function response
      // in `context` (a Response). Reading that body gives us the real backend
      // error instead of the useless generic "non-2xx status code" message.
      const edgeDetail = await readEdgeError(error);
      return {
        ok: false,
        error: edgeDetail ?? toUserMessage(error, 'Visual matching is unavailable right now.'),
      };
    }

    // Wire contract is validated, not trusted (typed via edge-contract).
    const response = parseEdgeMatchResponse(data);
    if (!response) {
      return { ok: false, error: 'Visual matching returned an unreadable response.' };
    }

    const thresholds = {
      main: response.thresholds.main ?? MAIN_MATCH_THRESHOLD,
      similar: response.thresholds.similar ?? SIMILAR_PRODUCT_THRESHOLD,
      ambiguous_margin: response.thresholds.ambiguous_margin ?? AMBIGUOUS_MARGIN,
    };

    // 2. Collect all unique product IDs from EVERY part of the response
    //    (main_match, similar_products, AND all_candidates) so every
    //    candidate gets its live product data fetched.
    const productIdSet = new Set<string>();
    const addId = (id: string) => productIdSet.add(id);
    if (response.main_match) addId(response.main_match.product_id);
    for (const s of response.similar_products) addId(s.product_id);
    for (const c of response.all_candidates) addId(c.product_id);

    const allProductIds = [...productIdSet];

    if (allProductIds.length === 0) {
      return { ok: true, data: noMatch(thresholds) };
    }

    // 3. Fetch CURRENT product data (price included) from Supabase — the AI
    //    never supplies any of this.
    const products = await fetchProducts(allProductIds);

    // Log missing products for development debugging (deleted/deactivated between RPC and fetch)
    if (products.size < allProductIds.length) {
      const missing = allProductIds.filter((id) => !products.has(id));
      console.warn(`[visual-match] ${missing.length} product(s) not found in DB: ${missing.join(', ')}`);
    }

    // 4. Build main_match view (if exists AND product was found in DB)
    let mainMatch: MatchCandidateView | null = null;
    if (response.main_match) {
      const product = products.get(response.main_match.product_id);
      if (product) {
        mainMatch = {
          product,
          similarity: response.main_match.best_similarity,
          matching_images: response.main_match.matching_images,
        };
      }
      // If product not found (deactivated/removed), mainMatch stays null
      // and the stale reference is cleared below so decision.ts stays in sync.
    }

    // 5. Build similar_products views (excluding main, sorted by similarity)
    const mainProductId = mainMatch?.product.id;
    const similarProducts: MatchCandidateView[] = [];
    for (const similar of response.similar_products) {
      if (similar.product_id === mainProductId) continue;
      const product = products.get(similar.product_id);
      if (product) {
        similarProducts.push({
          product,
          similarity: similar.best_similarity,
          matching_images: similar.matching_images,
        });
      }
    }

    // 6. Build all_candidates views (all products the RPC detected, sorted)
    const seenIds = new Set<string>();
    if (mainProductId) seenIds.add(mainProductId);
    const allCandidates: MatchCandidateView[] = [];
    for (const candidate of response.all_candidates) {
      if (seenIds.has(candidate.product_id)) continue;
      seenIds.add(candidate.product_id);
      const product = products.get(candidate.product_id);
      if (product) {
        allCandidates.push({
          product,
          similarity: candidate.best_similarity,
          matching_images: candidate.matching_images,
        });
      }
    }

    // 7. Determine final status based on what the DB actually returned
    //    (not the edge function's stale status, which may reference
    //    products that were deactivated between the RPC and this fetch).
    let status: 'identified' | 'uncertain' | 'no-match';
    if (mainMatch) {
      status = 'identified';
    } else if (similarProducts.length > 0) {
      status = 'uncertain';
    } else {
      status = 'no-match';
    }

    // 8. Build the outcome for decision.ts — use the DB-corrected status
    //    and null out main_match if the product wasn't found, so
    //    analyzeMatchOutcome never sees a stale reference.
    const outcome: VisualMatchOutcome = {
      status,
      confidence: response.confidence,
      thresholds,
      main_match: mainMatch,
      similar_products: similarProducts,
      all_candidates: allCandidates,
    };

    return { ok: true, data: outcome };
  } catch (thrown) {
    // Network failure, timeout abort, or unexpected transport error.
    return { ok: false, error: toUserMessage(thrown, 'Visual matching failed. Try again.') };
  } finally {
    timeout.cancel();
  }
}
