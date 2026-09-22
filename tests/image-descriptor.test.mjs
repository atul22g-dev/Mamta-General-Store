/**
 * Product-image descriptor tests — the "photo → 512-dim vector" step that
 * replaced the ONNX engine (see supabase/functions/_shared/embedding-engine.ts
 * for why ONNX could not run on this platform), plus the DECISION that turns
 * those vectors into a match.
 *
 * The descriptor and `compareDescriptors` are PURE functions of pixels, so
 * these tests drive the real deployed code with synthetic pixel arrays: no
 * codecs, no network, no model. They assert what the feature actually promises:
 *
 *   1. Stability   — the same product photographed again scores high, whatever
 *                    the framing, resolution, brightness or JPEG noise.
 *   2. Rejection   — a different product scores clearly lower, INCLUDING the
 *                    two lookalikes that a single summed score used to accept:
 *                    a same-shaped product of another colour, and a
 *                    same-coloured product of another shape.
 *   3. Separation  — the two populations stay apart by an asserted margin, and
 *                    the thresholds the app ships must sit inside that gap.
 *
 * The threshold constants are imported from the APP (src/lib/visual-match/
 * thresholds.ts), so re-tuning one without re-calibrating fails here.
 *
 * Run: node tests/image-descriptor.test.mjs
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { register } from 'node:module';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

register(pathToFileURL(path.join(ROOT, 'tests', 'edge-module-loader.mjs')).href);

const { computeImageDescriptor, compareDescriptors, SHAPE_DIMS } = await import(
  pathToFileURL(path.join(ROOT, 'supabase', 'functions', '_shared', 'embedding-engine.ts')).href
);

const { MAIN_MATCH_THRESHOLD, SIMILAR_PRODUCT_THRESHOLD } = await import(
  pathToFileURL(path.join(ROOT, 'src', 'lib', 'visual-match', 'thresholds.ts')).href
);

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------
let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ✅ ${name}`);
  } catch (error) {
    failed += 1;
    failures.push({ name, error });
    console.log(`  ❌ ${name}\n     ${error.message}`);
  }
}

function section(title) {
  console.log(`\n${title}`);
}

const WIDTH = 320;
const HEIGHT = 240;

/** Build an RGB image by painting pixels. */
function paint(width, height, painter) {
  const data = new Uint8Array(width * height * 3);
  const put = (x, y, r, g, b) => {
    // Round the coordinates. A half-integer centre (213/2 = 106.5) would write
    // to a fractional typed-array index, which JavaScript silently discards —
    // the shape then never gets painted at all and the image is blank. That bug
    // made one fixture measure as "blank photo" for a whole calibration round.
    const px = Math.round(x);
    const py = Math.round(y);
    if (px < 0 || py < 0 || px >= width || py >= height) return;
    const i = (py * width + px) * 3;
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
  };
  painter(put, width, height);
  return { data, width, height };
}

function circle(put, cx, cy, radius, [r, g, b]) {
  for (let y = cy - radius; y <= cy + radius; y++) {
    for (let x = cx - radius; x <= cx + radius; x++) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy <= radius * radius) put(x, y, r, g, b);
    }
  }
}

/** The reference "product": a yellow smiley ball on white. */
const yellowBall = paint(WIDTH, HEIGHT, (put, w, h) => {
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) put(x, y, 255, 255, 255);
  circle(put, w / 2, h / 2, 90, [250, 204, 21]);
  circle(put, w / 2 - 30, h / 2 - 20, 12, [20, 20, 20]);
  circle(put, w / 2 + 30, h / 2 - 20, 12, [20, 20, 20]);
  for (let x = -55; x <= 55; x++) {
    const y = Math.round(Math.sqrt(Math.max(0, 55 * 55 - x * x)) * 0.7);
    for (let t = 0; t < 5; t++) put(Math.round(w / 2 + x), Math.round(h / 2 + 12 + y) + t, 20, 20, 20);
  }
});

/** Same product, shot again: brighter. */
const brighterBall = paint(WIDTH, HEIGHT, (put, w, h) => {
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 3;
      put(x, y, Math.min(255, yellowBall.data[i] * 1.15), Math.min(255, yellowBall.data[i + 1] * 1.15), Math.min(255, yellowBall.data[i + 2] * 1.15));
    }
  }
});

/** Same product, shot again: dimmer. */
const darkerBall = paint(WIDTH, HEIGHT, (put, w, h) => {
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 3;
      put(x, y, yellowBall.data[i] * 0.85, yellowBall.data[i + 1] * 0.85, yellowBall.data[i + 2] * 0.85);
    }
  }
});

/** Same product, held further from the camera (subject smaller in frame). */
const smallBall = paint(WIDTH, HEIGHT, (put, w, h) => {
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) put(x, y, 255, 255, 255);
  circle(put, w / 2, h / 2, 58, [250, 204, 21]);
  circle(put, w / 2 - 19, h / 2 - 13, 8, [20, 20, 20]);
  circle(put, w / 2 + 19, h / 2 - 13, 8, [20, 20, 20]);
});

/**
 * Same product, photographed from 1.5× closer. Rendered into a smaller canvas
 * on purpose: that is what "closer" actually looks like when the product stays
 * fully in frame, and it keeps the test about scale, not about cropping.
 */
const closeUpBall = paint(213, 160, (put, w, h) => {
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) put(x, y, 255, 255, 255);
  circle(put, w / 2, h / 2, 60, [250, 204, 21]);
  circle(put, w / 2 - 20, h / 2 - 13, 8, [20, 20, 20]);
  circle(put, w / 2 + 20, h / 2 - 13, 8, [20, 20, 20]);
});

/**
 * Same product so close that it is CLIPPED by the frame: a genuine limit of
 * matching on what is visible, reported rather than asserted as a match. It
 * must lose — silently identifying a clipped photo would mean identifying
 * something the photo does not show.
 */
const clippedBall = paint(WIDTH, HEIGHT, (put, w, h) => {
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) put(x, y, 255, 255, 255);
  circle(put, w / 2, h / 2, 150, [250, 204, 21]);
  circle(put, w / 2 - 48, h / 2 - 32, 19, [20, 20, 20]);
  circle(put, w / 2 + 48, h / 2 - 32, 19, [20, 20, 20]);
});

/** Same product, held off to one side of the frame. */
const offCentreBall = paint(WIDTH, HEIGHT, (put, w, h) => {
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) put(x, y, 255, 255, 255);
  circle(put, 110, 90, 80, [250, 204, 21]);
  circle(put, 83, 72, 11, [20, 20, 20]);
  circle(put, 137, 72, 11, [20, 20, 20]);
});

/** Same product, captured at a lower resolution (phone downscaled the photo). */
const lowResBall = paint(160, 120, (put, w, h) => {
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) put(x, y, 255, 255, 255);
  circle(put, w / 2, h / 2, 45, [250, 204, 21]);
  circle(put, w / 2 - 15, h / 2 - 10, 6, [20, 20, 20]);
  circle(put, w / 2 + 15, h / 2 - 10, 6, [20, 20, 20]);
});

/** Same product, shot from behind: same outline and colour, no face printed. */
const backOfBall = paint(WIDTH, HEIGHT, (put, w, h) => {
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) put(x, y, 255, 255, 255);
  circle(put, w / 2, h / 2, 90, [250, 204, 21]);
});

/** 3×3 box blur — stands in for JPEG smoothing. */
function blurred(image) {
  const { data, width, height } = image;
  return paint(width, height, (put, w, h) => {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let r = 0;
        let g = 0;
        let b = 0;
        let n = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const sx = x + dx;
            const sy = y + dy;
            if (sx < 0 || sy < 0 || sx >= w || sy >= h) continue;
            const i = (sy * w + sx) * 3;
            r += data[i];
            g += data[i + 1];
            b += data[i + 2];
            n += 1;
          }
        }
        put(x, y, Math.round(r / n), Math.round(g / n), Math.round(b / n));
      }
    }
  });
}

/** Deterministic pseudo-random noise, so failures reproduce. */
let seed = 987654321;
function random() {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
}

/** Blur + noise: the closest local stand-in for "the same photo re-encoded". */
function recompressed(image) {
  const smooth = blurred(image);
  return paint(image.width, image.height, (put, w, h) => {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 3;
        const jitter = (random() - 0.5) * 16;
        put(
          x,
          y,
          Math.max(0, Math.min(255, smooth.data[i] + jitter)),
          Math.max(0, Math.min(255, smooth.data[i + 1] + jitter)),
          Math.max(0, Math.min(255, smooth.data[i + 2] + jitter)),
        );
      }
    }
  });
}

// --- different products / unrelated photos --------------------------------

/** A green ball with no face: same silhouette, different product. */
const greenBall = paint(WIDTH, HEIGHT, (put, w, h) => {
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) put(x, y, 255, 255, 255);
  circle(put, w / 2, h / 2, 90, [22, 163, 74]);
});

/**
 * A carton in the SAME yellow as the ball but a completely different shape.
 * This is the case that stops the colour features from becoming a shortcut:
 * the two agree on colour and must be separated by structure alone.
 */
const yellowCarton = paint(WIDTH, HEIGHT, (put, w, h) => {
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) put(x, y, 255, 255, 255);
  for (let y = 35; y < 205; y++) for (let x = 65; x < 255; x++) put(x, y, 250, 204, 21);
  for (let line = 0; line < 6; line++) {
    const y = 55 + line * 24;
    for (let x = 85; x < 235; x++) put(x, y, 255, 255, 255);
  }
});

/** A red carton with printed label lines. */
const redCarton = paint(WIDTH, HEIGHT, (put, w, h) => {
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) put(x, y, 255, 255, 255);
  for (let y = 40; y < 200; y++) for (let x = 70; x < 250; x++) put(x, y, 220, 38, 38);
  for (let line = 0; line < 5; line++) {
    const y = 70 + line * 22;
    for (let x = 90; x < 200; x++) put(x, y, 255, 255, 255);
  }
});

/** Blue diagonal stripes (a fabric / packaged item). */
const blueStripes = paint(WIDTH, HEIGHT, (put, w, h) => {
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const on = (x + y) % 60 < 30;
      put(x, y, on ? 30 : 240, on ? 64 : 240, on ? 175 : 240);
    }
  }
});

/** A page of text-like lines. */
const textPage = paint(WIDTH, HEIGHT, (put, w, h) => {
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) put(x, y, 250, 250, 245);
  for (let line = 0; line < 12; line++) {
    const y = 20 + line * 17;
    for (let x = 24; x < (line % 3 === 0 ? 180 : 290); x++) put(x, y, 30, 30, 30);
  }
});

/** Black and white checkerboard. */
const checker = paint(WIDTH, HEIGHT, (put, w, h) => {
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const on = (Math.floor(x / 20) + Math.floor(y / 20)) % 2 === 0;
      put(x, y, on ? 0 : 255, on ? 0 : 255, on ? 0 : 255);
    }
  }
});

const noiseImage = paint(WIDTH, HEIGHT, (put, w, h) => {
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = Math.round(random() * 255);
      put(x, y, v, v, v);
    }
  }
});

const flatWhite = paint(WIDTH, HEIGHT, (put, w, h) => {
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) put(x, y, 255, 255, 255);
});

// ---------------------------------------------------------------------------
// Comparison
// ---------------------------------------------------------------------------
const vectors = new Map();
function descriptor(label, image) {
  if (!vectors.has(label)) {
    vectors.set(label, computeImageDescriptor(image.data, image.width, image.height));
  }
  return vectors.get(label);
}

const reference = descriptor('reference', yellowBall);

/** Compare an image against the reference product, exactly as the server does. */
function compare(label, image) {
  return compareDescriptors(reference, descriptor(label, image));
}

// ---------------------------------------------------------------------------
// Contract
// ---------------------------------------------------------------------------
section('Descriptor contract');

test('produces exactly 512 dimensions', () => {
  assert.equal(reference.length, 512);
});

test('every value is finite and inside the unit range', () => {
  for (const value of reference) {
    assert.ok(Number.isFinite(value), `non-finite value: ${value}`);
    assert.ok(Math.abs(value) <= 1, `value outside [-1,1]: ${value}`);
  }
});

test('the vector is L2-normalized to unit length', () => {
  const norm = Math.sqrt(reference.reduce((sum, v) => sum + v * v, 0));
  assert.ok(Math.abs(norm - 1) < 1e-9, `norm was ${norm}`);
});

test('is deterministic across calls (same photo always embeds identically)', () => {
  const again = computeImageDescriptor(yellowBall.data, yellowBall.height === 0 ? 1 : yellowBall.width, yellowBall.height);
  assert.deepEqual(again, reference);
});

test('rejects a pixel buffer that cannot hold the stated dimensions', () => {
  assert.throws(() => computeImageDescriptor(new Uint8Array(12), 100, 100));
});

test('refuses to compare vectors of the wrong size', () => {
  assert.throws(() => compareDescriptors(reference, reference.slice(0, 511)));
});

test('the shape/colour split covers the whole vector', () => {
  assert.equal(SHAPE_DIMS, 456);
  assert.ok(SHAPE_DIMS > 0 && SHAPE_DIMS < reference.length);
});

// ---------------------------------------------------------------------------
// Calibration report
// ---------------------------------------------------------------------------
section(`Score report (reference: the yellow smiley ball)`);
console.log(
  `  thresholds: identified ≥ ${MAIN_MATCH_THRESHOLD}, similar ≥ ${SIMILAR_PRODUCT_THRESHOLD}` +
    `   [score = weaker of shape / colour]`,
);

const positives = [
  ['same photo, brighter +15%', 'brighter', brighterBall],
  ['same photo, dimmer -15%', 'darker', darkerBall],
  ['same product, held further away', 'smaller', smallBall],
  ['same product, 1.5× closer', 'closeup', closeUpBall],
  ['same product, off to one side', 'offcentre', offCentreBall],
  ['same product, lower resolution', 'lowres', lowResBall],
  ['same photo, re-encoded (blur + noise)', 'recompressed', recompressed(yellowBall)],
  ['same product, back of it (no face)', 'back', backOfBall],
].map(([description, label, image]) => [description, label, compare(label, image)]);

const negatives = [
  ['same colour, different shape: yellow carton', 'yellowcarton', yellowCarton],
  ['different product: green ball', 'green', greenBall],
  ['different product: red carton', 'carton', redCarton],
  ['different item: blue stripes', 'stripes', blueStripes],
  ['different item: page of text', 'text', textPage],
  ['unrelated: checkerboard', 'checker', checker],
  ['unrelated: noise', 'noise', noiseImage],
  ['unrelated: blank white', 'white', flatWhite],
].map(([description, label, image]) => [description, label, compare(label, image)]);

const clipped = compare('clipped', clippedBall);

function row(kind, description, { shape, colour, score }) {
  const verdict =
    score >= MAIN_MATCH_THRESHOLD ? 'identified' : score >= SIMILAR_PRODUCT_THRESHOLD ? 'similar' : 'rejected';
  console.log(
    `  ${kind}  score=${score.toFixed(3)}  shape=${shape.toFixed(3).padStart(6)}  colour=${colour.toFixed(3).padStart(6)}   ${verdict.padEnd(10)} ${description}`,
  );
}

for (const [description, , result] of positives) row('same     ', description, result);
for (const [description, , result] of negatives) row('different', description, result);
row('same     ', 'same product, CLIPPED by frame (documented limitation)', clipped);

const minPositive = Math.min(...positives.map(([, , r]) => r.score));
const maxNegative = Math.max(...negatives.map(([, , r]) => r.score));
console.log(`\n  weakest same-product score : ${minPositive.toFixed(3)}`);
console.log(`  strongest different score  : ${maxNegative.toFixed(3)}`);
console.log(`  separation margin          : ${(minPositive - maxNegative).toFixed(3)}`);

// ---------------------------------------------------------------------------
// The invariants the shipped thresholds rely on
// ---------------------------------------------------------------------------
section('Match decision invariants');

test('every re-shot of the product is IDENTIFIED, not merely similar', () => {
  for (const [description, , result] of positives) {
    assert.ok(
      result.score >= MAIN_MATCH_THRESHOLD,
      `"${description}" scored ${result.score.toFixed(3)}, below the identified threshold ${MAIN_MATCH_THRESHOLD} ` +
        `(shape ${result.shape.toFixed(3)}, colour ${result.colour.toFixed(3)})`,
    );
  }
});

test('every different product is REJECTED, with no overlap against the re-shots', () => {
  for (const [description, , result] of negatives) {
    assert.ok(
      result.score < SIMILAR_PRODUCT_THRESHOLD,
      `"${description}" scored ${result.score.toFixed(3)}, at or above the similar threshold ${SIMILAR_PRODUCT_THRESHOLD} ` +
        `(shape ${result.shape.toFixed(3)}, colour ${result.colour.toFixed(3)})`,
    );
  }
  assert.ok(
    minPositive > maxNegative,
    `no separation: weakest same-product ${minPositive.toFixed(3)} vs strongest different ${maxNegative.toFixed(3)}`,
  );
});

test('the shipped thresholds sit inside the measured gap', () => {
  assert.ok(
    maxNegative < SIMILAR_PRODUCT_THRESHOLD && MAIN_MATCH_THRESHOLD <= minPositive,
    `thresholds [${SIMILAR_PRODUCT_THRESHOLD}, ${MAIN_MATCH_THRESHOLD}] are outside the measured gap ` +
      `[${maxNegative.toFixed(3)}, ${minPositive.toFixed(3)}]`,
  );
  assert.ok(
    minPositive - maxNegative >= 0.15,
    `separation margin ${(minPositive - maxNegative).toFixed(3)} is too thin to trust`,
  );
});

test('a same-shaped product of another colour loses on COLOUR, not by luck', () => {
  const green = compare('green', greenBall);
  assert.ok(green.shape >= MAIN_MATCH_THRESHOLD, `expected the outline to match (shape ${green.shape.toFixed(3)})`);
  assert.ok(
    green.colour < 0.5,
    `a green ball's colour matched a yellow ball at ${green.colour.toFixed(3)} — the colour veto is not working`,
  );
  assert.ok(green.score < SIMILAR_PRODUCT_THRESHOLD, 'a same-shape different-colour ball was not rejected');
});

test('a same-coloured product of another shape loses on SHAPE, not by luck', () => {
  const carton = compare('yellowcarton', yellowCarton);
  assert.ok(carton.colour >= MAIN_MATCH_THRESHOLD, `expected the colour to match (colour ${carton.colour.toFixed(3)})`);
  assert.ok(
    carton.shape < MAIN_MATCH_THRESHOLD,
    `a yellow carton's shape matched a yellow ball at ${carton.shape.toFixed(3)} — the shape veto is not working`,
  );
  assert.ok(carton.score < SIMILAR_PRODUCT_THRESHOLD, 'a same-colour different-shape carton was not rejected');
});

test('a clipped close-up is refused rather than mis-identified', () => {
  assert.ok(
    clipped.score < MAIN_MATCH_THRESHOLD,
    `a photo with the product cut off was identified at ${clipped.score.toFixed(3)}`,
  );
});

test('blank and noisy photos cannot match a product by accident', () => {
  assert.ok(compare('white', flatWhite).score < SIMILAR_PRODUCT_THRESHOLD, 'blank white photo scored too high');
  assert.ok(compare('noise', noiseImage).score < SIMILAR_PRODUCT_THRESHOLD, 'noise scored too high');
});

test('an identical photo agrees on both signals exactly', () => {
  const same = compare('identical', yellowBall);
  assert.ok(Math.abs(same.shape - 1) < 1e-9, `shape was ${same.shape}`);
  assert.ok(Math.abs(same.colour - 1) < 1e-9, `colour was ${same.colour}`);
  assert.ok(Math.abs(same.score - 1) < 1e-9, `score was ${same.score}`);
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  for (const { name, error } of failures) console.log(`\nFAILED: ${name}\n${error.stack}`);
  process.exit(1);
}
