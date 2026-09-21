/**
 * Image validation and preparation utilities for the admin reference-image pipeline.
 *
 * Validates image type and size before upload, and prepares images
 * for embedding generation by converting to data URIs.
 */

import { bytesToBase64 } from '@/lib/visual-match/base64';

/** Allowed MIME types for product images. */
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

/** Maximum image file size: 5 MB (binary). */
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** Maximum data URI length for embedding: ~7 MB base64 ≈ 5 MB binary. */
const MAX_DATA_URI_CHARS = 7_000_000;

export type ImageValidationError =
  | 'invalid_type'
  | 'too_large'
  | 'read_failed'
  | 'invalid_format';

export type ValidationResult = {
  ok: boolean;
  error?: ImageValidationError;
  errorMessage?: string;
};

/**
 * Validates an image file before upload.
 * Checks MIME type and file size.
 */
export function validateImage(file: { mimeType?: string; size?: number }): ValidationResult {
  // Check MIME type
  if (file.mimeType && !ALLOWED_MIME_TYPES.includes(file.mimeType as any)) {
    return {
      ok: false,
      error: 'invalid_type',
      errorMessage: `Invalid image type. Allowed: JPEG, PNG, WebP.`,
    };
  }

  // Check file size
  if (file.size && file.size > MAX_IMAGE_BYTES) {
    const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
    return {
      ok: false,
      error: 'too_large',
      errorMessage: `Image is too large (${sizeMB} MB). Maximum size is 5 MB.`,
    };
  }

  return { ok: true };
}

/**
 * Reads a local file URI and converts it to a data URI for embedding.
 * Validates the result doesn't exceed embedding size limits.
 */
export async function fileUriToEmbeddingDataUri(
  localUri: string,
  mimeType = 'image/jpeg',
): Promise<{ ok: true; dataUri: string } | { ok: false; error: ImageValidationError; errorMessage: string }> {
  try {
    const { File } = await import('expo-file-system');
    const file = new File(localUri);

    if (!file.exists) {
      return {
        ok: false,
        error: 'read_failed',
        errorMessage: 'The image file is no longer available.',
      };
    }

    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);

    // Validate size
    if (bytes.length > MAX_IMAGE_BYTES) {
      const sizeMB = (bytes.length / (1024 * 1024)).toFixed(1);
      return {
        ok: false,
        error: 'too_large',
        errorMessage: `Image is too large (${sizeMB} MB). Maximum size is 5 MB.`,
      };
    }

    const base64 = bytesToBase64(bytes);
    const dataUri = `data:${mimeType};base64,${base64}`;

    // Check data URI length
    if (dataUri.length > MAX_DATA_URI_CHARS) {
      return {
        ok: false,
        error: 'too_large',
        errorMessage: 'Image is too large for embedding generation.',
      };
    }

    return { ok: true, dataUri };
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
 */
export function detectMimeType(uri: string): string {
  const ext = uri.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'png':
      return 'image/png';
    case 'webp':
      return 'image/webp';
    case 'jpg':
    case 'jpeg':
    default:
      return 'image/jpeg';
  }
}
