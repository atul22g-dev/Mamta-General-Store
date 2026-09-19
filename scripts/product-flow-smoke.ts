/**
 * Smoke tests for the pure product helpers: ILIKE escaping, image-plan
 * diffing, and form validation (existing rules still green).
 * Run: npx tsx scripts/product-flow-smoke.ts
 */
import assert from 'node:assert/strict';

import {
  escapeIlike,
  planImageChanges,
} from '../src/lib/products/image-plan';
import {
  validateProductForm,
  isFormValid,
  parseAmount,
  parseInteger,
} from '../src/lib/products/product-validation';
import type { ProductImageRef } from '../src/lib/products/product-service';
import type { PickedImage } from '../src/components/products/product-image-picker';

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void): void {
  try {
    fn();
    passed++;
    console.log(`✓ ${name}`);
  } catch (error) {
    failed++;
    console.error(`✗ ${name}\n  ${(error as Error).message}`);
  }
}

const ref = (id: string, url: string): ProductImageRef => ({ id, image_url: url });
const remote = (url: string): PickedImage => ({ uri: url, url });

// --- escapeIlike ---
test('escapeIlike passes plain terms through', () => {
  assert.equal(escapeIlike('basmati rice'), 'basmati rice');
});

test('escapeIlike escapes % _ and backslash', () => {
  assert.equal(escapeIlike('100%'), '100\\%');
  assert.equal(escapeIlike('under_score'), 'under\\_score');
  assert.equal(escapeIlike('back\\slash'), 'back\\\\slash');
});

test('escapeIlike handles combined wildcards', () => {
  assert.equal(escapeIlike('%o_o%'), '\\%o\\_o\\%');
});

// --- planImageChanges ---
test('planImageChanges: no changes', () => {
  const existing = [ref('1', 'https://x/1.jpg')];
  const plan = planImageChanges(existing, [remote('https://x/1.jpg')]);
  assert.deepEqual(plan, { keep: existing, add: [], remove: [] });
});

test('planImageChanges: new local pick → add', () => {
  const existing = [ref('1', 'https://x/1.jpg')];
  const plan = planImageChanges(existing, [
    remote('https://x/1.jpg'),
    { uri: 'file:///tmp/new.jpg' },
  ]);
  assert.equal(plan.keep.length, 1);
  assert.deepEqual(plan.add, [{ uri: 'file:///tmp/new.jpg' }]);
  assert.equal(plan.remove.length, 0);
});

test('planImageChanges: removed existing → remove', () => {
  const existing = [ref('1', 'https://x/1.jpg'), ref('2', 'https://x/2.jpg')];
  const plan = planImageChanges(existing, [remote('https://x/1.jpg')]);
  assert.deepEqual(plan.remove, [ref('2', 'https://x/2.jpg')]);
  assert.deepEqual(plan.keep, [ref('1', 'https://x/1.jpg')]);
  assert.equal(plan.add.length, 0);
});

test('planImageChanges: mixed add + remove', () => {
  const existing = [ref('1', 'https://x/1.jpg'), ref('2', 'https://x/2.jpg')];
  const plan = planImageChanges(existing, [
    remote('https://x/2.jpg'),
    { uri: 'file:///a.png' },
    { uri: 'file:///b.png' },
  ]);
  assert.deepEqual(plan.remove, [ref('1', 'https://x/1.jpg')]);
  assert.deepEqual(plan.keep, [ref('2', 'https://x/2.jpg')]);
  assert.deepEqual(plan.add, [{ uri: 'file:///a.png' }, { uri: 'file:///b.png' }]);
});

test('planImageChanges: removing everything → full remove', () => {
  const existing = [ref('1', 'https://x/1.jpg')];
  const plan = planImageChanges(existing, []);
  assert.equal(plan.keep.length, 0);
  assert.equal(plan.add.length, 0);
  assert.deepEqual(plan.remove, existing);
});

test('planImageChanges: empty product → all adds', () => {
  const plan = planImageChanges([], [{ uri: 'file:///a.png' }]);
  assert.deepEqual(plan.add, [{ uri: 'file:///a.png' }]);
});

// --- validation rules (regression) ---
test('parseAmount rejects junk, accepts decimals', () => {
  assert.equal(parseAmount('abc'), null);
  assert.equal(parseAmount('-5'), null);
  assert.equal(parseAmount('2.5'), 2.5);
  assert.equal(parseAmount(''), null);
});

test('parseInteger rejects decimals and signs', () => {
  assert.equal(parseInteger('2.5'), null);
  assert.equal(parseInteger('-1'), null);
  assert.equal(parseInteger('12'), 12);
});

test('validateProductForm: valid minimal form', () => {
  const errors = validateProductForm({
    name: 'Rice',
    description: '',
    category: 'groceries',
    mrp: '100',
    sellingPrice: '90',
    stock: '',
    unit: 'kg',
  });
  assert.ok(isFormValid(errors));
});

test('validateProductForm: selling price above MRP rejected', () => {
  const errors = validateProductForm({
    name: 'Rice',
    description: '',
    category: 'groceries',
    mrp: '50',
    sellingPrice: '90',
    stock: '',
    unit: 'kg',
  });
  assert.ok(errors.sellingPrice);
});

test('validateProductForm: negative stock rejected', () => {
  const errors = validateProductForm({
    name: 'Rice',
    description: '',
    category: 'groceries',
    mrp: '100',
    sellingPrice: '90',
    stock: '-4',
    unit: 'kg',
  });
  assert.ok(errors.stock);
});

test('validateProductForm: missing name and category flagged', () => {
  const errors = validateProductForm({
    name: '',
    description: '',
    category: '',
    mrp: '100',
    sellingPrice: '90',
    stock: '5',
    unit: 'kg',
  });
  assert.ok(errors.name);
  assert.ok(errors.category);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
