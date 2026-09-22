/**
 * The Find Product search pipeline — ONE path from photo to results.
 *
 *   photo URI
 *     → validate (type/size gates from image-pipeline)
 *     → optimize (image.service: ≤1024 px, JPEG q0.8 — the fix that keeps
 *       the embedding edge's decoder under its memory ceiling)
 *     → convert to data URI (JPEG, the format the engine accepts)
 *     → visual-match edge function (embed → 512 validation → RPC)
 *     → validated VisualMatchOutcome (client.ts joins live prices)
 *
 * There is deliberately NO second search system: the edge function and the
 * RPC it calls are the same ones the admin pipeline uses and were verified
 * live (512-d vector accepted, 511-d rejected, real rows returned).
 *
 * Every failure is a typed SearchFailure (kind + technical detail) so the
 * UI can show a friendly message while development logs keep the cause.
 * Stage callbacks drive the searching screen's REAL progress display.
 */
import { optimizeImage } from '@/services/image.service';
import { validateImageFile, validateAndConvert } from '@/services/image-pipeline.service';
import { matchProductFromPhoto } from '@/services/product-search.service';
import {
  classifySearchError,
  type SearchFailure,
} from '@/utils/user-errors';

/** Stages the searching screen can display, in order. */
export type SearchStage = 'validating' | 'optimizing' | 'embedding' | 'searching' | 'done';

/** Discriminated pipeline outcome. */
export type SearchPipelineResult =
  | { ok: true; outcome: import('@/services/product-search.service').VisualMatchOutcome; durationMs: number }
  | { ok: false; failure: SearchFailure; durationMs: number };

/** Options: abort support + progress reporting. */
export type SearchPipelineOptions = {
  signal?: AbortSignal;
  onStage?: (stage: SearchStage) => void;
};

/**
 * Runs the complete photo → products pipeline.
 * Never throws: every error becomes a typed failure with the technical
 * cause logged via presentFailure at the UI boundary.
 */
export async function runSearchPipeline(
  photoUri: string,
  options: SearchPipelineOptions = {},
): Promise<SearchPipelineResult> {
  const startedAt = Date.now();
  const { signal, onStage } = options;
  const stage = (s: SearchStage) => {
    if (!signal?.aborted) onStage?.(s);
  };

  const fail = (context: string, error: unknown): SearchPipelineResult => {
    const failure = classifySearchError(error, context);
    return { ok: false, failure, durationMs: Date.now() - startedAt };
  };

  try {
    // 0. A photo must exist.
    if (!photoUri || !photoUri.trim()) {
      return {
        ok: false,
        failure: { kind: 'no_photo', technical: 'runSearchPipeline called without a photo URI' },
        durationMs: Date.now() - startedAt,
      };
    }

    // 1. Validate the photo (exists on disk, within the 5 MB source gate).
    stage('validating');
    const validation = await validateImageFile(photoUri);
    if (!validation.ok) {
      return {
        ok: false,
        failure: { kind: 'invalid_image', technical: validation.errorMessage, meta: { code: validation.error } },
        durationMs: Date.now() - startedAt,
      };
    }

    // 2. Optimize (≤1024 px, JPEG q0.8). This is the step whose absence
    //    crashed the embedding edge with maxMemoryUsageInMB on big photos.
    stage('optimizing');
    let optimizedUri: string;
    try {
      const optimized = await optimizeImage(photoUri);
      optimizedUri = optimized.uri;
    } catch (error) {
      return fail('optimize', error);
    }

    // 3. Convert the optimized JPEG to the data URI the engine expects.
    stage('embedding');
    const conversion = await validateAndConvert(optimizedUri);
    if (!conversion.ok) {
      return {
        ok: false,
        failure: { kind: 'read_failed', technical: conversion.errorMessage, meta: { code: conversion.error } },
        durationMs: Date.now() - startedAt,
      };
    }

    // 4 + 5. Embed (edge) → 512 validation (edge) → RPC (edge) → live
    //    products join (client). client.ts already returns typed outcomes
    //    and maps transport errors; convert its error string into a typed
    //    failure here so the UI layer never parses text.
    stage('searching');
    const result = await matchProductFromPhoto(conversion.dataUri, signal);
    if (!result.ok) {
      return fail('visual-match', new Error(result.error));
    }

    stage('done');
    return { ok: true, outcome: result.data, durationMs: Date.now() - startedAt };
  } catch (error) {
    return fail('pipeline', error);
  }
}
