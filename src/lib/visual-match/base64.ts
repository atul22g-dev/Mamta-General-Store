/**
 * Binary → base64 without native Buffer (works on Hermes + web).
 * Processes in chunks to avoid stack overflow on large photos.
 */
export function bytesToBase64(bytes: Uint8Array): string {
  const chars =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

  let result = '';
  const chunkSize = 0x8000; // 32k per String.fromCharCode call

  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    let chunkString = '';
    for (let j = 0; j < chunk.length; j++) {
      chunkString += String.fromCharCode(chunk[j]);
    }
    result += chunkString;
  }

  // Standard base64 alphabet encode.
  let output = '';
  for (let i = 0; i < result.length; i += 3) {
    const byte1 = result.charCodeAt(i);
    const byte2 = i + 1 < result.length ? result.charCodeAt(i + 1) : NaN;
    const byte3 = i + 2 < result.length ? result.charCodeAt(i + 2) : NaN;

    output += chars[byte1 >> 2];
    output += chars[((byte1 & 3) << 4) | (isNaN(byte2) ? 0 : byte2 >> 4)];
    output += isNaN(byte2) ? '=' : chars[((byte2 & 15) << 2) | (isNaN(byte3) ? 0 : byte3 >> 6)];
    output += isNaN(byte3) ? '=' : chars[byte3 & 63];
  }

  return output;
}

/** MIME types the matcher accepts; anything else is sent as JPEG (camera captures). */
const KNOWN_IMAGE_MIME = /^(image\/png)(;|$)/i;

/**
 * Reads a local file URI and returns it as a data URI (native + web).
 *
 * Validates file existence before reading. Detects MIME type from the
 * file URI extension (not from a URL parameter, which is unreliable).
 * WebP is NOT supported by MobileCLIP-S0 (no decoder in Deno edge function).
 */
export async function fileUriToDataUri(
  fileUri: string,
  mimeType = 'image/jpeg',
): Promise<string> {
  const { File } = await import('expo-file-system');
  const file = new File(fileUri);

  if (!file.exists) {
    throw new Error('The captured image is no longer available. Try again.');
  }

  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);

  if (bytes.length === 0) {
    throw new Error('The image file is empty. Try capturing a new photo.');
  }

  const base64 = bytesToBase64(bytes);

  // Detect MIME from file extension (more reliable than URL parameters).
  const ext = fileUri.split('.').pop()?.toLowerCase();
  let resolved = mimeType;
  if (ext === 'png') {
    resolved = 'image/png';
  } else if (ext === 'jpg' || ext === 'jpeg' || ext === 'heic' || ext === 'heif') {
    resolved = 'image/jpeg'; // HEIC/HEIF are transcoded by expo-image-picker
  }

  // WebP is NOT supported — fall back to JPEG (will fail at edge function
  // with a clear error, rather than silently corrupting the payload).
  if (ext === 'webp') {
    resolved = 'image/jpeg';
  }

  // Final validation: only JPEG and PNG are accepted end-to-end.
  if (!KNOWN_IMAGE_MIME.test(`${resolved};`) && resolved !== 'image/jpeg') {
    resolved = 'image/jpeg';
  }

  return `data:${resolved};base64,${base64}`;
}
