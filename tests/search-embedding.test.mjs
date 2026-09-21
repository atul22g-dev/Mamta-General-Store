/**
 * Search embedding validation unit tests — validates the vector checks
 * that run before sending to the pgvector RPC.
 *
 * Tests the validateEmbeddingVector logic from the edge function's
 * shared embedding module.
 *
 * Run: node tests/search-embedding.test.mjs
 */
import assert from 'node:assert/strict';

// ---------------------------------------------------------------------------
// Re-implement validateEmbeddingVector for testing (same logic as
// supabase/functions/_shared/embedding.ts:validateEmbeddingVector)
// ---------------------------------------------------------------------------

const EMBEDDING_DIMENSIONS = 512;

function validateEmbeddingVector(vector, expectedDimensions = EMBEDDING_DIMENSIONS) {
  if (!vector || !Array.isArray(vector)) {
    return 'Embedding vector is not an array.';
  }

  if (vector.length !== expectedDimensions) {
    return `Embedding dimension mismatch: got ${vector.length}, expected ${expectedDimensions}.`;
  }

  for (let i = 0; i < vector.length; i++) {
    if (typeof vector[i] !== 'number' || !Number.isFinite(vector[i])) {
      return `Embedding contains invalid value at index ${i}: ${vector[i]}.`;
    }
  }

  return null;
}

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

// Helper: create a valid 512-dim vector
function validVector() {
  return new Array(512).fill(0).map((_, i) => i / 512);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
console.log('\nvalidateEmbeddingVector');

// --- Valid vectors ---

test('valid 512-dim vector → null (passes)', () => {
  assert.equal(validateEmbeddingVector(validVector()), null);
});

test('all zeros → null (passes)', () => {
  assert.equal(validateEmbeddingVector(new Array(512).fill(0)), null);
});

test('all ones → null (passes)', () => {
  assert.equal(validateEmbeddingVector(new Array(512).fill(1)), null);
});

test('negative values → null (passes)', () => {
  assert.equal(validateEmbeddingVector(new Array(512).fill(-0.5)), null);
});

test('mixed positive/negative → null (passes)', () => {
  const vec = validVector().map((v, i) => (i % 2 === 0 ? v : -v));
  assert.equal(validateEmbeddingVector(vec), null);
});

// --- Invalid: not an array ---

test('null → error', () => {
  assert.match(validateEmbeddingVector(null), /not an array/i);
});

test('undefined → error', () => {
  assert.match(validateEmbeddingVector(undefined), /not an array/i);
});

test('string → error', () => {
  assert.match(validateEmbeddingVector('not an array'), /not an array/i);
});

test('number → error', () => {
  assert.match(validateEmbeddingVector(42), /not an array/i);
});

test('object → error', () => {
  assert.match(validateEmbeddingVector({ 0: 1, length: 512 }), /not an array/i);
});

// --- Invalid: wrong dimension ---

test('empty array → dimension mismatch', () => {
  assert.match(validateEmbeddingVector([]), /dimension mismatch/);
});

test('100-dim vector → dimension mismatch', () => {
  assert.match(validateEmbeddingVector(new Array(100).fill(0)), /dimension mismatch/);
});

test('511-dim vector → dimension mismatch', () => {
  assert.match(validateEmbeddingVector(new Array(511).fill(0)), /dimension mismatch/);
});

test('513-dim vector → dimension mismatch', () => {
  assert.match(validateEmbeddingVector(new Array(513).fill(0)), /dimension mismatch/);
});

test('dimension mismatch includes actual and expected counts', () => {
  const msg = validateEmbeddingVector(new Array(100).fill(0));
  assert.match(msg, /got 100/);
  assert.match(msg, /expected 512/);
});

// --- Invalid: NaN values ---

test('NaN at index 0 → error at index 0', () => {
  const vec = validVector();
  vec[0] = NaN;
  const msg = validateEmbeddingVector(vec);
  assert.match(msg, /index 0/);
  assert.match(msg, /NaN/);
});

test('NaN at last index → error at last index', () => {
  const vec = validVector();
  vec[511] = NaN;
  const msg = validateEmbeddingVector(vec);
  assert.match(msg, /index 511/);
});

// --- Invalid: Infinity ---

test('Infinity → error', () => {
  const vec = validVector();
  vec[100] = Infinity;
  const msg = validateEmbeddingVector(vec);
  assert.match(msg, /index 100/);
  assert.match(msg, /Infinity/);
});

test('-Infinity → error', () => {
  const vec = validVector();
  vec[200] = -Infinity;
  const msg = validateEmbeddingVector(vec);
  assert.match(msg, /index 200/);
});

// --- Invalid: null values ---

test('null in array → error', () => {
  const vec = validVector();
  vec[50] = null;
  const msg = validateEmbeddingVector(vec);
  assert.match(msg, /index 50/);
  assert.match(msg, /null/);
});

// --- Invalid: undefined values ---

test('undefined in array → error', () => {
  const vec = validVector();
  vec[300] = undefined;
  const msg = validateEmbeddingVector(vec);
  assert.match(msg, /index 300/);
});

// --- Invalid: string values ---

test('string in array → error', () => {
  const vec = validVector();
  vec[256] = 'hello';
  const msg = validateEmbeddingVector(vec);
  assert.match(msg, /index 256/);
  assert.match(msg, /hello/);
});

// --- Invalid: boolean values ---

test('boolean in array → error', () => {
  const vec = validVector();
  vec[1] = true;
  const msg = validateEmbeddingVector(vec);
  assert.match(msg, /index 1/);
});

// --- Multiple invalid values ---

test('multiple NaN values → error at first occurrence', () => {
  const vec = validVector();
  vec[10] = NaN;
  vec[20] = NaN;
  vec[30] = NaN;
  const msg = validateEmbeddingVector(vec);
  assert.match(msg, /index 10/); // stops at first
});

// --- Custom dimension ---

test('custom dimension: 256-dim valid vector passes', () => {
  const vec = new Array(256).fill(0.5);
  assert.equal(validateEmbeddingVector(vec, 256), null);
});

test('custom dimension: 256-dim vector with wrong length fails', () => {
  const vec = new Array(100).fill(0.5);
  assert.match(validateEmbeddingVector(vec, 256), /dimension mismatch/);
});

// --- Edge cases ---

test('sparse vector (mostly undefined) → error at first undefined', () => {
  const vec = new Array(512);
  vec[0] = 0.5; // only first element set
  const msg = validateEmbeddingVector(vec);
  assert.match(msg, /index 1/); // second element is undefined
});

test('vector with holes → error', () => {
  const vec = validVector();
  delete vec[100]; // creates a hole (undefined)
  const msg = validateEmbeddingVector(vec);
  assert.match(msg, /index 100/);
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  for (const { name, error } of failures) console.error(`FAIL ${name}: ${error.stack}`);
  process.exit(1);
}
