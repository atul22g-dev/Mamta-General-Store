/**
 * Single embedding provider for the app.
 *
 * There is exactly ONE provider on purpose. It is free, needs no API key,
 * downloads nothing, and produces the 512 dimensions the pgvector column
 * expects. Reference images and search photos must always go through the same
 * function, or their vectors would live in different spaces and every
 * similarity score would be meaningless.
 *
 * The implementation is a pure-JS image descriptor — see
 * ./embedding-engine.ts for why the previous MobileCLIP-S0/ONNX engine could
 * not run on this platform.
 */
import { embedImages as embedImageDataUris } from './embedding-engine.ts';

export const EMBEDDING_MODEL = 'visual-descriptor-v1';
export const EMBEDDING_DIMENSIONS = 512;

export type ImageDataUri = string;

export type EmbeddingResult = {
  vectors: number[][];
  model: string;
  dimensions: number;
};

export type EmbeddingProvider = {
  name: string;
  embedImages(images: ImageDataUri[]): Promise<EmbeddingResult>;
};

export function validateEmbeddingVector(
  vector: unknown,
  expectedDimensions: number = EMBEDDING_DIMENSIONS,
): string | null {
  if (!Array.isArray(vector)) return 'Embedding vector is not an array.';
  if (vector.length !== expectedDimensions) {
    return `Embedding dimension mismatch: got ${vector.length}, expected ${expectedDimensions}.`;
  }
  for (let i = 0; i < vector.length; i += 1) {
    if (typeof vector[i] !== 'number' || !Number.isFinite(vector[i])) {
      return `Embedding contains invalid value at index ${i}: ${vector[i]}.`;
    }
  }
  return null;
}

function imageDescriptorProvider(): EmbeddingProvider {
  return {
    // EMBEDDING_MODEL (declared above) — this previously referenced an
    // undefined identifier, so every call to getEmbeddingProvider() threw
    // `ReferenceError: MOBILECLIP_MODEL_NAME is not defined` at runtime and
    // both edge functions returned HTTP 500. TypeScript never caught it
    // because tsconfig.json excludes supabase/functions (Deno runtime), so
    // it only surfaced in production.
    name: EMBEDDING_MODEL,

    async embedImages(images: ImageDataUri[]): Promise<EmbeddingResult> {
      if (images.length === 0) {
        return { vectors: [], model: EMBEDDING_MODEL, dimensions: EMBEDDING_DIMENSIONS };
      }

      let vectors: number[][];
      try {
        vectors = await embedImageDataUris(images);
      } catch (error) {
        // Distinguish decode/inference failures from network/product failures
        // so the caller can surface EMBEDDING_ERROR instead of a generic 500.
        throw new Error(
          `Embedding failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }

      return { vectors, model: EMBEDDING_MODEL, dimensions: EMBEDDING_DIMENSIONS };
    },
  };
}

/** Always use the free, dependency-free image descriptor provider. */
export function getEmbeddingProvider(): EmbeddingProvider {
  return imageDescriptorProvider();
}
