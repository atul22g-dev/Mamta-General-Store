/**
 * Image optimizer unit tests — the pure decision layer
 * (src/utils/image-optimizer.ts) plus static checks on the service wiring
 * (src/services/image.service.ts).
 *
 * Covers the required matrix:
 *   • normal camera photo · large photo · portrait · landscape · square
 *   • PNG / JPEG / HEIC / WebP acceptance; SVG / PDF / unknown rejection
 *   • poor/invalid input: non-strings, empty, control chars, bad schemes
 *   • aspect-ratio preservation, resize-only-when-necessary
 *   • memoization: the same image is never optimized twice
 *
 * Run: node tests/image-optimizer.test.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { register } from 'node:module';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

register(pathToFileURL(path.join(ROOT, 'tests', 'alias-loader.mjs')).href);

const {
  MAX_EDGE_PX,
  JPEG_QUALITY,
  validateImageUri,
  validateImageType,
  planResize,
  getCachedOptimization,
  rememberOptimization,
  clearOptimizationCache,
  optimizationCacheSize,
  dataUriByteSize,
} = await import(
  pathToFileURL(path.join(ROOT, 'src', 'utils', 'image-optimizer.ts')).href
);

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed += 1;
    failures.push({ name, err });
    console.error(`  ✗ ${name}\n    ${err.message}`);
  }
}

function section(title) {
  console.log(`\n${title}`);
}

// ---------------------------------------------------------------------------
// URI validation (poor/invalid input)
// ---------------------------------------------------------------------------
section('URI validation');

test('accepts file:, content: and data: URIs', () => {
  assert.equal(validateImageUri('file:///cache/img.jpg').valid, true);
  assert.equal(validateImageUri('content://media/external/images/1').valid, true);
  assert.equal(
    validateImageUri('data:image/jpeg;base64,/9j/4AAQSkZJRg==').valid,
    true,
  );
});

test('rejects non-strings, empties and whitespace', () => {
  assert.equal(validateImageUri(null).valid, false);
  assert.equal(validateImageUri(undefined).valid, false);
  assert.equal(validateImageUri(42).valid, false);
  assert.equal(validateImageUri('').valid, false);
  assert.equal(validateImageUri('   ').valid, false);
});

test('rejects unsupported schemes (https, blob, bare paths)', () => {
  assert.equal(validateImageUri('https://example.com/a.jpg').valid, false);
  assert.equal(validateImageUri('blob:https://web.app/xyz').valid, false);
  assert.equal(validateImageUri('/storage/emulated/0/photo.jpg').valid, false);
});

test('rejects URIs with control characters', () => {
  assert.equal(validateImageUri('file:///cache/im\u0000g.jpg').valid, false);
  assert.equal(validateImageUri('file:///cache/im\n g.jpg').valid, false);
});

// ---------------------------------------------------------------------------
// Type validation
// ---------------------------------------------------------------------------
section('Type validation');

test('accepts PNG, JPEG, HEIC and WebP extensions', () => {
  assert.equal(validateImageType('file:///a.png').valid, true);
  assert.equal(validateImageType('file:///a.JPG').valid, true);
  assert.equal(validateImageType('file:///a.heic').valid, true);
  assert.equal(validateImageType('file:///a.webp').valid, true);
  assert.equal(validateImageType('content://x/images/1').valid, true); // no ext → decode decides
});

test('accepts image data URIs by MIME prefix', () => {
  assert.equal(validateImageType('data:image/png;base64,iVBORw0=').valid, true);
  assert.equal(validateImageType('data:image/jpeg;base64,/9j/').valid, true);
});

test('rejects SVG, PDF and unknown extensions with specific messages', () => {
  const svg = validateImageType('file:///logo.svg');
  assert.equal(svg.valid, false);
  assert.match(svg.reason, /SVG/);
  const pdf = validateImageType('file:///doc.pdf');
  assert.equal(pdf.valid, false);
  assert.match(pdf.reason, /PDF/);
  const exe = validateImageType('file:///thing.xyz');
  assert.equal(exe.valid, false);
  assert.match(exe.reason, /Unsupported image type/);
});

test('rejects non-image data URIs', () => {
  assert.equal(validateImageType('data:text/html;base64,PGI+').valid, false);
  assert.equal(validateImageType('data:application/pdf;base64,JVBERi0=').valid, false);
});

// ---------------------------------------------------------------------------
// Resize planning — the required photo matrix
// ---------------------------------------------------------------------------
section('Resize planning (camera photo matrix)');

test('normal camera photo (4000×3000) → landscape resize to 1024 wide', () => {
  const plan = planResize(4000, 3000);
  assert.equal(plan.needsResize, true);
  assert.deepEqual(plan.resize, { width: 1024, height: null });
  assert.deepEqual(plan.output, { width: 1024, height: 768 });
});

test('large photo (8640×11520, 100 MP composite) → portrait resize to 1024 high', () => {
  const plan = planResize(8640, 11520);
  assert.equal(plan.needsResize, true);
  assert.deepEqual(plan.resize, { width: null, height: 1024 });
  assert.deepEqual(plan.output, { width: 768, height: 1024 });
});

test('portrait photo (3000×4000) → keeps aspect ratio, clamps height', () => {
  const plan = planResize(3000, 4000);
  assert.equal(plan.needsResize, true);
  assert.deepEqual(plan.resize, { width: null, height: 1024 });
  assert.deepEqual(plan.output, { width: 768, height: 1024 });
  const ratio = plan.output.width / plan.output.height;
  assert.ok(Math.abs(ratio - 3000 / 4000) < 1e-9, 'aspect ratio must be preserved');
});

test('landscape photo (1920×1080) → clamps width only', () => {
  const plan = planResize(1920, 1080);
  assert.equal(plan.needsResize, true);
  assert.deepEqual(plan.output, { width: 1024, height: 576 });
});

test('image already ≤1024 is NOT resized (requirement 5)', () => {
  const exact = planResize(1024, 1024);
  assert.equal(exact.needsResize, false);
  assert.equal(exact.resize, null);
  const small = planResize(640, 480);
  assert.equal(small.needsResize, false);
  assert.deepEqual(small.output, { width: 640, height: 480 });
});

test('aspect ratio preserved within 1 px for odd dimensions', () => {
  const plan = planResize(4032, 3024);
  const expected = Math.round(1024 * (3024 / 4032));
  assert.equal(plan.output.height, expected);
});

test('degenerate dimensions (0, negative, NaN) never resize or crash', () => {
  for (const [w, h] of [[0, 0], [-5, 100], [100, NaN], [NaN, NaN]]) {
    const plan = planResize(w, h);
    assert.equal(plan.needsResize, false);
    assert.equal(plan.resize, null);
  }
});

test('defaults match the requirements: 1024 px cap, 0.8 quality', () => {
  assert.equal(MAX_EDGE_PX, 1024);
  assert.equal(JPEG_QUALITY, 0.8);
});

// ---------------------------------------------------------------------------
// Memoization — never optimize the same image twice
// ---------------------------------------------------------------------------
section('Memoization');

test('stores and returns the first optimization result', () => {
  clearOptimizationCache();
  rememberOptimization('file:///cache/one.jpg', { uri: 'file:///cache/one-opt.jpg', width: 1024, height: 768 });
  const hit = getCachedOptimization('file:///cache/one.jpg');
  assert.ok(hit);
  assert.equal(hit.uri, 'file:///cache/one-opt.jpg');
  assert.equal(optimizationCacheSize(), 1);
});

test('unknown URIs miss the cache', () => {
  clearOptimizationCache();
  assert.equal(getCachedOptimization('file:///cache/nope.jpg'), null);
});

test('bounded cache evicts the oldest entry (no unbounded growth)', () => {
  clearOptimizationCache();
  for (let i = 0; i < 30; i++) {
    rememberOptimization(`file:///cache/img-${i}.jpg`, { uri: `file:///cache/opt-${i}.jpg`, width: 1024, height: 768 });
  }
  assert.ok(optimizationCacheSize() <= 24, `cache size ${optimizationCacheSize()} exceeds limit`);
  // Oldest entries evicted, newest retained.
  assert.equal(getCachedOptimization('file:///cache/img-0.jpg'), null);
  assert.ok(getCachedOptimization('file:///cache/img-29.jpg'));
});

// ---------------------------------------------------------------------------
// Service wiring (static checks — impure side needs a device)
// ---------------------------------------------------------------------------
section('Service wiring');

const service = fs.readFileSync(path.join(ROOT, 'src/services/image.service.ts'), 'utf8');
const uploader = fs.readFileSync(path.join(ROOT, 'src/services/product.service.ts'), 'utf8');

test('service validates URI and type before any decode', () => {
  // Measure the RUN order inside optimizeImage (helpers live above it).
  const body = service.slice(service.indexOf('export async function optimizeImage'));
  const uriIdx = body.indexOf('validateImageUri(');
  const typeIdx = body.indexOf('validateImageType(');
  const cacheIdx = body.indexOf('getCachedOptimization(');
  // The measure/probe reads are raced via Promise.all — anchor on the call
  // itself, which stays strictly after the cheap checks in both forms.
  const decodeIdx = body.indexOf('measureImage(source)');
  assert.ok(uriIdx >= 0, 'URI validation runs');
  assert.ok(typeIdx > uriIdx, 'type validation after URI validation');
  assert.ok(cacheIdx > typeIdx, 'cache check after validation');
  assert.ok(decodeIdx > cacheIdx, 'decode only after all cheap checks');
});

test('service logs original + optimized dimensions, sizes and processing time', () => {
  assert.match(service, /\[image\]/);
  assert.match(service, /originalSize\.width/);
  assert.match(service, /optimizedBytes/);
  assert.match(service, /formatBytes\(originalBytes\)/);
  assert.match(service, /durationMs/);
});

test('service measures file size WITHOUT the slow RN Blob path', () => {
  // The old probe fetched and used Response.blob(), which on native copies
  // into the blob store and round-trips base64 (the expo-blob warning) and
  // could report nonsense sizes (a 472×1024 JPEG measured as "14 B").
  assert.doesNotMatch(service, /response\.blob\(\)/, 'no Response.blob() in the size probe');
  assert.match(service, /import\('expo-file-system'\)/, 'file sizes come from native file metadata');
  assert.match(service, /dataUriByteSize\(/, 'data URIs are sized by base64 arithmetic');
});

test('dataUriByteSize — exact base64 arithmetic', () => {
  // 'Hello' -> 'SGVsbG8=' (8 chars, 1 pad) -> 5 bytes.
  assert.equal(dataUriByteSize('data:image/jpeg;base64,SGVsbG8='), 5);
  // 3-byte payload 'abc' -> 'YWJj' (no padding).
  assert.equal(dataUriByteSize('data:image/jpeg;base64,YWJj'), 3);
  // 6-byte payload -> 8 chars, no padding.
  assert.equal(dataUriByteSize('data:image/png;base64,' + Buffer.from('123456').toString('base64')), 6);
  // Malformed / empty payloads are null, not a bogus size.
  assert.equal(dataUriByteSize('data:image/jpeg;base64,'), null);
  assert.equal(dataUriByteSize('data:image/jpeg;base64'), null);
  // A real 1x1 px JPEG (the smallest legitimate photo payload) — 125 bytes.
  const px = Buffer.from(
    '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a' +
      'HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAA' +
      'AAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AVN//2Q==',
    'base64',
  );
  const uri = `data:image/jpeg;base64,${px.toString('base64')}`;
  assert.equal(dataUriByteSize(uri), px.length);
});

test('service returns cache-hit results without decoding', () => {
  assert.match(service, /getCachedOptimization\(/);
  assert.match(service, /fromCache: true/);
  assert.match(service, /durationMs: 0/);
});

test('service always saves as JPEG at the configured quality (format normalization)', () => {
  assert.match(service, /SaveFormat\.JPEG/);
  assert.match(service, /compress: JPEG_QUALITY/);
});

test('the upload pipeline is the single consumer (originals untouched)', () => {
  assert.match(uploader, /optimizeImageUri\(localUri\)/);
  assert.match(service, /The input file is never modified/);
});

test('the deleted ad-hoc module has no remaining importers', () => {
  assert.ok(
    !uploader.includes('image-optimization'),
    'product-service must import the service, not the deleted module',
  );
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
section('Summary');
console.log(`${passed} passed, ${failed} failed`);
if (failed > 0) {
  for (const f of failures) console.error(`FAILED: ${f.name}`);
  process.exit(1);
}
