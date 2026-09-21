/**
 * embed-product-image edge function.
 *
 * Backfills embeddings for product REFERENCE images so they become
 * searchable. Called after admin image upload/attach (or as a batch job
 * over rows where embedding is null).
 *
 * Auth: requires an authenticated admin/staff caller (enforced via the
 * service-role client + profiles check) — shop-floor anonymous users
 * cannot embed or mutate reference data.
 *
 * Secrets: MODEL_URL (Supabase Storage URL for ONNX model),
 *          SUPABASE_SERVICE_ROLE_KEY (edge-only, never inside the mobile app).
 */
import { getEmbeddingProvider } from '../_shared/embedding.ts';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/**
 * Binary → base64 in bounded chunks. `String.fromCharCode(...buffer)`
 * spreads the whole byte array as call arguments and overflows the stack
 * (RangeError) at roughly >100KB — i.e. every real photo. Chunking keeps
 * each spread far below the argument-count limit (audit CRIT-03).
 */
function bytesToBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000; // 32k bytes per String.fromCharCode call
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

interface EmbedRequest {
  /** Product whose images should be embedded; omit to backfill everything missing. */
  product_id?: string;
  /** Max images per invocation (batch safety). Default 20. */
  limit?: number;
}

interface PendingImage {
  id: string;
  image_url: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  try {
    // --- AuthZ: caller must be an authenticated admin/staff ---
    const authHeader = req.headers.get('Authorization') ?? '';
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');

    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: userData } = await userClient.auth.getUser(authHeader.replace('Bearer ', ''));
    if (!userData?.user) {
      return json({ error: 'Authentication required.' }, 401);
    }

    const { data: profile } = await userClient
      .from('profiles')
      .select('role')
      .eq('id', userData.user.id)
      .single();

    if (profile?.role !== 'admin' && profile?.role !== 'staff') {
      return json({ error: 'Admin or staff role required.' }, 403);
    }

    // --- Find pending reference images ---
    const { product_id: productId, limit = 20 } = (await req.json()) as EmbedRequest;

    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, // edge-only secret; bypasses RLS for the batch update
    );

    let query = serviceClient
      .from('product_images')
      .select('id, image_url')
      .is('embedding', null)
      .limit(Math.max(1, Math.min(limit, 50)));

    if (productId) {
      query = query.eq('product_id', productId);
    }

    const { data: pending, error: fetchError } = await query;
    if (fetchError) {
      return json({ error: `Could not list pending images: ${fetchError.message}` }, 500);
    }

    const images = (pending ?? []) as PendingImage[];
    if (images.length === 0) {
      return json({ embedded: 0, message: 'Nothing pending.' }, 200);
    }

    // --- Download + embed each reference image ---
    const provider = getEmbeddingProvider();

    // Downloads are independent — run them concurrently. A URL that fails
    // is skipped and reported (its embedding stays null, so it remains
    // pending for the next invocation) instead of aborting the batch.
    const downloaded = await Promise.all(
      images.map(async (image) => {
        try {
          const response = await fetch(image.image_url);
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }
          const buffer = new Uint8Array(await response.arrayBuffer());
          const contentType = response.headers.get('content-type') ?? 'image/jpeg';
          const base64 = bytesToBase64(buffer);
          return {
            id: image.id,
            dataUri: `data:${contentType};base64,${base64}`,
            error: null as string | null,
          };
        } catch (error) {
          return {
            id: image.id,
            dataUri: '',
            error: error instanceof Error ? error.message : 'Download failed.',
          };
        }
      }),
    );

    const okDownloads = downloaded.filter((item) => item.error === null);
    const downloadFailures = downloaded.flatMap((item) =>
      item.error === null ? [] : [{ id: item.id, error: item.error as string }],
    );

    if (okDownloads.length === 0) {
      return json({ embedded: 0, failed: downloadFailures }, 500);
    }

    const { vectors } = await provider.embedImages(okDownloads.map((item) => item.dataUri));

    // --- Persist embeddings concurrently (independent rows) ---
    const persistResults = await Promise.all(
      okDownloads.map((item, index) =>
        serviceClient
          .from('product_images')
          .update({ embedding: vectors[index] })
          .eq('id', item.id)
          .then(({ error }) => ({ id: item.id, error: error?.message ?? null })),
      ),
    );

    const persistFailures = persistResults.flatMap((result) =>
      result.error === null ? [] : [{ id: result.id, error: result.error as string }],
    );
    const embedded = persistResults.length - persistFailures.length;

    return json(
      {
        embedded,
        failed: [...downloadFailures, ...persistFailures],
        remaining_note: 'Re-invoke to continue backfilling.',
      },
      200,
    );
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : 'Embedding failed.' },
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
