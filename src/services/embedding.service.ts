import { supabase } from '@/services/supabase.service';
import { toUserMessage } from '@/services/errors.service';
import {
  EMBEDDING_DIMENSIONS,
  parsePgvector,
  validateEmbedding,
  isProductInSearchResults,
  type SearchableCheck,
} from '@/services/embedding-contract.service';

/** Embedding generation status for an image. */
export type EmbeddingStatus = 'pending' | 'generating' | 'success' | 'failed';

/** Result of embedding generation for a single image. */
export type EmbeddingResult = {
  imageId: string;
  status: EmbeddingStatus;
  error?: string;
};

/** A product image row as this service reads it (id + url + raw embedding). */
export type ProductEmbeddingRow = {
  id: string;
  image_url: string;
  embedding: string | number[] | null;
};

/** Verification state of one image's stored embedding. */
export type EmbeddingState = 'missing' | 'valid' | 'invalid';

/** Per-image validation outcome. */
export type EmbeddingImageCheck = {
  imageId: string;
  state: EmbeddingState;
  /** Why the embedding is invalid — set only when state === 'invalid'. */
  reason?: string;
};

/** Stored-embedding state for one product. */
export type EmbeddingVerification = {
  imageCount: number;
  embeddedCount: number;
  /** First successfully parsed + contract-valid embedding, or null. */
  validEmbedding: number[] | null;
  /** Row id that owns validEmbedding. */
  validEmbeddingImageId: string | null;
  /** Per-image verification for diagnostics + cleanup targeting. */
  perImage: EmbeddingImageCheck[];
  /** Human-readable problem when nothing valid exists. */
  problem: string | null;
};

/** Result of a full verify-and-fix cycle for one product. */
export type PipelineVerification = {
  /** Verified against the real RPC: the product is findable by photo. */
  searchable: boolean;
  /** Cosine similarity the RPC returned for this product, when found. */
  similarity: number | null;
  /** Stored, contract-valid embedding that the search was run with. */
  embedding: number[] | null;
  /** Technical note for logs; user-safe messages go through `error`. */
  detail: string;
};

export type ServiceResult<T> = { ok: true; data: T } | { ok: false; error: string };

function toMessage(error: unknown, fallback: string): string {
  return toUserMessage(error, fallback);
}

/** Technical log tag — every pipeline failure leaves a trace here. */
const TAG = '[embedding-service]';

/**
 * Extracts the REAL error message from a failed Edge Function invocation.
 *
 * supabase-js wraps non-2xx responses in FunctionsHttpError, which carries
 * the Response object on `error.context` — NOT on `details`. Reading
 * `details` is why admins used to see the generic
 * "Edge Function returned a non-2xx status code" instead of the actual
 * cause (e.g. the jpeg memory error).
 */
async function readEdgeError(error: unknown, fallback: string): Promise<string> {
  const context = (error as { context?: unknown } | null)?.context;
  if (context instanceof Response) {
    try {
      const body = (await context.json()) as { error?: unknown; message?: unknown };
      const message =
        typeof body.error === 'string' && body.error.length > 0
          ? body.error
          : typeof body.message === 'string' && body.message.length > 0
            ? body.message
            : null;
      if (message) return message;
    } catch (parseError) {
      console.error(`${TAG} edge error body unparseable:`, parseError);
    }
  }
  return toMessage(error, fallback);
}

/**
 * Validates a product ID for embedding generation.
 */
function validateProductId(productId: string): ServiceResult<never> | null {
  if (!productId || !productId.trim()) {
    return { ok: false, error: 'Cannot generate embedding: no product ID provided.' };
  }
  return null;
}

/**
 * Parses and validates the edge function response shape.
 */
function parseEmbeddingResponse(
  data: unknown,
): ServiceResult<{ embedded: number; failed: { id: string; error: string }[]; hasEmbedding: boolean }> {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return {
      ok: false,
      error: 'Embedding generation returned an unexpected response. The images are uploaded but not searchable yet.',
    };
  }

  const response = data as Record<string, unknown>;

  if ('error' in response) {
    return {
      ok: false,
      error: toMessage(response.error, 'Embedding generation failed. The images are uploaded but not searchable yet.'),
    };
  }

  const embedded = typeof response.embedded === 'number' ? response.embedded : 0;
  const failed = Array.isArray(response.failed) ? response.failed : [];

  return {
    ok: true,
    data: {
      embedded,
      failed: failed as { id: string; error: string }[],
      hasEmbedding: embedded > 0,
    },
  };
}

/**
 * Generates visual embeddings for a product's reference images via the
 * embed-product-image edge function. FREE operation using the project's
 * configured visual-descriptor provider (no API keys).
 *
 * Must be called AFTER images are uploaded to Storage and product_images
 * rows exist (embedding IS NULL), because the edge function reads images
 * from Storage.
 *
 * @param productId - The product whose pending images should be embedded
 * @param limit     - Max images to process per call (default 20)
 * @returns Structured result with embedded count, per-image failures, and
 *          whether at least one image was successfully embedded.
 */
export async function generateProductEmbedding(
  productId: string,
  limit = 20,
): Promise<ServiceResult<{ embedded: number; failed: { id: string; error: string }[]; hasEmbedding: boolean }>> {
  const validationError = validateProductId(productId);
  if (validationError) return validationError;

  return invokeEmbed(productId, limit);
}

/**
 * Embeds EVERY image that has no embedding yet, regardless of product.
 *
 * Used by the admin export/import screen after a bulk import: an imported
 * product can arrive with a photo link rather than an upload, so there is no
 * "the admin just touched this product" moment to hang an embedding call off.
 * The function itself only ever looks at rows where `embedding is null`, so
 * calling it here can never recompute or corrupt an existing vector.
 *
 * @param limit max images per call (the function caps this at 50)
 */
export async function backfillProductEmbeddings(
  limit = 50,
): Promise<ServiceResult<{ embedded: number; failed: { id: string; error: string }[]; hasEmbedding: boolean }>> {
  return invokeEmbed(undefined, limit);
}

/**
 * Fetches the product's image rows (id, url, raw embedding) from the DB.
 */
async function fetchEmbeddingRows(productId: string): Promise<ServiceResult<ProductEmbeddingRow[]>> {
  const { data, error } = await supabase
    .from('product_images')
    .select('id, image_url, embedding')
    .eq('product_id', productId)
    .order('created_at', { ascending: true });

  if (error) {
    return { ok: false, error: toMessage(error, 'Could not read the product images.') };
  }
  return { ok: true, data: (data ?? []) as ProductEmbeddingRow[] };
}

/**
 * Verifies the product's stored embeddings against the database contract:
 * dimension must be exactly EMBEDDING_DIMENSIONS with all-finite values.
 *
 * Never truncates or pads — an invalid vector is reported (and optionally
 * cleared by clearInvalidEmbeddings) so it can be regenerated cleanly.
 */
export async function verifyProductEmbedding(
  productId: string,
): Promise<ServiceResult<EmbeddingVerification>> {
  const idError = validateProductId(productId);
  if (idError) return idError;

  const rows = await fetchEmbeddingRows(productId);
  if (!rows.ok) return rows;

  const perImage: EmbeddingImageCheck[] = rows.data.map((row) => {
    // null embedding = never generated = 'missing', NOT corrupt.
    if (row.embedding === null || row.embedding === undefined) {
      return { imageId: row.id, state: 'missing' };
    }
    const validation = validateEmbedding(parsePgvector(row.embedding));
    return validation.valid
      ? { imageId: row.id, state: 'valid' }
      : { imageId: row.id, state: 'invalid', reason: validation.reason };
  });

  const firstValid = perImage.find((entry) => entry.state === 'valid');
  const allMissing = perImage.every((entry) => entry.state === 'missing');

  let problem: string | null = null;
  if (rows.data.length === 0) {
    problem = 'The product has no images attached.';
  } else if (allMissing) {
    problem = 'No image has an embedding yet.';
  } else if (!firstValid) {
    problem = `Stored embeddings do not match the database contract (expected ${EMBEDDING_DIMENSIONS} dimensions).`;
  }

  return {
    ok: true,
    data: {
      imageCount: rows.data.length,
      embeddedCount: perImage.filter((entry) => entry.state === 'valid').length,
      // Re-parse just the valid rows so the returned vector is typed number[]
      // without unsafe casts on the check objects.
      validEmbedding: validVectors(perImage, rows.data),
      validEmbeddingImageId: firstValid?.imageId ?? null,
      perImage,
      problem,
    },
  };
}

/**
 * Re-parses the first contract-valid embedding from the raw rows. Typed and
 * allocation-light: parsePgvector already guarantees exact width + finiteness.
 */
function validVectors(
  checks: readonly EmbeddingImageCheck[],
  rows: readonly ProductEmbeddingRow[],
): number[] | null {
  const validId = checks.find((check) => check.state === 'valid')?.imageId;
  if (!validId) return null;
  const row = rows.find((candidate) => candidate.id === validId);
  return row ? parsePgvector(row.embedding) : null;
}

/**
 * Nulls out embeddings that violate the contract (corrupt/wrong-dimension
 * vectors would otherwise linger as poison data). The edge function treats
 * `embedding is null` as pending, so cleared rows regenerate on the next run.
 */
export async function clearInvalidEmbeddings(
  verification: EmbeddingVerification,
): Promise<number> {
  const invalidIds = verification.perImage
    .filter((entry) => entry.state === 'invalid')
    .map((entry) => entry.imageId);

  if (invalidIds.length === 0) return 0;

  const { error } = await supabase
    .from('product_images')
    .update({ embedding: null })
    .in('id', invalidIds);

  if (error) {
    console.error(`${TAG} failed to clear invalid embeddings:`, error.message);
    return 0;
  }
  console.warn(`${TAG} cleared ${invalidIds.length} invalid embedding(s) for regeneration`);
  return invalidIds.length;
}

/**
 * End-to-end "is this product actually findable by photo?" check.
 *
 * Runs the product's stored embedding through the REAL visual_search_matches
 * RPC and verifies the product comes back. This proves the whole chain:
 * stored vector → RPC → pgvector → result. The RPC is called with
 * match_threshold -1 (accept everything) so the check tests the search
 * machinery itself, not how similar the product is to itself.
 */
export async function verifyProductSearchable(
  productId: string,
): Promise<ServiceResult<PipelineVerification>> {
  const verification = await verifyProductEmbedding(productId);
  if (!verification.ok) return verification;

  const { validEmbedding, problem } = verification.data;

  if (!validEmbedding) {
    return {
      ok: false,
      error:
        problem ??
        'The product has no valid embedding stored, so it cannot be searched by image.',
    };
  }

  const { data, error } = await supabase.rpc('visual_search_matches', {
    query_embedding: validEmbedding,
    match_threshold: -1,
    match_count: 25,
  });

  if (error) {
    console.error(`${TAG} searchability RPC failed:`, error.message);
    return {
      ok: false,
      error: toMessage(error, 'Visual search is unavailable right now.'),
    };
  }

  const check: SearchableCheck = isProductInSearchResults(
    productId,
    (data ?? []) as { product_id: string; similarity: number }[],
  );

  return {
    ok: true,
    data: {
      searchable: check.searchable,
      similarity: check.similarity,
      embedding: validEmbedding,
      detail: check.reason,
    },
  };
}

/** One place that talks to the embed-product-image function. */
async function invokeEmbed(
  productId: string | undefined,
  limit: number,
): Promise<ServiceResult<{ embedded: number; failed: { id: string; error: string }[]; hasEmbedding: boolean }>> {
  try {
    const { data, error } = await supabase.functions.invoke('embed-product-image', {
      body: productId ? { product_id: productId, limit } : { limit },
    });

    if (error) {
      const message = await readEdgeError(
        error,
        'Embedding generation failed. The images are uploaded but not searchable yet.',
      );
      console.error(`${TAG} embed-product-image failed: ${message}`);
      return { ok: false, error: message };
    }

    return parseEmbeddingResponse(data);
  } catch (error) {
    const message = await readEdgeError(
      error,
      'Embedding generation failed. The images are uploaded but not searchable yet.',
    );
    console.error(`${TAG} embed-product-image threw: ${message}`);
    return { ok: false, error: message };
  }
}
