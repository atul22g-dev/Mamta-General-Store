/**
 * Image pipeline unit tests — validates MIME detection, data URI validation,
 * and error handling without React Native or file system access.
 *
 * Run: node tests/image-pipeline.test.mjs
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { register } from 'node:module';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
register(pathToFileURL(path.join(ROOT, 'tests', 'alias-loader.mjs')).href);

const {
  detectMimeTypeFromUri,
  isValidEmbeddingDataUri,
  SUPPORTED_MIME_TYPES,
  MAX_IMAGE_BYTES,
  MAX_DATA_URI_CHARS,
} = await import('@/services/image-pipeline.service.ts');

const { bytesToBase64 } = await import('@/utils/base64.ts');

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

// ---------------------------------------------------------------------------
// detectMimeTypeFromUri
// ---------------------------------------------------------------------------
console.log('\ndetectMimeTypeFromUri');

test('JPEG extension → image/jpeg', () => {
  assert.equal(detectMimeTypeFromUri('photo.jpg'), 'image/jpeg');
});

test('JPEG extension (long) → image/jpeg', () => {
  assert.equal(detectMimeTypeFromUri('photo.jpeg'), 'image/jpeg');
});

test('PNG extension → image/png', () => {
  assert.equal(detectMimeTypeFromUri('photo.png'), 'image/png');
});

test('HEIC extension → image/jpeg (transcoded)', () => {
  assert.equal(detectMimeTypeFromUri('photo.heic'), 'image/jpeg');
});

test('HEIF extension → image/jpeg (transcoded)', () => {
  assert.equal(detectMimeTypeFromUri('photo.heif'), 'image/jpeg');
});

test('Unknown extension → image/jpeg (default)', () => {
  assert.equal(detectMimeTypeFromUri('photo.bmp'), 'image/jpeg');
});

test('No extension → image/jpeg (default)', () => {
  assert.equal(detectMimeTypeFromUri('photo'), 'image/jpeg');
});

test('Path with directories → extracts last extension', () => {
  assert.equal(detectMimeTypeFromUri('/data/user/0/com.app/files/photo.png'), 'image/png');
});

test('Case insensitive extension', () => {
  assert.equal(detectMimeTypeFromUri('photo.JPG'), 'image/jpeg');
  assert.equal(detectMimeTypeFromUri('photo.Png'), 'image/png');
});

// ---------------------------------------------------------------------------
// isValidEmbeddingDataUri
// ---------------------------------------------------------------------------
console.log('\nisValidEmbeddingDataUri');

test('Valid JPEG data URI → true', () => {
  const dataUri = 'data:image/jpeg;base64,' + 'A'.repeat(100);
  assert.equal(isValidEmbeddingDataUri(dataUri), true);
});

test('Valid PNG data URI → true', () => {
  const dataUri = 'data:image/png;base64,' + 'B'.repeat(100);
  assert.equal(isValidEmbeddingDataUri(dataUri), true);
});

test('jpg MIME → true (accepted)', () => {
  const dataUri = 'data:image/jpg;base64,' + 'C'.repeat(100);
  assert.equal(isValidEmbeddingDataUri(dataUri), true);
});

test('WebP data URI → false (not supported)', () => {
  const dataUri = 'data:image/webp;base64,' + 'D'.repeat(100);
  assert.equal(isValidEmbeddingDataUri(dataUri), false);
});

test('GIF data URI → false (not supported)', () => {
  const dataUri = 'data:image/gif;base64,' + 'E'.repeat(100);
  assert.equal(isValidEmbeddingDataUri(dataUri), false);
});

test('Empty base64 → false (invalid pattern)', () => {
  assert.equal(isValidEmbeddingDataUri('data:image/jpeg;base64,'), false);
});

test('Non-base64 characters → false', () => {
  const dataUri = 'data:image/jpeg;base64,!!!invalid***';
  assert.equal(isValidEmbeddingDataUri(dataUri), false);
});

test('Too large data URI → false', () => {
  const dataUri = 'data:image/jpeg;base64,' + 'X'.repeat(MAX_DATA_URI_CHARS + 1);
  assert.equal(isValidEmbeddingDataUri(dataUri), false);
});

test('Exact max size → true', () => {
  // Pad to exactly MAX_DATA_URI_CHARS
  const prefix = 'data:image/jpeg;base64,';
  const padding = MAX_DATA_URI_CHARS - prefix.length;
  const dataUri = prefix + 'A'.repeat(padding);
  assert.equal(isValidEmbeddingDataUri(dataUri), true);
});

// ---------------------------------------------------------------------------
// Constants sanity checks
// ---------------------------------------------------------------------------
console.log('\nconstants');

test('SUPPORTED_MIME_TYPES includes jpeg and png', () => {
  assert.ok(SUPPORTED_MIME_TYPES.includes('image/jpeg'));
  assert.ok(SUPPORTED_MIME_TYPES.includes('image/png'));
  assert.equal(SUPPORTED_MIME_TYPES.length, 2);
});

test('MAX_IMAGE_BYTES is 5 MB', () => {
  assert.equal(MAX_IMAGE_BYTES, 5 * 1024 * 1024);
});

test('MAX_DATA_URI_CHARS is ~7 MB', () => {
  assert.equal(MAX_DATA_URI_CHARS, 7_000_000);
});

// ---------------------------------------------------------------------------
// bytesToBase64 (imported from base64.ts — used by the pipeline)
// ---------------------------------------------------------------------------
console.log('\nbytesToBase64 (pipeline dependency)');

test('round-trips a large buffer without stack overflow', () => {
  const bytes = new Uint8Array(600_000).map((_, i) => i % 251);
  const encoded = bytesToBase64(bytes);
  assert.ok(encoded.length > 700_000);
  assert.equal(encoded.endsWith('='), bytes.length % 3 !== 0);
});

test('encodes empty input to empty string', () => {
  assert.equal(bytesToBase64(new Uint8Array(0)), '');
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  for (const { name, error } of failures) console.error(`FAIL ${name}: ${error.stack}`);
  process.exit(1);
}
