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
 * Secrets: COHERE_API_KEY, SUPABASE_SERVICE_ROLE_KEY (edge-only, never
 * inside the mobile app).
 */
import { getEmbeddingProvider } from '../_shared/embedding.ts';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

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
    const dataUris: string[] = [];

    for (const image of images) {
      const response = await fetch(image.image_url);
      if (!response.ok) {
        throw new Error(`Could not download reference image ${image.id}.`);
      }
      const buffer = new Uint8Array(await response.arrayBuffer());
      const contentType = response.headers.get('content-type') ?? 'image/jpeg';
      const base64 = btoa(String.fromCharCode(...buffer));
      dataUris.push(`data:${contentType};base64,${base64}`);
    }

    const { vectors } = await provider.embedImages(dataUris);

    // --- Persist embeddings ---
    let embedded = 0;
    for (let i = 0; i < images.length; i++) {
      const { error } = await serviceClient
        .from('product_images')
        .update({ embedding: vectors[i] })
        .eq('id', images[i].id);

      if (error) {
        throw new Error(`Could not store embedding for image ${images[i].id}: ${error.message}`);
      }
      embedded++;
    }

    return json({ embedded, remaining_note: 'Re-invoke to continue backfilling.' }, 200);
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
