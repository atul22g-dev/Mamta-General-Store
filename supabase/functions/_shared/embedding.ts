/**
 * Embedding provider abstraction for the visual-search backend.
 *
 * The rest of the backend (edge functions) depends only on
 * `embedImages()`; this file wires the MobileCLIP-S0 ONNX engine.
 *
 * Runs ONLY inside Supabase Edge Functions (Deno). The MODEL_URL is a
 * Supabase edge-function secret — it never ships inside the Expo app.
 */

import { embedWithMobileClip, initModelUrl } from './embedding-engine.ts';

export const EMBEDDING_MODEL = 'mobileclip-s0';
/** Chosen output dimension — matches the pgvector column `vector(512)`. */
export const EMBEDDING_DIMENSIONS = 512;

/** Data-URI encoded image (jpeg/png), per the MobileCLIP-S0 engine. */
export type ImageDataUri = string;

export type EmbeddingResult = {
  /** One vector per input image, same order. */
  vectors: number[][];
  model: string;
  dimensions: number;
};

export type EmbeddingProvider = {
  name: string;
  embedImages(images: ImageDataUri[]): Promise<EmbeddingResult>;
};

/**
 * Validates an embedding vector before sending to the database.
 * Returns null on success, or an error message on failure.
 *
 * Checks:
 * - Vector exists and is an array
 * - Vector contains only finite numbers
 * - Vector length matches the expected dimension (512)
 * - No NaN, null, undefined, or Infinity values
 */
export function validateEmbeddingVector(
  vector: unknown,
  expectedDimensions: number = EMBEDDING_DIMENSIONS,
): string | null {
  if (!vector || !Array.isArray(vector)) {
    return 'Embedding vector is not an array.';
  }

  if (vector.length !== expectedDimensions) {
    return `Embedding dimension mismatch: got ${vector.length}, expected ${expectedDimensions}.`;
  }

  for (let i = 0; i < vector.length; i++) {
    if (typeof vector[i] !== 'number' || !Number.isFinite(vector[i])) {
      return `Embedding contains invalid value at index ${i}: ${vector[i]}.`;
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// MobileCLIP-S0 implementation
// ---------------------------------------------------------------------------

function mobileclipProvider(): EmbeddingProvider {
  const modelUrl = Deno.env.get('MODEL_URL');
  if (!modelUrl) {
    throw new Error(
      'MODEL_URL secret not configured for edge functions. ' +
        'Set it via: supabase secrets set MODEL_URL=<storage-url>',
    );
  }
  initModelUrl(modelUrl);

  return {
    name: 'mobileclip-s0',

    async embedImages(images: ImageDataUri[]): Promise<EmbeddingResult> {
      if (images.length === 0) {
        return { vectors: [], model: EMBEDDING_MODEL, dimensions: EMBEDDING_DIMENSIONS };
      }

      const vectors = await embedWithMobileClip(images);

      return { vectors, model: EMBEDDING_MODEL, dimensions: EMBEDDING_DIMENSIONS };
    },
  };
}

/** Resolves the active provider from edge-function secrets. Throws if unset. */
export function getEmbeddingProvider(): EmbeddingProvider {
  return mobileclipProvider();
}
