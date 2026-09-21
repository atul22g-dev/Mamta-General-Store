/**
 * MobileCLIP-S0 ONNX inference engine for Supabase Edge Functions.
 *
 * Runs the MobileCLIP-S0 vision encoder (Apple, MIT license) via
 * onnxruntime-node native CPU backend. No paid AI APIs required.
 *
 * Model specs:
 *   - Input: 224×224×3 RGB image (float32, CHW, CLIP-normalized)
 *   - Output: 512-dim L2-normalized float32 vector
 *   - Size: ~11.5 MB INT8 ONNX
 *   - License: MIT
 *
 * Pipeline: data-URI → decode → resize → CLIP preprocess → ONNX inference → L2 normalize
 *
 * Dependencies (all available via esm.sh in Deno):
 *   - onnxruntime-node (native CPU backend)
 *   - jpeg-js (JPEG decoding)
 *   - pngjs (PNG decoding)
 */

import { EMBEDDING_DIMENSIONS } from './embedding.ts';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MODEL_INPUT_SIZE = 224;
const CLIP_MEAN = [0.485, 0.456, 0.406] as const;
const CLIP_STD = [0.229, 0.224, 0.225] as const;

// ---------------------------------------------------------------------------
// Lazy-loaded ONNX session (singleton, reused across requests per isolate)
// ---------------------------------------------------------------------------

let cachedSession: unknown | null = null;
let modelDownloadUrl: string | null = null;

/**
 * Initialize the model URL from edge-function secrets.
 * Must be called once before embedding; subsequent calls are no-ops.
 */
export function initModelUrl(url: string): void {
  modelDownloadUrl = url;
}

/**
 * Get or create the ONNX InferenceSession. Downloads the model on first
 * call; reuses the cached session for subsequent calls within the same
 * isolate (Edge Function warm start).
 */
async function getSession(): Promise<unknown> {
  if (cachedSession) return cachedSession;
  if (!modelDownloadUrl) {
    throw new Error(
      'MODEL_URL secret not configured. Set it via: supabase secrets set MODEL_URL=<storage-url>',
    );
  }

  // Dynamic imports for Deno compatibility
  // Use onnxruntime-node (native CPU backend) instead of onnxruntime-web
  // (WASM), which doesn't work in Deno Edge Functions.
  const ort = await import('https://esm.sh/onnxruntime-node@1.21.0');
  const response = await fetch(modelDownloadUrl);
  if (!response.ok) {
    throw new Error(`Failed to download ONNX model: HTTP ${response.status}`);
  }
  const modelBuffer = await response.arrayBuffer();

  // Use CPU backend (native, works in Deno Edge Functions)
  const session = await ort.InferenceSession.create(modelBuffer, {
    executionProviders: ['cpu'],
  });

  cachedSession = session;
  return session;
}

// ---------------------------------------------------------------------------
// Image decoding
// ---------------------------------------------------------------------------

interface DecodedImage {
  width: number;
  height: number;
  data: Uint8Array; // RGB bytes, 3 bytes per pixel
}

/**
 * Decode a data-URI image (JPEG or PNG) to raw RGB pixels.
 * WebP is converted to JPEG by the caller before reaching here.
 */
async function decodeDataUri(dataUri: string): Promise<DecodedImage> {
  // Split data URI: "data:image/jpeg;base64,..."
  const match = dataUri.match(/^data:image\/\w+;base64,(.+)$/);
  if (!match) {
    throw new Error('Invalid data URI format');
  }
  const base64 = match[1];
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  // Detect format from MIME
  const mimeMatch = dataUri.match(/^data:(image\/\w+);/);
  const mime = mimeMatch?.[1] ?? 'image/jpeg';

  if (mime === 'image/jpeg' || mime === 'image/jpg') {
    return decodeJpeg(bytes);
  } else if (mime === 'image/png') {
    return decodePng(bytes);
  } else {
    throw new Error(`Unsupported image format: ${mime}`);
  }
}

async function decodeJpeg(bytes: Uint8Array): Promise<DecodedImage> {
  const jpeg = await import('https://esm.sh/jpeg-js@0.4.4');
  const decoded = jpeg.decode(bytes, { useTArray: true, maxMemoryUsageInMB: 128 });

  return {
    width: decoded.width,
    height: decoded.height,
    data: new Uint8Array(decoded.data),
  };
}

async function decodePng(bytes: Uint8Array): Promise<DecodedImage> {
  const { PNG } = await import('https://esm.sh/pngjs@7.1.1');
  const decoded = PNG.sync.read(Buffer.from(bytes));

  return {
    width: decoded.width,
    height: decoded.height,
    data: new Uint8Array(decoded.data),
  };
}

// ---------------------------------------------------------------------------
// Image preprocessing
// ---------------------------------------------------------------------------

/**
 * Bilinear resize an RGB image to target size.
 * Returns Float32Array of shape [targetSize × targetSize × 3] (HWC).
 */
function bilinearResize(
  image: DecodedImage,
  targetSize: number,
): Float32Array {
  const { width, height, data } = image;
  const result = new Float32Array(targetSize * targetSize * 3);

  for (let y = 0; y < targetSize; y++) {
    for (let x = 0; x < targetSize; x++) {
      const srcX = (x / targetSize) * width;
      const srcY = (y / targetSize) * height;

      const x0 = Math.floor(srcX);
      const y0 = Math.floor(srcY);
      const x1 = Math.min(x0 + 1, width - 1);
      const y1 = Math.min(y0 + 1, height - 1);

      const fx = srcX - x0;
      const fy = srcY - y0;

      // Bilinear interpolation for each channel
      for (let c = 0; c < 3; c++) {
        const v00 = data[(y0 * width + x0) * 3 + c] / 255.0;
        const v10 = data[(y0 * width + x1) * 3 + c] / 255.0;
        const v01 = data[(y1 * width + x0) * 3 + c] / 255.0;
        const v11 = data[(y1 * width + x1) * 3 + c] / 255.0;

        const v =
          v00 * (1 - fx) * (1 - fy) +
          v10 * fx * (1 - fy) +
          v01 * (1 - fx) * fy +
          v11 * fx * fy;

        result[(y * targetSize + x) * 3 + c] = v;
      }
    }
  }

  return result;
}

/**
 * Apply CLIP preprocessing: normalize with mean/std, transpose HWC → CHW,
 * and return Float32Array ready for ONNX input.
 *
 * Input: Float32Array [H × W × 3] (HWC, values 0–1)
 * Output: Float32Array [3 × H × W] (CHW, CLIP-normalized)
 */
function clipPreprocess(pixels: Float32Array): Float32Array {
  const size = MODEL_INPUT_SIZE;
  const channels = 3;
  const result = new Float32Array(channels * size * size);

  for (let c = 0; c < channels; c++) {
    const mean = CLIP_MEAN[c];
    const std = CLIP_STD[c];

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const hwcIdx = (y * size + x) * channels + c;
        const chwIdx = c * size * size + y * size + x;
        result[chwIdx] = (pixels[hwcIdx] - mean) / std;
      }
    }
  }

  return result;
}

/**
 * L2-normalize a vector in-place and return it.
 */
function l2Normalize(vector: Float32Array): Float32Array {
  let norm = 0;
  for (let i = 0; i < vector.length; i++) {
    norm += vector[i] * vector[i];
  }
  norm = Math.sqrt(norm);

  if (norm === 0) return vector;

  for (let i = 0; i < vector.length; i++) {
    vector[i] /= norm;
  }
  return vector;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Embed a batch of data-URI images using MobileCLIP-S0.
 * Returns L2-normalized 512-dim float32 vectors.
 */
export async function embedWithMobileClip(
  images: string[],
): Promise<number[][]> {
  if (images.length === 0) return [];

  const session = await getSession();
  const ort = await import('https://esm.sh/onnxruntime-node@1.21.0');

  const vectors: number[][] = [];

  for (const dataUri of images) {
    // 1. Decode data URI to RGB pixels
    const decoded = await decodeDataUri(dataUri);

    // 2. Resize to 224×224 (bilinear)
    const resized = bilinearResize(decoded, MODEL_INPUT_SIZE);

    // 3. CLIP preprocessing (normalize + HWC→CHW)
    const preprocessed = clipPreprocess(resized);

    // 4. Create ONNX input tensor [1, 3, 224, 224]
    const inputTensor = new ort.Tensor('float32', preprocessed, [
      1,
      3,
      MODEL_INPUT_SIZE,
      MODEL_INPUT_SIZE,
    ]);

    // 5. Run inference
    const inputName = (session as { inputNames?: string[] }).inputNames?.[0] ?? 'input';
    const feeds: Record<string, unknown> = { [inputName]: inputTensor };
    const output = await (session as { run: (feeds: Record<string, unknown>) => Promise<unknown> }).run(feeds);

    // 6. Extract output vector
    const outputData = output as { [key: string]: { data: Float32Array } };
    const outputKey = Object.keys(outputData)[0];
    const rawVector = outputData[outputKey].data;

    // 7. L2-normalize
    const normalized = l2Normalize(new Float32Array(rawVector));

    // 8. Validate dimensions
    if (normalized.length !== EMBEDDING_DIMENSIONS) {
      throw new Error(
        `MobileCLIP-S0 returned ${normalized.length} dimensions; ` +
          `expected ${EMBEDDING_DIMENSIONS}. Check model compatibility.`,
      );
    }

    // Convert to regular number array for JSON serialization
    vectors.push(Array.from(normalized));
  }

  return vectors;
}
