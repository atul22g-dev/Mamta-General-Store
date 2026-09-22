/**
 * Image pipeline utilities for Find Product.
 *
 * Validates, normalizes, and converts images captured/picked by the user
 * into the format the embedding engine expects:
 *   data:image/(jpeg|png);base64,...
 *
 * Supported formats: JPEG, PNG (HEIC is transcoded to JPEG by
 * expo-image-picker on iOS; the picker never returns raw HEIC bytes).
 * WebP is NOT supported (no decoder in the Deno edge function).
 *
 * TWO WAYS TO READ A PICKED PHOTO (both needed — see readImageBytes):
 *   • `file://` on a device → expo-file-system's File API, because React
 *     Native's fetch does not reliably read file:// URIs on Android's new
 *     architecture (it fails with an opaque network error).
 *   • everything else, including every browser pick → fetch(). expo-file-system
 *     does NOT exist on web, so reading a picked photo with it made the whole
 *     Find Product flow fail on the browser build before the request was ever
 *     sent: the picker returned a `blob:` URI, the read failed, and the screen
 *     sat there with "Could not read the image file".
 */

/** Supported image MIME types for the embedding pipeline. */
export const SUPPORTED_MIME_TYPES = ['image/jpeg', 'image/png'] as const;

/** Maximum image file size: 5 MB (binary). Matches storage policy cap. */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** Maximum data URI length for embedding: ~7 MB base64 ≈ 5 MB binary. */
export const MAX_DATA_URI_CHARS = 7_000_000;

export type ImagePipelineError =
  | 'file_not_found'
  | 'file_too_large'
  | 'unsupported_format'
  | 'read_failed'
  | 'conversion_failed';

export type ImagePipelineResult =
  | { ok: true; dataUri: string; mimeType: string; byteLength: number }
  | { ok: false; error: ImagePipelineError; errorMessage: string };

/** A device-local path (native) as opposed to something fetch() can read. */
function isDeviceFilePath(uri: string): boolean {
  return /^file:|^content:/i.test(uri);
}

type ReadOutcome =
  | { kind: 'bytes'; bytes: Uint8Array; contentType: string | null }
  /** A `file://` path that is genuinely gone (uninstalled/cleared cache). */
  | { kind: 'missing' };

/**
 * The one place a picked photo's bytes are read.
 *
 * `file:`/`content:` paths go through expo-file-system; anything else (blob:,
 * data:, http(s): — i.e. every browser pick and every preview) goes through
 * fetch. A `file:` path is only reported missing when the file API actually
 * answered, so the web build degrades to fetch instead of claiming the photo
 * disappeared.
 */
async function readImageBytes(uri: string): Promise<ReadOutcome> {
  if (isDeviceFilePath(uri)) {
    try {
      const { File } = await import('expo-file-system');
      const file = new File(uri);
      if (!file.exists) return { kind: 'missing' };
      return { kind: 'bytes', bytes: new Uint8Array(await file.arrayBuffer()), contentType: null };
    } catch {
      // expo-file-system has no web implementation — fall through to fetch.
    }
  }

  const response = await fetch(uri);
  if (!response.ok) {
    throw new Error(`Could not read the image (HTTP ${response.status}).`);
  }
  return {
    kind: 'bytes',
    bytes: new Uint8Array(await response.arrayBuffer()),
    contentType: response.headers.get('content-type'),
  };
}

/**
 * Size of a picked photo WITHOUT reading its pixels: the device path answers
 * from file metadata, the browser path from the blob's length. Used by
 * validateImageFile so an oversized photo is rejected before anything is read
 * into memory.
 */
async function measureImage(uri: string): Promise<{ kind: 'size'; size: number } | { kind: 'missing' }> {
  if (isDeviceFilePath(uri)) {
    try {
      const { File } = await import('expo-file-system');
      const file = new File(uri);
      if (!file.exists) return { kind: 'missing' };
      if (typeof file.size === 'number') return { kind: 'size', size: file.size };
      return { kind: 'size', size: (await file.arrayBuffer()).byteLength };
    } catch {
      // expo-file-system has no web implementation — fall through to fetch.
    }
  }

  const response = await fetch(uri);
  if (!response.ok) {
    throw new Error(`Could not read the image (HTTP ${response.status}).`);
  }
  if (uri.startsWith('data:')) {
    // Standard base64 arithmetic — React Native computes Response.blob()
    // slowly (native blob store + base64 round-trip, see the expo-blob
    // warning), and a data URI's length is exact math anyway.
    const { dataUriByteSize } = await import('@/utils/image-optimizer');
    const size = dataUriByteSize(uri);
    if (size !== null) return { kind: 'size', size };
  }
  return { kind: 'size', size: (await response.blob()).size };
}

/**
 * Blob/data URLs carry no file extension, so prefer what the response says it
 * is and fall back to the URI's extension (the device path).
 */
function resolveMimeType(uri: string, contentType: string | null): string {
  const fromResponse = contentType?.split(';')[0].trim().toLowerCase();
  if (fromResponse && SUPPORTED_MIME_TYPES.includes(fromResponse as (typeof SUPPORTED_MIME_TYPES)[number])) {
    return fromResponse;
  }
  if (fromResponse === 'image/jpg') return 'image/jpeg';
  return detectMimeTypeFromUri(uri);
}

/**
 * Validates a file URI before reading. Checks:
 * 1. URI is non-empty
 * 2. File exists on disk
 * 3. File size is within limits
 *
 * Does NOT read the file — use validateAndConvert() for the full pipeline.
 */
export async function validateImageFile(
  fileUri: string,
): Promise<{ ok: true; size: number } | { ok: false; error: ImagePipelineError; errorMessage: string }> {
  if (!fileUri?.trim()) {
    return { ok: false, error: 'file_not_found', errorMessage: 'No image selected.' };
  }

  try {
    const outcome = await measureImage(fileUri);
    if (outcome.kind === 'missing') {
      return {
        ok: false,
        error: 'file_not_found',
        errorMessage: 'The selected image is no longer available. Pick it again.',
      };
    }

    const size = outcome.size;
    if (size > MAX_IMAGE_BYTES) {
      return {
        ok: false,
        error: 'file_too_large',
        errorMessage: `Image is too large (${(size / (1024 * 1024)).toFixed(1)} MB). Maximum size is 5 MB.`,
      };
    }

    return { ok: true, size };
  } catch (error) {
    return {
      ok: false,
      error: 'read_failed',
      errorMessage: error instanceof Error ? error.message : 'Could not read the image file.',
    };
  }
}

/**
 * Detects MIME type from a file URI extension.
 * Returns 'image/jpeg' as default (camera captures on most platforms).
 */
export function detectMimeTypeFromUri(uri: string): string {
  const ext = uri.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'png':
      return 'image/png';
    case 'jpg':
    case 'jpeg':
    case 'heic':
    case 'heif':
      return 'image/jpeg'; // HEIC/HEIF are transcoded by expo-image-picker
    default:
      return 'image/jpeg';
  }
}

/**
 * Full pipeline: validate → read → convert to data URI.
 *
 * 1. Validates file existence and size
 * 2. Reads binary bytes
 * 3. Detects MIME type from URI extension
 * 4. Converts to base64 data URI
 * 5. Validates final data URI size
 *
 * @param fileUri local file:// URI from camera or gallery picker
 * @returns data URI ready for the embedding engine
 */
export async function validateAndConvert(fileUri: string): Promise<ImagePipelineResult> {
  if (!fileUri?.trim()) {
    return { ok: false, error: 'file_not_found', errorMessage: 'No image selected.' };
  }

  try {
    const outcome = await readImageBytes(fileUri);
    if (outcome.kind === 'missing') {
      return { ok: false, error: 'file_not_found', errorMessage: 'The selected image is no longer available. Pick it again.' };
    }

    const { bytes, contentType } = outcome;
    if (bytes.byteLength > MAX_IMAGE_BYTES) {
      return { ok: false, error: 'file_too_large', errorMessage: 'Image is too large. Maximum size is 5 MB.' };
    }

    const mimeType = resolveMimeType(fileUri, contentType);
    if (!SUPPORTED_MIME_TYPES.includes(mimeType as (typeof SUPPORTED_MIME_TYPES)[number])) {
      return { ok: false, error: 'unsupported_format', errorMessage: 'Unsupported image format. Use JPEG or PNG.' };
    }

    const { bytesToBase64 } = await import('@/utils/base64');
    const dataUri = `data:${mimeType};base64,${bytesToBase64(bytes)}`;

    if (dataUri.length > MAX_DATA_URI_CHARS) {
      return { ok: false, error: 'file_too_large', errorMessage: 'Image is too large for analysis. Try a smaller photo.' };
    }

    return { ok: true, dataUri, mimeType, byteLength: bytes.byteLength };
  } catch (error) {
    return {
      ok: false,
      error: 'read_failed',
      errorMessage: error instanceof Error ? error.message : 'Could not read the image file. Try again.',
    };
  }
}

/**
 * Checks if a data URI is valid for the embedding engine.
 * Validates format (JPEG/PNG), base64 encoding, and size.
 */
export function isValidEmbeddingDataUri(dataUri: string): boolean {
  if (dataUri.length > MAX_DATA_URI_CHARS) return false;
  // WebP is NOT supported — only JPEG and PNG.
  return /^data:image\/(png|jpeg|jpg);base64,[A-Za-z0-9+/=]+$/.test(dataUri);
}
