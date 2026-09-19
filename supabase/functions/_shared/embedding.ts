/**
 * Embedding provider abstraction for the visual-search backend.
 *
 * The rest of the backend (edge functions) depends only on
 * `embedImages()`; swapping Cohere for another provider (OpenAI CLIP-style,
 * self-hosted model, etc.) means editing this file alone.
 *
 * Runs ONLY inside Supabase Edge Functions (Deno). The COHERE_API_KEY is a
 * Supabase edge-function secret — it never ships inside the Expo app.
 */

export const EMBEDDING_MODEL = 'embed-v4.0';
/** Chosen output dimension — matches the pgvector column `vector(512)`. */
export const EMBEDDING_DIMENSIONS = 512;

/** Data-URI encoded image (jpeg/png/webp/gif), per the Cohere embed API. */
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

// ---------------------------------------------------------------------------
// Cohere implementation
// ---------------------------------------------------------------------------

const COHERE_EMBED_URL = 'https://api.cohere.com/v2/embed';

type CohereEmbedResponse = {
  embeddings?: { float?: number[][] };
  message?: string;
};

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
        const body = (await response.json().catch(() => null)) as CohereEmbedResponse | null;
        throw new Error(
          `Embedding provider error (${response.status}): ${body?.message ?? response.statusText}`,
        );
      }

      const data = (await response.json()) as CohereEmbedResponse;
      const vectors = data.embeddings?.float;

      if (!vectors || vectors.length !== images.length) {
        throw new Error('Embedding provider returned an unexpected response shape.');
      }

      return { vectors, model: EMBEDDING_MODEL, dimensions: EMBEDDING_DIMENSIONS };
    },
  };
}

/** Resolves the active provider from edge-function secrets. Throws if unset. */
export function getEmbeddingProvider(): EmbeddingProvider {
  const apiKey = Deno.env.get('COHERE_API_KEY');
  if (!apiKey) {
    throw new Error('COHERE_API_KEY is not configured for edge functions.');
  }
  return cohereProvider(apiKey);
}
