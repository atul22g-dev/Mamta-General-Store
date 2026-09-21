/**
 * MobileCLIP-S0 image embeddings for Supabase Edge Functions.
 *
 * Implementation: `onnxruntime-web` (WASM) imported from esm.sh + the
 * MobileCLIP-S0 vision tower ONNX from the Hugging Face Hub. ZERO API keys,
 * zero native addons, zero paid services. Verified live end-to-end in an
 * edge isolate (2026-09-22): 11.8 MB quantized model, ~1.0 s inference,
 * output `image_embeds` [1, 512].
 *
 * Verified dead ends on this platform (2026-09-22):
 *   - onnxruntime-node: native addon → cannot run/deploy on Edge.
 *   - transformers.js npm: graph → exceeds the server-side bundler (500).
 *   - transformers.js CDN builds → crash the worker at module init.
 *   - CLIP ViT-B/32 fp32 (176 MB fp16 / 605 MB fp32) → exceeds edge memory.
 *
 * Pipeline per image:
 *   data-URI → jpeg-js/pngjs decode (pure JS)
 *            → preprocess (resize short side 256, center crop 256×256,
 *              rescale ×1/255 — normalization is inside the graph)
 *            → ONNX vision encoder (WASM)
 *            → L2-normalize → 512-dim vector (pgvector `vector(512)`)
 *
 * Model URL override: MOBILECLIP_MODEL_URL secret (must be a 512-dim
 * CLIP-style vision ONNX with pixel_values input / image_embeds output,
 * e.g. the fp32 variant at .../onnx/vision_model.onnx).
 */

import { Buffer } from 'node:buffer';
import jpegMod from 'npm:jpeg-js@0.4.4';
import pngjsMod from 'npm:pngjs@7.0.0';

// deno-lint-ignore no-explicit-any
const jpeg: any = (jpegMod as any).default ?? jpegMod;
// deno-lint-ignore no-explicit-any
const pngjs: any = (pngjsMod as any).default ?? pngjsMod;

/** Local copy to avoid an import cycle with ./embedding.ts. */
const EMBEDDING_DIMS = 512;

const DEFAULT_MODEL_URL =
  'https://huggingface.co/Xenova/mobileclip_s0/resolve/main/onnx/vision_model_quantized.onnx';

const MODEL_URL = Deno.env.get('MOBILECLIP_MODEL_URL') ?? DEFAULT_MODEL_URL;

/** MobileCLIP-S0 preprocessing: rescale-only (normalization is in-graph). */
const RESCALE_FACTOR = 1 / 255;
const INPUT_SIZE = 256;

// ---------------------------------------------------------------------------
// Lazy singletons: ort module, inference session (model downloaded once per
// isolate and reused for every request handled by that isolate).
// ---------------------------------------------------------------------------
// deno-lint-ignore no-explicit-any
let ortPromise: Promise<any> | null = null;
// deno-lint-ignore no-explicit-any
let sessionPromise: Promise<any> | null = null;

// deno-lint-ignore no-explicit-any
async function getOrt(): Promise<any> {
  if (!ortPromise) {
    const promise = (async () => {
      const mod = await import('https://esm.sh/onnxruntime-web@1.14.0');
      // deno-lint-ignore no-explicit-any
      const ort: any = (mod as any).InferenceSession ? mod : (mod as any).default;
      if (!ort?.InferenceSession) {
        throw new Error('onnxruntime-web did not expose InferenceSession.');
      }
      // Single-threaded WASM: edge isolates have no SharedArrayBuffer.
      // Pin the .wasm binary location to the matching CDN dist (in the edge
      // there is no document/script URL for ort to resolve relative paths).
      try {
        ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.14.0/dist/';
        ort.env.wasm.numThreads = 1;
        ort.env.wasm.proxy = false;
      } catch {
        // env shape may differ across versions — non-fatal.
      }
      return ort;
    })();
    promise.catch(() => {
      ortPromise = null;
    });
    ortPromise = promise;
  }
  return ortPromise;
}

// deno-lint-ignore no-explicit-any
async function getSession(): Promise<any> {
  if (!sessionPromise) {
    const promise = (async () => {
      const ort = await getOrt();
      const response = await fetch(MODEL_URL);
      if (!response.ok) {
        throw new Error(`Model download failed (HTTP ${response.status}) from ${MODEL_URL}.`);
      }
      const modelBytes = new Uint8Array(await response.arrayBuffer());
      return await ort.InferenceSession.create(modelBytes, {
        executionProviders: ['wasm'],
        graphOptimizationLevel: 'all',
      });
    })();
    // A failed init (network blip) must not poison the singleton forever.
    promise.catch(() => {
      sessionPromise = null;
    });
    sessionPromise = promise;
  }
  return sessionPromise;
}

// ---------------------------------------------------------------------------
// Image decoding (pure JS — no platform image decoders)
// ---------------------------------------------------------------------------

interface DecodedImage {
  width: number;
  height: number;
  data: Uint8Array; // RGB bytes, 3 bytes per pixel
}

function dataUriToBytes(dataUri: string): { mime: string; bytes: Uint8Array } {
  const match = dataUri.match(/^data:(image\/[\w.+-]+);base64,(.+)$/);
  if (!match) {
    throw new Error('Invalid data URI format (expected data:image/...;base64,...)');
  }
  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return { mime: match[1], bytes };
}

/** RGBA (4 bytes/pixel) → RGB (3 bytes/pixel). */
function rgbaToRgb(rgba: Uint8Array): Uint8Array {
  const rgb = new Uint8Array((rgba.length / 4) * 3);
  for (let i = 0, j = 0; i < rgba.length; i += 4, j += 3) {
    rgb[j] = rgba[i];
    rgb[j + 1] = rgba[i + 1];
    rgb[j + 2] = rgba[i + 2];
  }
  return rgb;
}

async function decodeDataUri(dataUri: string): Promise<DecodedImage> {
  const { mime, bytes } = dataUriToBytes(dataUri);

  if (mime === 'image/jpeg' || mime === 'image/jpg') {
    const decoded = jpeg.decode(bytes, { useTArray: true, maxMemoryUsageInMB: 128 }) as {
      width: number;
      height: number;
      data: Uint8Array; // RGBA
    };
    return { width: decoded.width, height: decoded.height, data: rgbaToRgb(decoded.data) };
  }

  if (mime === 'image/png') {
    // pngjs is a Node-era CJS lib: it calls Buffer methods (readUInt32BE…)
    // on its input, so bytes must be wrapped in a real Buffer.
    const decoded = pngjs.PNG.sync.read(Buffer.from(bytes)) as {
      width: number;
      height: number;
      data: Uint8Array; // RGBA
    };
    return { width: decoded.width, height: decoded.height, data: rgbaToRgb(decoded.data) };
  }

  throw new Error(`Unsupported image format: ${mime}`);
}

// ---------------------------------------------------------------------------
// Preprocessing: resize (bilinear) so the short side is 256, center crop
// 256×256, rescale ×1/255, pack NCHW float32 (MobileCLIP-S0 contract:
// do_normalize=false — per-channel standardization is fused into the graph).
// ---------------------------------------------------------------------------

function resizeBilinear(src: DecodedImage, dstW: number, dstH: number): DecodedImage {
  const { width: srcW, height: srcH, data } = src;
  const out = new Uint8Array(dstW * dstH * 3);
  const xRatio = srcW / dstW;
  const yRatio = srcH / dstH;
  for (let y = 0; y < dstH; y++) {
    const sy = Math.min(srcH - 1, Math.max(0, (y + 0.5) * yRatio - 0.5));
    const y0 = Math.floor(sy);
    const y1 = Math.min(srcH - 1, y0 + 1);
    const fy = sy - y0;
    for (let x = 0; x < dstW; x++) {
      const sx = Math.min(srcW - 1, Math.max(0, (x + 0.5) * xRatio - 0.5));
      const x0 = Math.floor(sx);
      const x1 = Math.min(srcW - 1, x0 + 1);
      const fx = sx - x0;

      const i00 = (y0 * srcW + x0) * 3;
      const i01 = (y0 * srcW + x1) * 3;
      const i10 = (y1 * srcW + x0) * 3;
      const i11 = (y1 * srcW + x1) * 3;
      const o = (y * dstW + x) * 3;

      for (let c = 0; c < 3; c++) {
        const top = data[i00 + c] * (1 - fx) + data[i01 + c] * fx;
        const bottom = data[i10 + c] * (1 - fx) + data[i11 + c] * fx;
        out[o + c] = Math.round(top * (1 - fy) + bottom * fy);
      }
    }
  }
  return { width: dstW, height: dstH, data: out };
}

function centerCrop(image: DecodedImage, size: number): DecodedImage {
  const startX = Math.floor((image.width - size) / 2);
  const startY = Math.floor((image.height - size) / 2);
  const out = new Uint8Array(size * size * 3);
  for (let y = 0; y < size; y++) {
    const srcRow = ((startY + y) * image.width + startX) * 3;
    const dstRow = y * size * 3;
    out.set(image.data.subarray(srcRow, srcRow + size * 3), dstRow);
  }
  return { width: size, height: size, data: out };
}

function toClipTensorInput(image: DecodedImage): Float32Array {
  // Resize short side to 256 (preserve aspect), then center-crop.
  const scale = INPUT_SIZE / Math.min(image.width, image.height);
  const resizedW = Math.max(INPUT_SIZE, Math.round(image.width * scale));
  const resizedH = Math.max(INPUT_SIZE, Math.round(image.height * scale));
  const cropped = centerCrop(resizeBilinear(image, resizedW, resizedH), INPUT_SIZE);

  // NCHW float32, rescaled to [0, 1].
  const tensor = new Float32Array(3 * INPUT_SIZE * INPUT_SIZE);
  const plane = INPUT_SIZE * INPUT_SIZE;
  for (let i = 0; i < plane; i++) {
    for (let c = 0; c < 3; c++) {
      tensor[c * plane + i] = cropped.data[i * 3 + c] * RESCALE_FACTOR;
    }
  }
  return tensor;
}

function l2Normalize(vector: number[]): number[] {
  let sumSq = 0;
  for (const v of vector) sumSq += v * v;
  const norm = Math.sqrt(sumSq);
  if (norm === 0 || !Number.isFinite(norm)) {
    throw new Error('Model produced a zero/invalid embedding — cannot normalize.');
  }
  return vector.map((v) => v / norm);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Legacy hook from the ONNX-node era; the model now comes from MOBILECLIP_MODEL_URL. */
export function initModelUrl(_url: string): void {
  // Intentionally a no-op — kept so ./embedding.ts stays source-compatible.
}

/**
 * Embed a batch of data-URI images with MobileCLIP-S0 (WASM).
 * Returns L2-normalized 512-dim float32 vectors (one per input, same order).
 */
export async function embedWithMobileClip(images: string[]): Promise<number[][]> {
  if (images.length === 0) return [];

  const ort = await getOrt();
  const session = await getSession();

  const inputName = session.inputNames[0];
  const outputName = session.outputNames[0];

  const vectors: number[][] = [];

  for (const dataUri of images) {
    // 1. Decode to RGB bytes (pure JS).
    const decoded = await decodeDataUri(dataUri);
    if (decoded.data.length === 0) {
      throw new Error('The image decoded to zero pixels.');
    }

    // 2. CLIP preprocessing → float32 NCHW tensor.
    const pixelValues = toClipTensorInput(decoded);
    const input = new ort.Tensor('float32', pixelValues, [1, 3, INPUT_SIZE, INPUT_SIZE]);

    // 3. Vision encoder forward pass.
    const results = await session.run({ [inputName]: input });
    const output = results[outputName];
    if (!output?.data) {
      throw new Error('Vision model returned no output tensor.');
    }

    // 4. Validate dimension, L2-normalize (CLIP embedding space).
    const raw = Array.from(output.data as Float32Array);
    if (raw.length !== EMBEDDING_DIMS) {
      throw new Error(
        `The configured vision model returned ${raw.length} dimensions; expected ${EMBEDDING_DIMS}. ` +
          `Set MOBILECLIP_MODEL_URL to a 512-dim CLIP-style vision ONNX model.`,
      );
    }
    vectors.push(l2Normalize(raw));
  }

  return vectors;
}
