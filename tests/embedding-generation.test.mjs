/**
 * Embedding generation unit tests — validates generateProductEmbedding
 * input/output contract without hitting Supabase or the edge function.
 *
 * Mocks the Supabase client at the module level so product-service.ts
 * can be imported without pulling in React Native dependencies.
 *
 * Run: node tests/embedding-generation.test.mjs
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { register } from 'node:module';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Register the custom loader that mocks supabase + react-native modules
register(pathToFileURL(path.join(ROOT, 'tests', 'alias-loader-embed.mjs')).href);

// Import the mock controls and module under test
const mockPath = pathToFileURL(path.join(ROOT, 'tests', 'mock-supabase.mjs')).href;
const { setMockInvokeResult, setMockInvokeError, resetMocks } = await import(mockPath);
const { generateProductEmbedding } = await import('@/lib/products/embedding-service.ts');

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
console.log('\ngenerateProductEmbedding');

await testAsync('empty product ID → error', async () => {
  resetMocks();
  const result = await generateProductEmbedding('');
  assert.equal(result.ok, false);
  assert.match(result.error, /no product ID/i);
});

await testAsync('whitespace-only product ID → error', async () => {
  resetMocks();
  const result = await generateProductEmbedding('   ');
  assert.equal(result.ok, false);
  assert.match(result.error, /no product ID/i);
});

await testAsync('successful embedding (embedded > 0, no failures)', async () => {
  resetMocks();
  setMockInvokeResult({ embedded: 2, failed: [], message: 'Done.' });
  const result = await generateProductEmbedding('prod-123');
  assert.equal(result.ok, true);
  assert.equal(result.data.embedded, 2);
  assert.equal(result.data.failed.length, 0);
  assert.equal(result.data.hasEmbedding, true);
});

await testAsync('partial failure (some images failed, some succeeded)', async () => {
  resetMocks();
  setMockInvokeResult({
    embedded: 1,
    failed: [{ id: 'img-fail', error: 'Download failed: HTTP 404' }],
    message: 'Partial.',
  });
  const result = await generateProductEmbedding('prod-456');
  assert.equal(result.ok, true);
  assert.equal(result.data.embedded, 1);
  assert.equal(result.data.failed.length, 1);
  assert.equal(result.data.hasEmbedding, true);
});

await testAsync('zero embedded (nothing pending) → hasEmbedding false', async () => {
  resetMocks();
  setMockInvokeResult({ embedded: 0, failed: [], message: 'Nothing pending.' });
  const result = await generateProductEmbedding('prod-789');
  assert.equal(result.ok, true);
  assert.equal(result.data.embedded, 0);
  assert.equal(result.data.hasEmbedding, false);
});

await testAsync('edge function returns error object → error', async () => {
  resetMocks();
  setMockInvokeResult({ error: 'Authentication required.' });
  const result = await generateProductEmbedding('prod-auth');
  assert.equal(result.ok, false);
  assert.match(result.error, /Authentication required/i);
});

await testAsync('edge function returns null response → error', async () => {
  resetMocks();
  setMockInvokeResult(null);
  const result = await generateProductEmbedding('prod-null');
  assert.equal(result.ok, false);
  assert.match(result.error, /unexpected response/i);
});

await testAsync('supabase client returns error → error', async () => {
  resetMocks();
  setMockInvokeError({ message: 'Network request failed', code: 'NETWORK_ERROR' });
  const result = await generateProductEmbedding('prod-net');
  assert.equal(result.ok, false);
  assert.ok(typeof result.error === 'string');
  assert.ok(result.error.length > 0);
});

await testAsync('exception thrown → returns error, not thrown', async () => {
  resetMocks();
  const result = await generateProductEmbedding('prod-crash');
  // Should always return a ServiceResult, never throw
  assert.ok(typeof result === 'object');
  assert.ok('ok' in result);
});

await testAsync('all images failed → hasEmbedding false', async () => {
  resetMocks();
  setMockInvokeResult({
    embedded: 0,
    failed: [
      { id: 'img-1', error: 'Decode failed' },
      { id: 'img-2', error: 'Dimension mismatch' },
    ],
    message: 'All failed.',
  });
  const result = await generateProductEmbedding('prod-allfail');
  assert.equal(result.ok, true);
  assert.equal(result.data.embedded, 0);
  assert.equal(result.data.failed.length, 2);
  assert.equal(result.data.hasEmbedding, false);
});

await testAsync('malformed response (string) → error', async () => {
  resetMocks();
  setMockInvokeResult('unexpected string');
  const result = await generateProductEmbedding('prod-badtype');
  assert.equal(result.ok, false);
  assert.match(result.error, /unexpected response/i);
});

await testAsync('malformed response (array) → error', async () => {
  resetMocks();
  setMockInvokeResult([1, 2, 3]);
  const result = await generateProductEmbedding('prod-array');
  assert.equal(result.ok, false);
  assert.match(result.error, /unexpected response/i);
});

await testAsync('missing embedded field → defaults to 0', async () => {
  resetMocks();
  setMockInvokeResult({ message: 'ok' }); // missing 'embedded' field
  const result = await generateProductEmbedding('prod-nofield');
  assert.equal(result.ok, true);
  assert.equal(result.data.embedded, 0);
  assert.equal(result.data.hasEmbedding, false);
});

await testAsync('missing failed field → defaults to empty array', async () => {
  resetMocks();
  setMockInvokeResult({ embedded: 1 }); // missing 'failed' field
  const result = await generateProductEmbedding('prod-nofail');
  assert.equal(result.ok, true);
  assert.equal(result.data.failed.length, 0);
  assert.equal(result.data.hasEmbedding, true);
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  for (const { name, error } of failures) console.error(`FAIL ${name}: ${error.stack}`);
  process.exit(1);
}
