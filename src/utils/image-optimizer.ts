/**
 * Pure image-optimization decision logic — no React Native, no expo imports.
 *
 * Everything here is deterministic and Node-testable: given an input URI and
 * optional metadata, it decides WHETHER to optimize, HOW to resize (preserving
 * aspect ratio), and REMEMBERS what it already produced so the same image is
 * never processed twice.
 *
 * The impure side (decoding, resizing, re-encoding via expo-image-manipulator,
 * logging) lives in src/services/image.service.ts.
 */

/** Longest edge cap after optimization (px). */
export const MAX_EDGE_PX = 1024;

/** JPEG compression quality for optimized images. */
export const JPEG_QUALITY = 0.8;

/** Cap on the number of memoized results (LRU-ish: oldest entry evicted). */
const CACHE_LIMIT = 24;

// ---------------------------------------------------------------------------
// URI validation
// ---------------------------------------------------------------------------

/**
 * URI schemes the optimizer can actually read on-device.
 * `file:`/`content:` — native camera capture and gallery picks.
 * `data:` — base64 payloads (web picks, tests, some share sheets).
 * blob:/https: are NOT in this list: expo-image-manipulator cannot decode a
 * blob URL on native, and remote images must be downloaded first (the
 * service layer rejects them with a clear message instead of failing deep).
 */
const SUPPORTED_URI_SCHEMES = ['file:', 'content:', 'data:'] as const;

/** Result of validating an input URI. */
export type UriValidation =
  | { valid: true }
  | { valid: false; reason: string };

/**
 * Validates that a URI is a string the optimizer can process.
 * Checks type, emptiness, scheme, and control-character pollution.
 */
export function validateImageUri(uri: unknown): UriValidation {
  if (typeof uri !== 'string') {
    return { valid: false, reason: 'Image URI is not a string.' };
  }
  const trimmed = uri.trim();
  if (trimmed.length === 0) {
    return { valid: false, reason: 'Image URI is empty.' };
  }
  if (/[\u0000-\u001f\u007f]/.test(trimmed)) {
    return { valid: false, reason: 'Image URI contains invalid characters.' };
  }
  const scheme = trimmed.slice(0, trimmed.indexOf(':') >= 0 ? trimmed.indexOf(':') + 1 : 0);
  if (!(SUPPORTED_URI_SCHEMES as readonly string[]).includes(scheme)) {
    return {
      valid: false,
      reason: `Unsupported image source (${scheme || 'no scheme'}). Use a camera or gallery image.`,
    };
  }
  return { valid: true };
}

// ---------------------------------------------------------------------------
// Image type validation / normalization
// ---------------------------------------------------------------------------

/** The output format is always JPEG — that is the "normalize" step. */
export type OutputFormat = 'jpeg';

/** Known decodable input types (anything else is rejected before decode). */
const KNOWN_IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'heif', 'bmp']);

/**
 * Extracts the file extension from a URI (query-string and fragment aware).
 */
export function getExtension(uri: string): string {
  const match = /\.([a-zA-Z0-9]+)(?:[?#].*)?$/.exec(uri);
  return (match?.[1] ?? '').toLowerCase();
}

/** Result of validating an image type. */
export type TypeValidation =
  | { valid: true; format: OutputFormat }
  | { valid: false; reason: string };

/**
 * Validates the input is a decodable raster image.
 *
 * A data URI is validated by its MIME prefix. A file/content URI is validated
 * by extension when one exists; an extension-less URI (some camera pipelines
 * emit `file:///cache/xyz` with no suffix) is accepted — the decode step is
 * the authoritative check, and rejecting those would break valid captures.
 */
export function validateImageType(uri: string): TypeValidation {
  if (uri.startsWith('data:')) {
    const ok = /^data:image\/(jpeg|jpg|png|webp|gif|heic|heif|bmp)[;,]/i.test(uri);
    return ok
      ? { valid: true, format: 'jpeg' }
      : { valid: false, reason: 'Not a supported image data URI.' };
  }

  const ext = getExtension(uri);
  if (ext === '') return { valid: true, format: 'jpeg' }; // decode decides
  if (ext === 'svg') {
    return { valid: false, reason: 'SVG images are not supported. Use a photo.' };
  }
  if (ext === 'pdf') {
    return { valid: false, reason: 'PDF files are not images. Pick a photo.' };
  }
  if (!KNOWN_IMAGE_EXTENSIONS.has(ext)) {
    return {
      valid: false,
      reason: `Unsupported image type (.${ext}). Use a JPEG, PNG, HEIC or WebP photo.`,
    };
  }
  return { valid: true, format: 'jpeg' };
}

// ---------------------------------------------------------------------------
// Resize planning (aspect-ratio preserving)
// ---------------------------------------------------------------------------

/** Decided transformation for one image. */
export type ResizePlan = {
  /** True when the image exceeds the cap and must be resized. */
  needsResize: boolean;
  /** Pass one dimension, leave the other null → manipulator keeps ratio. */
  resize: { width: number | null; height: number | null } | null;
  /** Original pixel dimensions (as measured/provided). */
  original: { width: number; height: number };
  /** Predicted output dimensions (exact when resize is planned). */
  output: { width: number; height: number };
};

/**
 * Plans an aspect-ratio-preserving resize.
 *
 * Portrait (height > width) resizes by height; landscape by width; squares by
 * either (width chosen for determinism). Only the LONGEST edge is clamped to
 * MAX_EDGE_PX; the other edge follows the original ratio. Images already at
 * or under the cap are NOT resized (requirement 5).
 */
export function planResize(
  width: number,
  height: number,
  maxEdge: number = MAX_EDGE_PX,
): ResizePlan {
  const safeWidth = Number.isFinite(width) && width > 0 ? Math.round(width) : 0;
  const safeHeight = Number.isFinite(height) && height > 0 ? Math.round(height) : 0;

  if (safeWidth === 0 || safeHeight === 0) {
    return {
      needsResize: false,
      resize: null,
      original: { width: safeWidth, height: safeHeight },
      output: { width: safeWidth, height: safeHeight },
    };
  }

  const longestEdge = Math.max(safeWidth, safeHeight);
  if (longestEdge <= maxEdge) {
    return {
      needsResize: false,
      resize: null,
      original: { width: safeWidth, height: safeHeight },
      output: { width: safeWidth, height: safeHeight },
    };
  }

  // Resize the longest edge; the manipulator derives the other proportionally.
  const resize =
    longestEdge === safeWidth
      ? { width: maxEdge, height: null }
      : { width: null, height: maxEdge };

  const ratio = safeHeight / safeWidth;
  const output =
    longestEdge === safeWidth
      ? { width: maxEdge, height: Math.round(maxEdge * ratio) }
      : { width: Math.round(maxEdge / ratio), height: maxEdge };

  return { needsResize: true, resize, original: { width: safeWidth, height: safeHeight }, output };
}

// ---------------------------------------------------------------------------
// Memoization — never optimize the same image twice
// ---------------------------------------------------------------------------

/** What the cache remembers about a completed optimization. */
export type OptimizationRecord = {
  uri: string;
  width: number;
  height: number;
};

/** Entry shape stored in the cache. */
type CacheEntry = {
  record: OptimizationRecord;
  /** Millisecond timestamp of completion — used for eviction order. */
  completedAt: number;
};

/**
 * Process-wide memo of completed optimizations, keyed by source URI.
 * A second call for the same URI returns the first result instantly —
 * no re-decode, no duplicate cache file, no wasted battery.
 */
const optimizationCache = new Map<string, CacheEntry>();

/** Cache stats for tests/logging. */
export function optimizationCacheSize(): number {
  return optimizationCache.size;
}

/** Test/diagnostic hook: clears the memo. */
export function clearOptimizationCache(): void {
  optimizationCache.clear();
}

/**
 * Returns the cached result for a source URI, if any.
 * A found entry is refreshed (treated as most-recently-used).
 */
export function getCachedOptimization(sourceUri: string): OptimizationRecord | null {
  const entry = optimizationCache.get(sourceUri);
  if (!entry) return null;
  entry.completedAt = Date.now();
  return entry.record;
}

/**
 * Records a completed optimization. Evicts the oldest entry when the cache
 * grows past CACHE_LIMIT so long admin sessions cannot grow it unbounded.
 * Cache files live in the OS cache directory, which the OS may clear under
 * pressure — a stale hit is therefore impossible-by-construction only until
 * eviction; after eviction a re-run simply optimizes again (safe, just slower).
 */
export function rememberOptimization(
  sourceUri: string,
  record: OptimizationRecord,
): void {
  if (optimizationCache.size >= CACHE_LIMIT) {
    let oldestKey: string | null = null;
    let oldestTime = Number.POSITIVE_INFINITY;
    for (const [key, entry] of optimizationCache) {
      if (entry.completedAt < oldestTime) {
        oldestTime = entry.completedAt;
        oldestKey = key;
      }
    }
    if (oldestKey) optimizationCache.delete(oldestKey);
  }
  optimizationCache.set(sourceUri, { record, completedAt: Date.now() });
}

/** Options accepted by the service layer (passed through to planning). */
export type OptimizerOptions = {
  /** Override the default longest-edge cap. */
  maxEdgePx?: number;
  /** Skip the memo cache (used by tests). */
  ignoreCache?: boolean;
};
