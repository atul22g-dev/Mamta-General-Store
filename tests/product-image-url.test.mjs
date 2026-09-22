/**
 * Product image URL resolver unit tests — the single choke point every
 * product photo in the app passes through before reaching <Image>.
 *
 * Regression context: "product image not showing" had two causes, and both
 * collapsed into a blank box because a bad value reached <Image> directly.
 * A resolver that returns an empty string (or a double-slashed URL) must be
 * caught here rather than discovered on a phone.
 *
 * Run: node tests/product-image-url.test.mjs
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { register } from 'node:module';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Registers the loader that mocks @/services/supabase.service and react-native, so the
// REAL resolver source is exercised without network or native modules.
register(pathToFileURL(path.join(ROOT, 'tests', 'alias-loader-embed.mjs')).href);

const { getProductImageUrl } = await import('@/utils/get-product-image-url.ts');

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

// ---------------------------------------------------------------------------
// Missing / empty input must resolve to null, never '' — an empty uri string
// is what renders an invisible image while the layout still reserves space.
// ---------------------------------------------------------------------------
section('Missing input resolves to null (never an empty string)');

for (const [label, value] of [
  ['null', null],
  ['undefined', undefined],
  ['empty string', ''],
  ['whitespace only', '   '],
  ['slashes only', '///'],
]) {
  test(`${label} → null`, () => {
    assert.equal(getProductImageUrl(value), null);
  });
}

// ---------------------------------------------------------------------------
// Already-complete URLs must pass through byte-for-byte. Double-prefixing a
// stored public URL is the classic way to produce a dead image link.
// ---------------------------------------------------------------------------
section('Complete URLs pass through unchanged');

const storedUrl =
  'https://example.supabase.co/storage/v1/object/public/product-images/p1/abc.jpeg';

test('public storage URL is unchanged', () => {
  assert.equal(getProductImageUrl(storedUrl), storedUrl);
});

test('URL with query string is unchanged', () => {
  const withQuery = `${storedUrl}?v=2`;
  assert.equal(getProductImageUrl(withQuery), withQuery);
});

test('plain http URL is unchanged', () => {
  const http = 'http://cdn.example.com/a/b.png';
  assert.equal(getProductImageUrl(http), http);
});

test('surrounding whitespace is trimmed, not passed on', () => {
  assert.equal(getProductImageUrl(`  ${storedUrl}  `), storedUrl);
});

// ---------------------------------------------------------------------------
// Bare bucket paths (rows written by SQL/scripts) resolve inside the
// product-images bucket.
// ---------------------------------------------------------------------------
section('Bare storage paths resolve to the product-images bucket');

test('relative path resolves to a product-images public URL', () => {
  const url = getProductImageUrl('p1/abc.jpeg');
  assert.equal(typeof url, 'string');
  assert.match(url, /^https:\/\//);
  assert.ok(url.includes('product-images/p1/abc.jpeg'), `unexpected url: ${url}`);
});

test('leading slash does not produce a double slash', () => {
  const url = getProductImageUrl('/p1/abc.jpeg');
  assert.ok(!url.includes('//p1'), `double slash leaked into: ${url}`);
  assert.ok(url.includes('product-images/p1/abc.jpeg'), `unexpected url: ${url}`);
});

// ---------------------------------------------------------------------------
// Local/preview URIs (what the picker and camera hand over) must survive
// untouched or the capture preview goes blank.
// ---------------------------------------------------------------------------
section('Local preview URIs pass through unchanged');

const dataUri = 'data:image/png;base64,iVBORw0KGgo=';

test('data URI is unchanged', () => {
  assert.equal(getProductImageUrl(dataUri), dataUri);
});

test('blob: URI is unchanged', () => {
  const blob = 'blob:http://localhost:8081/1a2b3c';
  assert.equal(getProductImageUrl(blob), blob);
});

test('file: URI is unchanged', () => {
  const file = 'file:///var/mobile/tmp/photo.jpg';
  assert.equal(getProductImageUrl(file), file);
});

// ---------------------------------------------------------------------------
// Any non-null result must be something <Image> can actually load.
// ---------------------------------------------------------------------------
section('Every non-null result is loadable by <Image>');

test('all inputs resolve to null or an absolute/preview URI', () => {
  const inputs = [
    null,
    '',
    '   ',
    storedUrl,
    `${storedUrl}?v=2`,
    'p1/abc.jpeg',
    '/p1/abc.jpeg',
    dataUri,
    'blob:http://localhost:8081/1a2b3c',
    'file:///tmp/photo.jpg',
  ];
  for (const input of inputs) {
    const url = getProductImageUrl(input);
    if (url === null) continue;
    assert.match(url, /^(https?:|data:|blob:|file:)/, `not loadable: ${url} (from ${input})`);
    assert.ok(url.trim() !== '', `blank url (from ${input})`);
  }
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  for (const { name, error } of failures) {
    console.log(`\nFAILED: ${name}\n${error.stack}`);
  }
  process.exit(1);
}
