/**
 * Unified image optimization service — the ONE entry point for turning a
 * camera capture or gallery pick into an upload-ready local JPEG.
 *
 * Responsibilities kept deliberately separate (see "original vs search
 * image" below):
 *   • optimizeImage() — what product uploads and visual search use.
 *     Resizes to ≤1024 px longest edge, JPEG q0.8. The embedding edge's
 *     decoder works far below this size, and oversized frames used to crash
 *     it with "maxMemoryUsageInMB limit exceeded".
 *   • Originals stay ORIGINAL: nothing here touches the picked file, so a
 *     caller that genuinely needs the full-resolution photo (none today)
 *     can read the source URI itself.
 *
 * The same source URI is never processed twice: results are memoized in
 * src/utils/image-optimizer.ts and returned instantly on repeat calls.
 *
 * Logging (console.debug/info) covers: original dimensions, original byte
 * size when available, optimized dimensions, optimized byte size when
 * available, and processing time — so pipeline issues show up in the
 * console with the [image] tag.
 */
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import {
  MAX_EDGE_PX,
  JPEG_QUALITY,
  validateImageUri,
  validateImageType,
  planResize,
  getCachedOptimization,
  rememberOptimization,
  type OptimizerOptions,
  type ResizePlan,
} from '@/utils/image-optimizer';

/** Successful optimization result. */
export type OptimizedImage = {
  /** Local URI of the optimized JPEG (cache directory). */
  uri: string;
  /** Pixel width after optimization. */
  width: number;
  /** Pixel height after optimization. */
  height: number;
  /** Whether a resize transform was applied (false = already small enough). */
  resized: boolean;
  /** True when this result came from the memo cache (no work was done). */
  fromCache: boolean;
  /** Processing time in milliseconds (0 for cache hits). */
  durationMs: number;
};

/** Thrown on invalid input or failed processing — carries a user-safe message. */
export class ImageServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImageServiceError';
  }
}

const TAG = '[image]';

/**
 * Best-effort byte size of a file URI via fetch (works for file:// on both
 * native and web). Returns null when the size cannot be determined — size
 * logging is best-effort by design and never fails the pipeline.
 */
async function probeByteSize(uri: string): Promise<number | null> {
  try {
    const response = await fetch(uri);
    const blob = await response.blob();
    return blob.size > 0 ? blob.size : null;
  } catch {
    return null;
  }
}

function formatBytes(bytes: number | null): string {
  if (bytes === null) return 'unknown';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * Reads the pixel dimensions of an image by rendering it once through the
 * manipulator. Decode errors surface here as ImageServiceError.
 */
async function measureImage(uri: string): Promise<{ width: number; height: number }> {
  try {
    const rendered = await ImageManipulator.manipulate(uri).renderAsync();
    return { width: rendered.width, height: rendered.height };
  } catch (error) {
    throw new ImageServiceError(
      `Could not read the image (${error instanceof Error ? error.message : 'unknown error'}). Pick it again.`,
    );
  }
}

/**
 * Optimizes a camera or image-picker photo for upload + visual search:
 *
 *   1. validate the URI (string, known scheme, no control chars)
 *   2. validate the image type (decodable raster; no SVG/PDF)
 *   3. return instantly if this URI was optimized before (memo cache)
 *   4. read true pixel dimensions (decode is the authority, not picker hints)
 *   5. plan an aspect-ratio-preserving resize — only when the longest edge
 *      exceeds the cap
 *   6. render + save as JPEG at JPEG_QUALITY (normalizes HEIC/PNG/etc.)
 *   7. log original/optimized dimensions + sizes + processing time
 *   8. memoize and return { uri, width, height, resized, fromCache, durationMs }
 *
 * The input file is never modified; the output is a fresh cache file.
 *
 * @param uri   local image URI from the camera / image picker
 *              (file:, content: or data:)
 * @param options optional overrides (maxEdgePx, ignoreCache for tests)
 */
export async function optimizeImage(
  uri: string,
  options: OptimizerOptions = {},
): Promise<OptimizedImage> {
  const startedAt = Date.now();
  const maxEdge = options.maxEdgePx ?? MAX_EDGE_PX;

  // 1. URI validation.
  const uriCheck = validateImageUri(uri);
  if (!uriCheck.valid) {
    throw new ImageServiceError(uriCheck.reason);
  }
  const source = uri.trim();

  // 2. Type validation (raster images only).
  const typeCheck = validateImageType(source);
  if (!typeCheck.valid) {
    throw new ImageServiceError(typeCheck.reason);
  }

  // 3. Memoized result — same image never optimized twice.
  if (!options.ignoreCache) {
    const cached = getCachedOptimization(source);
    if (cached) {
      console.debug(`${TAG} cache hit for ${source.slice(0, 64)}…`);
      return {
        uri: cached.uri,
        width: cached.width,
        height: cached.height,
        resized: true, // conservative: cache stores post-optimization facts
        fromCache: true,
        durationMs: 0,
      };
    }
  }

  // 4. True dimensions.
  const originalSize = await measureImage(source);
  const originalBytes =
    source.startsWith('data:') || source.startsWith('file:') || source.startsWith('content:')
      ? await probeByteSize(source)
      : null;

  // 5. Resize plan (aspect ratio preserved; resize only when needed).
  const plan: ResizePlan = planResize(originalSize.width, originalSize.height, maxEdge);

  // 6. Render + save. The save step ALWAYS re-encodes to JPEG, which
  //    normalizes HEIC/PNG/whatever into the one format the bucket expects.
  try {
    const context = ImageManipulator.manipulate(source);
    if (plan.needsResize && plan.resize) {
      if (plan.resize.width !== null) {
        context.resize({ width: plan.resize.width });
      } else if (plan.resize.height !== null) {
        context.resize({ height: plan.resize.height });
      }
    }
    const rendered = await context.renderAsync();
    const saved = await rendered.saveAsync({
      format: SaveFormat.JPEG,
      compress: JPEG_QUALITY,
    });

    const optimizedBytes = await probeByteSize(saved.uri);
    const durationMs = Date.now() - startedAt;

    // 7. Logging — original vs optimized, everything the requirements list.
    console.info(
      `${TAG} optimized ${originalSize.width}×${originalSize.height}` +
        ` (${formatBytes(originalBytes)})` +
        ` → ${saved.width}×${saved.height}` +
        ` (${formatBytes(optimizedBytes)}, jpeg q${JPEG_QUALITY})` +
        ` in ${durationMs}ms` +
        (plan.needsResize ? '' : ' [no resize needed]'),
    );

    const result: OptimizedImage = {
      uri: saved.uri,
      width: saved.width,
      height: saved.height,
      resized: plan.needsResize,
      fromCache: false,
      durationMs,
    };

    // Memoize (skip when the caller asked to ignore the cache).
    if (!options.ignoreCache) {
      rememberOptimization(source, { uri: saved.uri, width: saved.width, height: saved.height });
    }

    return result;
  } catch (error) {
    if (error instanceof ImageServiceError) throw error;
    throw new ImageServiceError(
      `Could not process the image (${error instanceof Error ? error.message : 'unknown error'}). Pick it again and retry.`,
    );
  }
}

/**
 * Convenience for callers that only need the URI (current upload path).
 * Same pipeline, same cache, same logging.
 */
export async function optimizeImageUri(
  uri: string,
  options: OptimizerOptions = {},
): Promise<string> {
  const result = await optimizeImage(uri, options);
  return result.uri;
}

export { MAX_EDGE_PX, JPEG_QUALITY };
