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

/** Reads a local file URI and returns it as a data URI (native + web). */
export async function fileUriToDataUri(
  fileUri: string,
  mimeType = 'image/jpeg',
): Promise<string> {
  const { File } = await import('expo-file-system');
  const file = new File(fileUri);
  const buffer = await file.arrayBuffer();
  const base64 = bytesToBase64(new Uint8Array(buffer));
  // The picker can hand over PNG sources; labeling those bytes as
  // image/jpeg corrupts providers that trust the declared MIME. Web picker
  // URIs carry their type in a blob URL fragment — prefer it when present.
  // WebP is NOT supported by MobileCLIP-S0 (no decoder in Deno edge function).
  const detected = /(?:^|[&;])type=image\/(png)(?:[&;]|$)/i.exec(fileUri);
  const resolved =
    detected && KNOWN_IMAGE_MIME.test(`image/${detected[1]};`)
      ? `image/${detected[1].toLowerCase()}`
      : mimeType;
  return `data:${resolved};base64,${base64}`;
}
