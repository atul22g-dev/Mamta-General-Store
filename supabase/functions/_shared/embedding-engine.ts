/**
 * Product-image descriptor — the "photo → 512-dim vector" step for both
 * indexing (`embed-product-image`) and search (`visual-match`).
 *
 * WHY THIS IS PURE JS, NOT ONNX
 * ---------------------------------------------------------------------------
 * This file previously ran MobileCLIP-S0 through `onnxruntime-web` (WASM).
 * That is not possible on this platform, and the failures were proven, not
 * guessed (2026-09-22), one wall at a time:
 *
 *   1. The provider referenced `MOBILECLIP_MODEL_NAME`, declared nowhere, so
 *      every photo got HTTP 500 `ReferenceError`. (Fixed separately.)
 *   2. The runtime was loaded with `await import('https://esm.sh/…')`. Deno
 *      Deploy needs the whole module graph at deploy time, so a runtime remote
 *      import is never bundled: `Module not found`, HTTP 500 on every photo.
 *   3. Switched to a static `npm:` import of the only build `onnxruntime-web@
 *      1.14.0` ships — a browser UMD bundle (`dist/ort-web.min.js`). That
 *      release has no ESM build at all. Evaluating it inside the edge isolate
 *      terminated the isolate at module-init time: a probe function whose
 *      entire body was `return 8 bytes of JSON` failed with WORKER_ERROR in
 *      ~4s, while an unrelated function on the same platform answered normally
 *      in the same run. The diagnostic was removed after use.
 *   4. Newer releases (1.17–1.22) do ship `.mjs`, but their WASM glue is
 *      loaded by a runtime dynamic `import()` of `wasmPaths.mjs` — the same
 *      denied pattern as (2) — and they need a ~11 MB WASM binary on top of
 *      the 11.8 MB model inside an isolate with a small memory/CPU budget.
 *
 * So the vector is computed directly from pixels instead: deterministic, no
 * model download, no WASM, no API key, a few milliseconds per photo, and it
 * runs anywhere JavaScript runs — it is unit-tested in Node against real
 * pixels with no image codec at all (tests/image-descriptor.test.mjs).
 *
 * HOW MATCHING WORKS
 * ---------------------------------------------------------------------------
 * 512 floats, L2-normalized, in the SAME space for reference images and query
 * photos, so the existing `vector(512)` column, HNSW index and
 * `visual_search_matches` cosine RPC all keep working unchanged.
 *
 *   1. Build a 32×32 grid of luma + chromaticity (box averaging, one pass).
 *   2. FIND THE PRODUCT and normalize it: cells that differ from the photo's
 *      own border colour are the subject; the grid is re-mapped so the subject
 *      fills the canonical frame. This is what makes the same ball score 0.97
 *      whether it was photographed close up, from across the shop, or off to
 *      one side (measured 0.62–0.74 without it), and it is the single biggest
 *      contributor to matching working at all. Photos where no subject can be
 *      isolated (cluttered scene, full-frame texture) fall back to the whole
 *      frame, so the normalization can only help, never refuse a photo.
 *   3. Describe what is LEFT with orientation histograms: how much edge detail
 *      each region points in each direction. A histogram forgets WHERE inside
 *      a region an edge was, which is what tolerates the small residual
 *      misalignments after normalization. A global orientation histogram adds
 *      a version that ignores position entirely.
 *   4. Describe COLOUR with a hue histogram plus an illumination-invariant
 *      layout (per-region colour ratios and relative brightness). Ratios, not
 *      raw RGB, so brighter or dimmer photos move nothing. These are what
 *      separate products sharing a silhouette — a yellow ball from a green
 *      ball — which structure alone cannot do.
 *   5. DECIDE with both signals, not with their sum: `compareDescriptors`
 *      scores structure (dims 0..455) and colour (456..511) independently and
 *      keeps the weaker one, so a lookalike cannot pass on one signal alone.
 *      See the measured numbers in its own comment — this is the difference
 *      between identifying a product and identifying a similarly shaped or
 *      similarly coloured one.
 *
 * Every histogram is centred on uniform, so featureless regions contribute
 * nothing and cannot make unrelated images look alike by sharing a large
 * positive mean. See tests/image-descriptor.test.mjs for the measured
 * same-product / different-product score table the weights were chosen from.
 *
 * TRADE-OFF, STATED PLAINLY
 * ---------------------------------------------------------------------------
 * This matches on what a product LOOKS like, not on what it means. It is
 * excellent for "the item I am holding is the item in the catalog" — the
 * shop-floor use case — and correctly refuses an unrelated photo. It will not
 * do CLIP's semantic reasoning (e.g. matching a red shoe to a blue shoe
 * because both are shoes). For a single store's own catalog that is the right
 * trade: it works, deterministically, with no external service.
 */
import { Buffer } from 'node:buffer';
import jpegMod from 'npm:jpeg-js@0.4.4';
import pngjsMod from 'npm:pngjs@7.0.0';

// deno-lint-ignore no-explicit-any
const jpeg: any = (jpegMod as any).default ?? jpegMod;
// deno-lint-ignore no-explicit-any
const pngjs: any = (pngjsMod as any).default ?? pngjsMod;

/** Must match `public.product_images.embedding` (vector(512)) and the RPC. */
const EMBEDDING_DIMS = 512;

/** Luma/chroma grid the features are pooled from. */
const GRID = 32;
/** Coarse layout: 4×4 blocks of 8×8 cells. */
const COARSE = 4;
/** Fine layout: 8×8 blocks of 4×4 cells. */
const FINE = 8;

const COARSE_BINS = 8;
const FINE_BINS = 4;
/**
 * 8 hue bins (45° each). The resolution matters more than it looks: with 4
 * bins (90°) red and yellow share a bin, so a yellow ball and a red carton
 * would REINFORCE each other on colour and the two products drifted together
 * (measured: 0.20 → 0.66 similarity when the bins were coarsened).
 */
const HUE_BINS = 8;

/** 4×4 blocks × 2 chromaticity ratios, plus a 4×4 relative-brightness map. */
const COLOUR_BLOCKS = 4;

/**
 * Group weights (512 dimensions: 456 structure, 56 colour). Calibrated against
 * the score table in tests/image-descriptor.test.mjs.
 *
 *   SILHOUETTE_WEIGHT — the product's OUTLINE (a ball's disc against a
 *     carton's rectangle), which nothing else in this file captures. Measured
 *     as the single most valuable discriminator here: without it, a yellow
 *     carton scored 0.735 against a yellow ball (above a genuine re-shot),
 *     because the hue group alone hands ~0.5 to anything sharing a colour.
 *   HUE_WEIGHT — the strongest signal for telling two same-shaped products
 *     apart. Bounded from below by the green ball (must lose) and from above
 *     by the yellow carton (colour agrees, so shape must win).
 *   GLOBAL_ORIENTATION_WEIGHT — kept modest: it ignores position entirely, but
 *     on a round product its centred bins cancel out and contribute nothing.
 *   COLOUR_LAYOUT_WEIGHT — slower-moving, kept below the hue histogram.
 */
const SILHOUETTE_WEIGHT = 3;
const GLOBAL_ORIENTATION_WEIGHT = 1.5;
const HUE_WEIGHT = 5;
const COLOUR_LAYOUT_WEIGHT = 2;
const LUMA_LAYOUT_WEIGHT = 2;

// Subject detection. Thresholds are in normalized colour units (0–3 = the sum
// of the three absolute channel differences).
/** How far a cell must differ from the border colour to count as the product. */
const SUBJECT_DISTANCE = 0.30;
/** The border must be at least this uniform for normalization to be trusted. */
const MIN_BORDER_BACKGROUND = 0.6;
/** Ignore "subjects" smaller than this share of the frame (noise, a logo). */
const MIN_SUBJECT_AREA = 0.04;
/** Above this share the subject already fills the frame — nothing to do. */
const MAX_SUBJECT_AREA = 0.98;

// ---------------------------------------------------------------------------
// Decoding (pure JS codecs — no platform image APIs in the edge runtime)
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

function decodeImage(bytes: Uint8Array, mime: string): DecodedImage {
  if (mime === 'image/jpeg' || mime === 'image/jpg') {
    const decoded = jpeg.decode(bytes, { useTArray: true, maxMemoryUsageInMB: 128 }) as {
      width: number;
      height: number;
      data: Uint8Array; // RGBA
    };
    return { width: decoded.width, height: decoded.height, data: rgbaToRgb(decoded.data) };
  }

  if (mime === 'image/png') {
    // pngjs is a Node-era CJS lib: it calls Buffer methods (readUInt32BE…) on
    // its input, so bytes must be wrapped in a real Buffer.
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
// Grid — pure functions of pixels, so the descriptor is testable without a codec
// ---------------------------------------------------------------------------

interface ImageGrid {
  luma: number[];
  ratioR: number[];
  ratioG: number[];
  sat: number[];
  hue: number[];
  rgb: number[];
}

/** Standard HSV saturation and hue for one normalized RGB triple. */
function saturationOf(r: number, g: number, b: number): number {
  const max = Math.max(r, g, b);
  return max <= 0 ? 0 : (max - Math.min(r, g, b)) / max;
}

function hueOf(r: number, g: number, b: number): number {
  const max = Math.max(r, g, b);
  const delta = max - Math.min(r, g, b);
  if (delta <= 1e-6) return 0;
  if (max === r) return (((g - b) / delta + 6) % 6) / 6;
  if (max === g) return ((b - r) / delta + 2) / 6;
  return ((r - g) / delta + 4) / 6;
}

/**
 * Average the image into a GRID×GRID grid of luma, chromaticity and RGB.
 *
 * Box averaging is the first line of scale tolerance: the same product at
 * 400 px and at 4000 px averages into nearly the same grid. Mapping is by
 * proportion (`x * GRID / width`), so the image is stretched onto the grid —
 * deliberate, because two photos of one product rarely share a crop, and the
 * subject normalization below then re-frames what matters.
 */
function buildGrid(rgb: Uint8Array, width: number, height: number): ImageGrid {
  const cells = GRID * GRID;
  const sumR = new Float64Array(cells);
  const sumG = new Float64Array(cells);
  const sumB = new Float64Array(cells);
  const counts = new Uint32Array(cells);

  for (let y = 0; y < height; y++) {
    const gy = Math.min(GRID - 1, Math.floor((y * GRID) / height));
    for (let x = 0; x < width; x++) {
      const gx = Math.min(GRID - 1, Math.floor((x * GRID) / width));
      const cell = gy * GRID + gx;
      const offset = (y * width + x) * 3;
      sumR[cell] += rgb[offset];
      sumG[cell] += rgb[offset + 1];
      sumB[cell] += rgb[offset + 2];
      counts[cell] += 1;
    }
  }

  const luma = new Array<number>(cells).fill(0);
  const ratioR = new Array<number>(cells).fill(0);
  const ratioG = new Array<number>(cells).fill(0);
  const sat = new Array<number>(cells).fill(0);
  const hue = new Array<number>(cells).fill(0);
  const channel = new Array<number>(cells * 3).fill(0);

  for (let i = 0; i < cells; i++) {
    const n = counts[i] || 1;
    const r = sumR[i] / n / 255;
    const g = sumG[i] / n / 255;
    const b = sumB[i] / n / 255;
    channel[i * 3] = r;
    channel[i * 3 + 1] = g;
    channel[i * 3 + 2] = b;

    luma[i] = 0.299 * r + 0.587 * g + 0.114 * b;

    const total = r + g + b + 1e-6;
    ratioR[i] = r / total;
    ratioG[i] = g / total;

    sat[i] = saturationOf(r, g, b);
    hue[i] = hueOf(r, g, b);
  }

  return { luma, ratioR, ratioG, sat, hue, rgb: channel };
}

interface SubjectBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Colour of the outer 2-cell ring: the surface the product is sitting on. */
function averageBorderColour(grid: ImageGrid): [number, number, number] {
  let r = 0;
  let g = 0;
  let b = 0;
  let count = 0;
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      if (!(x < 2 || y < 2 || x >= GRID - 2 || y >= GRID - 2)) continue;
      const i = (y * GRID + x) * 3;
      r += grid.rgb[i];
      g += grid.rgb[i + 1];
      b += grid.rgb[i + 2];
      count += 1;
    }
  }
  return count === 0 ? [0, 0, 0] : [r / count, g / count, b / count];
}

/**
 * Per-cell "is this the product or the surface behind it" score in [0,1],
 * measured as colour distance from the border.
 *
 * This field IS the product's outline once the frame is normalized (a ball's
 * disc, a carton's rectangle) — which is why it is kept as a feature and not
 * merely used to mask pixels out.
 */
function subjectnessField(grid: ImageGrid, background: [number, number, number]): number[] {
  const field = new Array<number>(GRID * GRID).fill(0);
  for (let i = 0; i < GRID * GRID; i++) {
    const distance =
      Math.abs(grid.rgb[i * 3] - background[0]) +
      Math.abs(grid.rgb[i * 3 + 1] - background[1]) +
      Math.abs(grid.rgb[i * 3 + 2] - background[2]);
    field[i] = Math.min(1, distance / SUBJECT_DISTANCE);
  }
  return field;
}

/**
 * Locate the product in the frame: the cells that differ from the border
 * colour.
 *
 * Returns null when that assumption does not hold — a cluttered scene, a
 * full-frame texture, or an image that is one flat colour — in which case the
 * caller keeps the whole frame.
 */
function findSubject(grid: ImageGrid, background: [number, number, number]): SubjectBox | null {
  let borderBackground = 0;
  let borderTotal = 0;
  let minX = GRID;
  let minY = GRID;
  let maxX = -1;
  let maxY = -1;
  let subjectCells = 0;

  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      const i = (y * GRID + x) * 3;
      const distance =
        Math.abs(grid.rgb[i] - background[0]) +
        Math.abs(grid.rgb[i + 1] - background[1]) +
        Math.abs(grid.rgb[i + 2] - background[2]);

      if (x < 2 || y < 2 || x >= GRID - 2 || y >= GRID - 2) {
        borderTotal += 1;
        if (distance < SUBJECT_DISTANCE) borderBackground += 1;
        continue;
      }

      if (distance >= SUBJECT_DISTANCE) {
        subjectCells += 1;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (borderTotal === 0 || borderBackground / borderTotal < MIN_BORDER_BACKGROUND) {
    return null;
  }

  const area = GRID * GRID;
  const subjectArea = (maxX - minX + 1) * (maxY - minY + 1);
  if (subjectCells === 0 || subjectArea / area < MIN_SUBJECT_AREA) return null;
  if (subjectArea / area > MAX_SUBJECT_AREA) return null;

  return { x0: minX, y0: minY, x1: maxX, y1: maxY };
}

interface ImageView {
  luma: number[];
  ratioR: number[];
  ratioG: number[];
  sat: number[];
  hue: number[];
  /**
   * 1 where the cell belongs to the product, 0 for the padding introduced by
   * re-framing. Padding cells are excluded from the structural features, so the
   * letterbox edge cannot masquerade as product structure. The silhouette group
   * deliberately reads this too, as 0, because "background here" is exactly
   * what describes the product's outline.
   */
  mask: number[];
  subjectness: number[];
}

/** Bilinear sample of a GRID×GRID scalar field at fractional cell coordinates. */
function sampleField(values: number[], x: number, y: number): number {
  const clampedX = Math.max(0, Math.min(GRID - 1, x));
  const clampedY = Math.max(0, Math.min(GRID - 1, y));
  const x0 = Math.floor(clampedX);
  const y0 = Math.floor(clampedY);
  const x1 = Math.min(GRID - 1, x0 + 1);
  const y1 = Math.min(GRID - 1, y0 + 1);
  const fx = clampedX - x0;
  const fy = clampedY - y0;

  const top = values[y0 * GRID + x0] * (1 - fx) + values[y0 * GRID + x1] * fx;
  const bottom = values[y1 * GRID + x0] * (1 - fx) + values[y1 * GRID + x1] * fx;
  return top * (1 - fy) + bottom * fy;
}

/** Recompute saturation/hue after resampling, so they stay consistent. */
function deriveSatHue(ratioR: number, ratioG: number): { sat: number; hue: number } {
  const r = ratioR;
  const g = ratioG;
  const b = 1 - ratioR - ratioG;
  return { sat: saturationOf(r, g, b), hue: hueOf(r, g, b) };
}

/**
 * Re-frame the grid so the subject fills the canonical frame, preserving its
 * aspect ratio (letterboxed with the background colour).
 *
 * This is the step that makes framing irrelevant to the score: the same product
 * shot closer, further away or off-centre normalizes to the same grid.
 */
function normalizeSubject(
  grid: ImageGrid,
  subjectness: number[],
  box: SubjectBox,
  background: [number, number, number],
): ImageView {
  const boxWidth = box.x1 - box.x0 + 1;
  const boxHeight = box.y1 - box.y0 + 1;
  const scale = Math.min(GRID / boxWidth, GRID / boxHeight);
  const drawWidth = boxWidth * scale;
  const drawHeight = boxHeight * scale;
  const offsetX = (GRID - drawWidth) / 2;
  const offsetY = (GRID - drawHeight) / 2;

  const backgroundLuma = 0.299 * background[0] + 0.587 * background[1] + 0.114 * background[2];
  const backgroundTotal = background[0] + background[1] + background[2] + 1e-6;
  const backgroundRatioR = background[0] / backgroundTotal;
  const backgroundRatioG = background[1] / backgroundTotal;
  const backgroundSatHue = deriveSatHue(backgroundRatioR, backgroundRatioG);

  const view: ImageView = {
    luma: new Array<number>(GRID * GRID).fill(backgroundLuma),
    ratioR: new Array<number>(GRID * GRID).fill(backgroundRatioR),
    ratioG: new Array<number>(GRID * GRID).fill(backgroundRatioG),
    sat: new Array<number>(GRID * GRID).fill(backgroundSatHue.sat),
    hue: new Array<number>(GRID * GRID).fill(backgroundSatHue.hue),
    mask: new Array<number>(GRID * GRID).fill(0),
    subjectness: new Array<number>(GRID * GRID).fill(0),
  };

  for (let cy = 0; cy < GRID; cy++) {
    for (let cx = 0; cx < GRID; cx++) {
      const vx = (cx + 0.5 - offsetX) / scale;
      const vy = (cy + 0.5 - offsetY) / scale;
      if (vx < 0 || vy < 0 || vx >= boxWidth || vy >= boxHeight) continue;

      const sx = box.x0 + vx - 0.5;
      const sy = box.y0 + vy - 0.5;
      const cell = cy * GRID + cx;
      view.luma[cell] = sampleField(grid.luma, sx, sy);
      view.ratioR[cell] = sampleField(grid.ratioR, sx, sy);
      view.ratioG[cell] = sampleField(grid.ratioG, sx, sy);
      const satHue = deriveSatHue(view.ratioR[cell], view.ratioG[cell]);
      view.sat[cell] = satHue.sat;
      view.hue[cell] = satHue.hue;
      view.mask[cell] = 1;
      view.subjectness[cell] = sampleField(subjectness, sx, sy);
    }
  }

  return view;
}

/** The whole frame, as a view with every cell eligible for structure. */
function wholeFrameView(grid: ImageGrid, subjectness: number[]): ImageView {
  return {
    luma: grid.luma,
    ratioR: grid.ratioR,
    ratioG: grid.ratioG,
    sat: grid.sat,
    hue: grid.hue,
    mask: new Array<number>(GRID * GRID).fill(1),
    subjectness,
  };
}

/** Centred histogram: uniform counts become 0, so flat areas carry no signal. */
function centeredHistogram(bins: number[], binCount: number): number[] {
  let total = 0;
  for (const v of bins) total += v;
  const uniform = 1 / binCount;
  return bins.map((v) => (total > 0 ? v / total : uniform) - uniform);
}

/**
 * Orientation histogram over a set of gradient samples: soft-binned by edge
 * direction, weighted by edge strength, normalized by the group's own total
 * energy so lighting and contrast cancel out. Centred so a region with no
 * edges contributes zeros instead of a shared positive baseline.
 */
function orientationHistogram(
  angles: number[],
  magnitudes: number[],
  binCount: number,
): number[] {
  const bins = new Array<number>(binCount).fill(0);
  let total = 0;

  for (let i = 0; i < angles.length; i++) {
    const magnitude = magnitudes[i];
    if (magnitude <= 1e-6) continue;
    total += magnitude;

    // Soft binning: split the weight between the two nearest bins. Without
    // this, the same edge landing either side of a bin boundary would produce
    // completely different features.
    const position = ((angles[i] / Math.PI + 1) / 2) * binCount;
    const lower = Math.floor(position);
    const frac = position - lower;
    bins[(((lower % binCount) + binCount) % binCount)] += magnitude * (1 - frac);
    bins[((((lower + 1) % binCount) + binCount) % binCount)] += magnitude * frac;
  }

  return centeredHistogram(bins, binCount);
}

/**
 * 512-dim L2-normalized descriptor for an RGB pixel buffer.
 *
 * Exported because it is pure: the unit tests drive it directly with synthetic
 * pixel arrays, so the descriptor is verified without any image codec.
 */
export function computeImageDescriptor(
  rgb: Uint8Array,
  width: number,
  height: number,
): number[] {
  if (!(width > 0) || !(height > 0) || rgb.length < width * height * 3) {
    throw new Error('Image has no decodable pixels.');
  }

  const grid = buildGrid(rgb, width, height);
  const background = averageBorderColour(grid);
  const subjectness = subjectnessField(grid, background);
  const box = findSubject(grid, background);
  const view = box
    ? normalizeSubject(grid, subjectness, box, background)
    : wholeFrameView(grid, subjectness);

  // Gradient field (central differences), skipping any sample that touches
  // padding — the letterbox edge is not product structure.
  const gradientAt = new Array<number>(GRID * GRID).fill(0);
  const angleAt = new Array<number>(GRID * GRID).fill(0);
  const allAngles: number[] = [];
  const allMagnitudes: number[] = [];

  for (let y = 1; y < GRID - 1; y++) {
    for (let x = 1; x < GRID - 1; x++) {
      const cell = y * GRID + x;
      const neighbours = [cell, cell - 1, cell + 1, cell - GRID, cell + GRID];
      if (neighbours.some((n) => view.mask[n] === 0)) continue;

      const gx = view.luma[cell + 1] - view.luma[cell - 1];
      const gy = view.luma[cell + GRID] - view.luma[cell - GRID];
      const magnitude = Math.sqrt(gx * gx + gy * gy);
      gradientAt[cell] = magnitude;
      angleAt[cell] = Math.atan2(gy, gx);
      allAngles.push(angleAt[cell]);
      allMagnitudes.push(magnitude);
    }
  }

  const features: number[] = [];

  /** Collect the gradient samples that fall inside one block of the layout. */
  function blockSamples(bx: number, by: number, stride: number): [number[], number[]] {
    const angles: number[] = [];
    const magnitudes: number[] = [];
    for (let y = by * stride; y < (by + 1) * stride; y++) {
      for (let x = bx * stride; x < (bx + 1) * stride; x++) {
        const cell = y * GRID + x;
        if (view.mask[cell] === 0) continue;
        angles.push(angleAt[cell]);
        magnitudes.push(gradientAt[cell]);
      }
    }
    return [angles, magnitudes];
  }

  // --- Structure 1: coarse layout (4×4 blocks × 8 directions) = 128 --------
  const coarseStride = GRID / COARSE;
  for (let by = 0; by < COARSE; by++) {
    for (let bx = 0; bx < COARSE; bx++) {
      const [angles, magnitudes] = blockSamples(bx, by, coarseStride);
      features.push(...orientationHistogram(angles, magnitudes, COARSE_BINS));
    }
  }

  // --- Structure 2: fine layout (8×8 blocks × 4 directions) = 256 ----------
  const fineStride = GRID / FINE;
  for (let by = 0; by < FINE; by++) {
    for (let bx = 0; bx < FINE; bx++) {
      const [angles, magnitudes] = blockSamples(bx, by, fineStride);
      features.push(...orientationHistogram(angles, magnitudes, FINE_BINS));
    }
  }

  // --- Structure 3: global edge-direction mix = 8 --------------------------
  // Ignores WHERE an edge is, so it is the group that survives anything the
  // subject normalization could not remove.
  features.push(
    ...orientationHistogram(allAngles, allMagnitudes, COARSE_BINS).map(
      (v) => v * GLOBAL_ORIENTATION_WEIGHT,
    ),
  );

  // --- Structure 4: product silhouette (8×8 map) = 64 ----------------------
  // Which cells are product and which are the surface behind it. This is the
  // outline: a ball's disc against a carton's striped rectangle. Replaces an
  // earlier "where is the detail" energy map, which measured as dead weight
  // (it contributed ~0.01 to every pair — same product and different product
  // alike) while this group is what keeps two same-coloured but differently
  // shaped products apart.
  const silhouette = new Array<number>(FINE * FINE).fill(0);
  for (let by = 0; by < FINE; by++) {
    for (let bx = 0; bx < FINE; bx++) {
      let total = 0;
      let count = 0;
      for (let y = by * fineStride; y < (by + 1) * fineStride; y++) {
        for (let x = bx * fineStride; x < (bx + 1) * fineStride; x++) {
          total += view.subjectness[y * GRID + x];
          count += 1;
        }
      }
      silhouette[by * FINE + bx] = count > 0 ? total / count : 0;
    }
  }
  const silhouetteMean = silhouette.reduce((a, b) => a + b, 0) / silhouette.length;
  for (const value of silhouette) {
    features.push((value - silhouetteMean) * SILHOUETTE_WEIGHT);
  }

  // --- Appearance 1: global hue mix = 8 -----------------------------------
  // Weighted by saturation because hue is meaningless for near-grey cells.
  // This is the signal that tells two same-shaped products apart (a yellow ball
  // from a green ball); structure tells two same-coloured, differently-shaped
  // products apart.
  const hueBins = new Array<number>(HUE_BINS).fill(0);
  for (let i = 0; i < GRID * GRID; i++) {
    if (view.mask[i] === 0) continue;
    hueBins[Math.min(HUE_BINS - 1, Math.floor(view.hue[i] * HUE_BINS))] += view.sat[i];
  }
  features.push(...centeredHistogram(hueBins, HUE_BINS).map((v) => v * HUE_WEIGHT));

  // --- Appearance 2: colour + brightness layout = 48 ----------------------
  const colourStride = GRID / COLOUR_BLOCKS;
  const blockRatioR: number[] = [];
  const blockRatioG: number[] = [];
  const blockRelativeLuma: number[] = [];

  for (let by = 0; by < COLOUR_BLOCKS; by++) {
    for (let bx = 0; bx < COLOUR_BLOCKS; bx++) {
      let r = 0;
      let g = 0;
      let luma = 0;
      let n = 0;
      for (let y = by * colourStride; y < (by + 1) * colourStride; y++) {
        for (let x = bx * colourStride; x < (bx + 1) * colourStride; x++) {
          const cell = y * GRID + x;
          if (view.mask[cell] === 0) continue;
          r += view.ratioR[cell];
          g += view.ratioG[cell];
          luma += view.luma[cell];
          n += 1;
        }
      }
      blockRatioR.push(n > 0 ? r / n : 0);
      blockRatioG.push(n > 0 ? g / n : 0);
      blockRelativeLuma.push(n > 0 ? luma / n : 0);
    }
  }

  const globalLuma =
    blockRelativeLuma.reduce((a, b) => a + b, 0) / blockRelativeLuma.length || 1;
  const layoutMeanR = blockRatioR.reduce((a, b) => a + b, 0) / blockRatioR.length;
  const layoutMeanG = blockRatioG.reduce((a, b) => a + b, 0) / blockRatioG.length;

  for (let i = 0; i < blockRatioR.length; i++) {
    // Centred on the image's OWN average: this group is about how colour is
    // LAID OUT across the product (e.g. yellow top, red bottom), while the
    // global hue histogram carries which colour it is. Centring the absolute
    // colour here would erase exactly the signal that separates two products
    // sharing a silhouette.
    features.push((blockRatioR[i] - layoutMeanR) * COLOUR_LAYOUT_WEIGHT);
    features.push((blockRatioG[i] - layoutMeanG) * COLOUR_LAYOUT_WEIGHT);
    features.push((blockRelativeLuma[i] / globalLuma - 1) * LUMA_LAYOUT_WEIGHT);
  }

  if (features.length !== EMBEDDING_DIMS) {
    throw new Error(
      `Descriptor produced ${features.length} dimensions; expected ${EMBEDDING_DIMS}.`,
    );
  }

  return l2Normalize(features);
}

function l2Normalize(vector: number[]): number[] {
  let sumSq = 0;
  for (const v of vector) sumSq += v * v;
  const norm = Math.sqrt(sumSq);
  if (norm === 0 || !Number.isFinite(norm)) {
    throw new Error('Image produced an empty descriptor — cannot normalize.');
  }
  return vector.map((v) => v / norm);
}

// ---------------------------------------------------------------------------
// Comparing two descriptors — the decision, not just a distance
// ---------------------------------------------------------------------------

/**
 * The descriptor is two signals stacked: dims 0..455 describe STRUCTURE (where
 * the edges are and what the outline is), dims 456..511 describe COLOUR (which
 * colours are present and how they are laid out).
 *
 * The boundary is load-bearing: `compareDescriptors` scores structure and
 * colour separately, and the thresholds are stated against those scores. Keep
 * it in sync with the feature order above (128 coarse + 256 fine + 8 global +
 * 64 silhouette = 456).
 */
export const SHAPE_DIMS = 456;

/** Norm below which a group counts as carrying no signal at all (flat photo, grey product). */
const NO_ENERGY = 1e-12;

interface DescriptorGroup {
  name: string;
  from: number;
  to: number;
  signal: 'shape' | 'colour';
}

/**
 * The aspects of appearance that get a vote, and where they live in the 512
 * dimensions. Order and sizes must match the feature blocks written by
 * `computeImageDescriptor`.
 */
export const DESCRIPTOR_GROUPS: DescriptorGroup[] = [
  { name: 'detail layout (coarse)', from: 0, to: 128, signal: 'shape' },
  { name: 'detail layout (fine)', from: 128, to: 384, signal: 'shape' },
  { name: 'edge direction mix', from: 384, to: 392, signal: 'shape' },
  { name: 'product outline', from: 392, to: SHAPE_DIMS, signal: 'shape' },
  { name: 'colour mix', from: SHAPE_DIMS, to: 464, signal: 'colour' },
  { name: 'colour layout', from: 464, to: EMBEDDING_DIMS, signal: 'colour' },
];

/** What each aspect of the product scored, then the two signals and the verdict score. */
export interface DescriptorComparison {
  /** How well the aspects agreed — one entry per shape/colour aspect. */
  aspects: { name: string; signal: 'shape' | 'colour'; similarity: number }[];
  /** Structural agreement: the average vote of the shape aspects. */
  shape: number;
  /** Colour agreement: the average vote of the colour aspects. */
  colour: number;
  /** The weakest signal, clamped to [0, 1] — what the thresholds compare. */
  score: number;
}

/**
 * Cosine similarity of one aspect (a slice of the two vectors).
 *
 * Returns null when NEITHER vector has any energy in this aspect — a greyscale
 * product has no hue at all, and two products lacking a signal agree vacuously
 * rather than badly. That distinction matters: scoring "no colour" as a
 * mismatch would make every grey or white catalog item unmatchable.
 */
function aspectCosine(a: number[], b: number[], from: number, to: number): number | null {
  let dot = 0;
  let energyA = 0;
  let energyB = 0;
  for (let i = from; i < to; i++) {
    dot += a[i] * b[i];
    energyA += a[i] * a[i];
    energyB += b[i] * b[i];
  }

  if (energyA <= NO_ENERGY && energyB <= NO_ENERGY) return null;
  // One side has structure here and the other does not: no agreement.
  if (energyA <= NO_ENERGY || energyB <= NO_ENERGY) return 0;

  return dot / (Math.sqrt(energyA) * Math.sqrt(energyB));
}

/**
 * Compare a query photo against a catalog product's descriptor.
 *
 * WHY THIS IS NOT A SINGLE COSINE (2026-09-22)
 * ---------------------------------------------------------------------------
 * A single cosine is a WEIGHTED SUM of these aspects, so one aspect can pay
 * for another. Measured against a yellow smiley ball, that accepted two
 * lookalikes a shopkeeper would notice immediately:
 *
 *   a green ball    (identical outline, wrong product): cosine 0.822 — perfect
 *                   structure outvoted a completely wrong colour.
 *   a yellow carton (identical colour, wrong product): cosine 0.815 — perfect
 *                   colour outvoted a completely different shape.
 *
 * Both landed above where a genuine re-shot could sit, so no single threshold
 * could accept the real product and reject those at the same time. Scoring
 * each optimistic aspect as its own vote and combining the votes by their
 * WEAKEST signal fixes that with a wide margin — measured on the same fixtures:
 * a genuine re-shot scores shape 0.95+ / colour 1.00, the green ball 0.95+ /
 * 0.26 (colour veto), the carton ≈0.35 / 0.98 (shape veto).
 *
 * Two properties are deliberate:
 *   - Votes are averaged per aspect, not summed as one big slice. In a summed
 *     slice an aspect with little energy (the direction mix of a round product
 *     is nearly uniform) barely counts, which is how the carton's completely
 *     different edge structure still scored 0.75 overall. As an average, every
 *     aspect has an equal say however small its numbers are.
 *   - The score is the weaker of the two signals, so a threshold means exactly
 *     "shape AND colour both agreed at least this well" — which is also the
 *     honest thing to tell a user: a product found on colour alone is a guess.
 *
 * The stored vectors, the `vector(512)` column, the HNSW index and the
 * pgvector cosine are all unchanged; this only re-scores candidates that the
 * cosine pre-filter already surfaced.
 */
export function compareDescriptors(a: number[], b: number[]): DescriptorComparison {
  if (a.length !== b.length || a.length !== EMBEDDING_DIMS) {
    throw new Error(
      `Cannot compare descriptors of length ${a.length} and ${b.length}; expected ${EMBEDDING_DIMS}.`,
    );
  }

  const aspects: DescriptorComparison['aspects'] = [];
  for (const group of DESCRIPTOR_GROUPS) {
    const similarity = aspectCosine(a, b, group.from, group.to);
    if (similarity === null) continue; // no signal on either side — this aspect abstains
    aspects.push({ name: group.name, signal: group.signal, similarity });
  }

  const meanOf = (signal: 'shape' | 'colour'): number => {
    const votes = aspects.filter((aspect) => aspect.signal === signal);
    if (votes.length === 0) return 1; // nothing to disagree about
    return votes.reduce((sum, vote) => sum + vote.similarity, 0) / votes.length;
  };

  const shape = meanOf('shape');
  const colour = meanOf('colour');

  return { aspects, shape, colour, score: Math.max(0, Math.min(shape, colour)) };
}

// ---------------------------------------------------------------------------
// Public API used by ./embedding.ts
// ---------------------------------------------------------------------------

/**
 * Embed a batch of data-URI images. Returns L2-normalized 512-dim vectors in
 * the same order as the input.
 */
export async function embedImages(images: string[]): Promise<number[][]> {
  const vectors: number[][] = [];

  for (const dataUri of images) {
    const { mime, bytes } = dataUriToBytes(dataUri);
    const decoded = decodeImage(bytes, mime);
    if (decoded.data.length === 0) {
      throw new Error('The image decoded to zero pixels.');
    }
    vectors.push(computeImageDescriptor(decoded.data, decoded.width, decoded.height));
  }

  return vectors;
}
