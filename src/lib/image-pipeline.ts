/**
 * Image pipeline utilities for Find Product.
 *
 * Validates, normalizes, and converts images captured/picked by the user
 * into the format expected by the MobileCLIP-S0 embedding engine:
 *   data:image/(jpeg|png);base64,...
 *
 * Supported formats: JPEG, PNG (HEIC is transcoded to JPEG by
 * expo-image-picker on iOS; the picker never returns raw HEIC bytes).
 * WebP is NOT supported (no decoder in the Deno edge function).
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
  if (!fileUri || !fileUri.trim()) {
    return { ok: false, error: 'file_not_found', errorMessage: 'No image selected.' };
  }

  try {
    const { File } = await import('expo-file-system');
    const file = new File(fileUri);

    if (!file.exists) {
      return {
        ok: false,
        error: 'file_not_found',
        errorMessage: 'The selected image is no longer available. Pick it again.',
      };
    }

    // Read a small portion to check size without loading the whole file.
    const buffer = await file.arrayBuffer();
    const byteLength = buffer.byteLength;

    if (byteLength > MAX_IMAGE_BYTES) {
      const sizeMB = (byteLength / (1024 * 1024)).toFixed(1);
      return {
        ok: false,
        error: 'file_too_large',
        errorMessage: `Image is too large (${sizeMB} MB). Maximum size is 5 MB.`,
      };
    }

    return { ok: true, size: byteLength };
  } catch {
    return {
      ok: false,
      error: 'read_failed',
      errorMessage: 'Could not read the image file.',
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
  // Step 1: Validate file exists and size
  const validation = await validateImageFile(fileUri);
  if (!validation.ok) {
    return { ok: false, error: validation.error, errorMessage: validation.errorMessage };
  }

  // Step 2: Read bytes
  let bytes: Uint8Array;
  try {
    const { File } = await import('expo-file-system');
    const file = new File(fileUri);
    const buffer = await file.arrayBuffer();
    bytes = new Uint8Array(buffer);
  } catch {
    return {
      ok: false,
      error: 'read_failed',
      errorMessage: 'Could not read the image file. Try again.',
    };
  }

  // Step 3: Detect MIME type
  const mimeType = detectMimeTypeFromUri(fileUri);
  if (!SUPPORTED_MIME_TYPES.includes(mimeType as (typeof SUPPORTED_MIME_TYPES)[number])) {
    return {
      ok: false,
      error: 'unsupported_format',
      errorMessage: `Unsupported image format. Use JPEG or PNG.`,
    };
  }

  // Step 4: Convert to base64 data URI
  const { bytesToBase64 } = await import('@/lib/visual-match/base64');
  const base64 = bytesToBase64(bytes);
  const dataUri = `data:${mimeType};base64,${base64}`;

  // Step 5: Validate final data URI size
  if (dataUri.length > MAX_DATA_URI_CHARS) {
    return {
      ok: false,
      error: 'file_too_large',
      errorMessage: 'Image is too large for analysis. Try a smaller photo.',
    };
  }

  return { ok: true, dataUri, mimeType, byteLength: bytes.length };
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
