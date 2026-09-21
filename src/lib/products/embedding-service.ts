import { supabase } from '@/lib/supabase';
import { toUserMessage } from '@/lib/errors';

/** Embedding generation status for an image. */
export type EmbeddingStatus = 'pending' | 'generating' | 'success' | 'failed';

/** Result of embedding generation for a single image. */
export type EmbeddingResult = {
  imageId: string;
  status: EmbeddingStatus;
  error?: string;
};

export type ServiceResult<T> = { ok: true; data: T } | { ok: false; error: string };

function toMessage(error: unknown, fallback: string): string {
  return toUserMessage(error, fallback);
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
 * embed-product-image edge function. FREE operation using MobileCLIP-S0
 * ONNX inference.
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

  try {
    const { data, error } = await supabase.functions.invoke('embed-product-image', {
      body: { product_id: productId, limit },
    });

    if (error) {
      return {
        ok: false,
        error: toMessage(error, 'Embedding generation failed. The images are uploaded but not searchable yet.'),
      };
    }

    return parseEmbeddingResponse(data);
  } catch (error) {
    return {
      ok: false,
      error: toMessage(error, 'Embedding generation failed. The images are uploaded but not searchable yet.'),
    };
  }
}
