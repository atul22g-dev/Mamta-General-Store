/**
 * Embedding provider abstraction for the visual-search backend.
 *
 * The rest of the backend (edge functions) depends only on `embedImages()`;
 * this file selects the embedding provider:
 *
 *   1. Cohere `embed-v4.0` (DEFAULT) — the provider this project's
 *      pipeline was originally built and deployed with. Requires only the
 *      `COHERE_API_KEY` edge secret — no model files, no extra
 *      infrastructure. (No reference embeddings are stored yet, so this
 *      is also the provider all future embeddings will be indexed with.)
 *
 *   2. MobileCLIP-S0 ONNX (opt-in via `EMBEDDING_PROVIDER=mobileclip-s0`)
 *      — free local inference, but requires a working `MODEL_URL` secret
 *      (public URL of the ~11.5 MB ONNX vision encoder). Keeping it behind
 *      an explicit opt-in prevents a silent switch to a model that was
 *      never verified end-to-end (no `models` bucket existed in this
 *      project's Storage when audited; the export script's dependencies
 *      are not installed).
 *
 * CRITICAL COMPATIBILITY RULE: search embeddings and reference embeddings
 * MUST come from the same provider. When switching providers you must:
 *   1. clear every existing embedding (`clear_product_embeddings`, service role),
 *   2. re-embed all reference images,
 *   3. keep the output dimension equal to the pgvector column (`vector(512)`).
 *
 * Runs ONLY inside Supabase Edge Functions (Deno). Provider keys are edge
 * secrets — they never ship inside the Expo app.
 */

import { embedWithMobileClip, initModelUrl } from './embedding-engine.ts';

export const EMBEDDING_MODEL = 'embed-v4.0';
/** Chosen output dimension — matches the pgvector column `vector(512)`. */
export const EMBEDDING_DIMENSIONS = 512;

/** Data-URI encoded image (jpeg/png per the edge-function MIME whitelist). */
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
// Cohere implementation (default provider)
// ---------------------------------------------------------------------------

const COHERE_EMBED_URL = 'https://api.cohere.com/v2/embed';

/** Formats the user-facing error for a Cohere API failure (no secrets). */
function cohereHttpError(status: number, apiMessage: string | null): Error {
  const detail = apiMessage ? `: ${apiMessage}` : '.';
  if (status === 401 || status === 403) {
    return new Error('Embedding provider rejected the API key. Check COHERE_API_KEY.');
  }
  if (status === 429) {
    return new Error('Embedding provider rate limit reached. Try again shortly.');
  }
  return new Error(`Embedding provider error (HTTP ${status})${detail}`);
}

function cohereProvider(apiKey: string): EmbeddingProvider {
  return {
    name: 'cohere',

    async embedImages(images: ImageDataUri[]): Promise<EmbeddingResult> {
      if (images.length === 0) {
        return { vectors: [], model: EMBEDDING_MODEL, dimensions: EMBEDDING_DIMENSIONS };
      }

      const response = await fetch(COHERE_EMBED_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: EMBEDDING_MODEL,
          input_type: 'image',
          embedding_types: ['float'],
          output_dimension: EMBEDDING_DIMENSIONS,
          images,
        }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { message?: string } | null;
        throw cohereHttpError(response.status, body?.message ?? null);
      }

      const data = (await response.json()) as { embeddings?: { float?: number[][] } };
      const vectors = data.embeddings?.float;

      if (!vectors || vectors.length !== images.length) {
        throw new Error('Embedding provider returned an unexpected response shape.');
      }

      // Runtime guard: fail loudly on any dimension drift (never truncate).
      const dimError = validateEmbeddingVector(vectors[0]);
      if (dimError) {
        throw new Error(dimError);
      }

      return { vectors, model: EMBEDDING_MODEL, dimensions: EMBEDDING_DIMENSIONS };
    },
  };
}

// ---------------------------------------------------------------------------
// MobileCLIP-S0 implementation (opt-in)
// ---------------------------------------------------------------------------

const MOBILECLIP_MODEL_NAME = 'mobileclip-s0';

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
    name: MOBILECLIP_MODEL_NAME,

    async embedImages(images: ImageDataUri[]): Promise<EmbeddingResult> {
      if (images.length === 0) {
        return { vectors: [], model: MOBILECLIP_MODEL_NAME, dimensions: EMBEDDING_DIMENSIONS };
      }

      const vectors = await embedWithMobileClip(images);

      return { vectors, model: MOBILECLIP_MODEL_NAME, dimensions: EMBEDDING_DIMENSIONS };
    },
  };
}

/**
 * Resolves the active provider:
 *   • default  → Cohere embed-v4.0 (needs COHERE_API_KEY)
 *   • EMBEDDING_PROVIDER=mobileclip-s0 → local ONNX (needs MODEL_URL)
 * Throws with an actionable message when the required secret is missing.
 */
export function getEmbeddingProvider(): EmbeddingProvider {
  const configured = Deno.env.get('EMBEDDING_PROVIDER')?.trim().toLowerCase();

  if (configured === 'mobileclip-s0' || configured === 'mobileclip') {
    return mobileclipProvider();
  }

  // Default (also when EMBEDDING_PROVIDER is unset or anything unexpected).
  const apiKey = Deno.env.get('COHERE_API_KEY');
  if (!apiKey) {
    throw new Error(
      'COHERE_API_KEY is not configured for edge functions. ' +
        'Set it via: supabase secrets set COHERE_API_KEY=<key>',
    );
  }
  return cohereProvider(apiKey);
}
