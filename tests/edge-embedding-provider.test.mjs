/**
 * Edge-function shared-module tests.
 *
 * WHY THIS EXISTS: tsconfig.json excludes `supabase/functions` (Deno code),
 * so `tsc --noEmit` passes even when a deployed function references an
 * undefined identifier. That is exactly how the Find Product flow broke:
 * `_shared/embedding.ts` used `MOBILECLIP_MODEL_NAME` (declared nowhere),
 * so `getEmbeddingProvider()` threw `ReferenceError` and `visual-match`
 * returned HTTP 500 to every photo — while every local check stayed green.
 *
 * These tests execute the real module under Node (see edge-module-loader.mjs)
 * so any undefined identifier in the provider contract fails here instead of
 * in production.
 *
 * Run: node tests/edge-embedding-provider.test.mjs
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { register } from 'node:module';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

register(pathToFileURL(path.join(ROOT, 'tests', 'edge-module-loader.mjs')).href);

let passed = 0;
let failed = 0;
const failures = [];

async function testAsync(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  ✅ ${name}`);
  } catch (error) {
    failed += 1;
    failures.push({ name, error });
    console.log(`  ❌ ${name}\n     ${error.message}`);
  }
}

const EMBEDDING_MODULE = pathToFileURL(
  path.join(ROOT, 'supabase', 'functions', '_shared', 'embedding.ts'),
).href;

const {
  getEmbeddingProvider,
  validateEmbeddingVector,
  EMBEDDING_MODEL,
  EMBEDDING_DIMENSIONS,
} = await import(EMBEDDING_MODULE);

console.log('\nembedding provider contract (edge runtime)');

await testAsync('getEmbeddingProvider() does not throw (regression: undefined identifier)', () => {
  assert.doesNotThrow(() => getEmbeddingProvider());
});

await testAsync('provider name is the declared model id', () => {
  const provider = getEmbeddingProvider();
  assert.equal(provider.name, EMBEDDING_MODEL);
  assert.equal(typeof provider.name, 'string');
  assert.ok(provider.name.length > 0);
});

await testAsync('model id names the engine that actually computes the vector', () => {
  assert.equal(EMBEDDING_MODEL, 'visual-descriptor-v1');
});

await testAsync('dimensions match the pgvector column (vector(512))', () => {
  assert.equal(EMBEDDING_DIMENSIONS, 512);
});

await testAsync('embedImages([]) reports the real model id, not an undefined binding', async () => {
  const result = await getEmbeddingProvider().embedImages([]);
  assert.deepEqual(result.vectors, []);
  assert.equal(result.model, EMBEDDING_MODEL);
  assert.equal(result.dimensions, EMBEDDING_DIMENSIONS);
});

// A malformed payload must fail with a message an operator can act on, and the
// failure must be wrapped so the edge function can return EMBEDDING_ERROR
// instead of a generic 500. This path runs before any image codec is touched,
// so it is codec-independent.
await testAsync('a malformed image payload fails with a clear wrapped error', async () => {
  await assert.rejects(
    () => getEmbeddingProvider().embedImages(['not-a-data-uri']),
    (error) => /Embedding failed: .*data URI/i.test(error.message),
  );
});

console.log('\nvalidateEmbeddingVector');

await testAsync('accepts a finite 512-dim vector', () => {
  assert.equal(validateEmbeddingVector(new Array(512).fill(0.1)), null);
});

await testAsync('rejects a wrong-length vector with the actual count', () => {
  const message = validateEmbeddingVector(new Array(511).fill(0.1));
  assert.ok(message && message.includes('511'));
});

await testAsync('rejects non-numeric values', () => {
  const vector = new Array(512).fill(0.1);
  vector[7] = 'nope';
  const message = validateEmbeddingVector(vector);
  assert.ok(message && message.includes('index 7'));
});

await testAsync('rejects non-finite values', () => {
  const vector = new Array(512).fill(0.1);
  vector[3] = Number.NaN;
  assert.ok(validateEmbeddingVector(vector));
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  for (const { name, error } of failures) console.error(`FAIL ${name}: ${error.stack}`);
  process.exit(1);
}
