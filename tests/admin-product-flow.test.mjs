/**
 * Admin product lifecycle — the full add → search → edit → delete flow,
 * executed against a STATEFUL mock Supabase (a tiny in-memory database:
 * rows, storage objects, embedding vectors, RPC results).
 *
 *   1. Add product      → optimize → upload → embed(512) → attach
 *   2. Search product   → listProducts finds it; RPC returns it
 *   3. Change price     → updateProduct — embedding NOT regenerated
 *   4. Search again     → still listed, new price visible, vector intact
 *   5. Change image     → remove+upload → NEW embedding generated
 *   6. Search again     → still listed, all images embedded
 *   7. Delete product   → row gone AND Storage objects removed
 *   8. Confirm deleted  → listProducts no longer returns it
 *
 * Plus static checks that pin the Screen → Hook → Service layering:
 * screens import hooks (never services with Supabase), the hook
 * orchestrates, the service talks to Supabase.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { register } from 'node:module';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

register(pathToFileURL(path.join(ROOT, 'tests', 'admin-flow-loader.mjs')).href);

const { __setAdminFlowState, VALID_512 } = await import(
  pathToFileURL(path.join(ROOT, 'tests', 'admin-flow-mocks.mjs')).href
);

const svc = await import(
  pathToFileURL(path.join(ROOT, 'src', 'services', 'product.service.ts')).href
);

const ID = {
  product: 'p-1111',
  imageA: 'img-aaaa',
  imageB: 'img-bbbb',
};

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      passed += 1;
      console.log(`  ✅ ${name}`);
    })
    .catch((error) => {
      failed += 1;
      failures.push({ name, error });
      console.log(`  ❌ ${name}\n     ${error.message}`);
    });
}

function section(title) {
  console.log(`\n${title}`);
}

function freshState(overrides = {}) {
  const state = {
    rows: new Map(),
    images: new Map(),
    storage: new Map(),
    storageRemoveError: null,
    uploadError: null,
    invokeError: null,
    rpcError: null,
    rpcResult: [],
    lastEmbedProductId: null,
    lastRpc: null,
    counters: { creates: 0, uploads: 0, embeds: 0, storageRemoves: 0 },
    ...overrides,
  };
  __setAdminFlowState(state);
  return state;
}

function seedProduct(store, { withEmbedding = true } = {}) {
  store.rows.set(ID.product, {
    id: ID.product,
    name: 'Parle-G',
    selling_price: 55,
    mrp: 60,
    created_at: '2026-01-01T00:00:00Z',
  });
  store.images.set(ID.imageA, {
    id: ID.imageA,
    product_id: ID.product,
    image_url: `https://mock.storage/product-images/${ID.product}/${ID.imageA}.jpg`,
    embedding: withEmbedding ? [...VALID_512] : null,
  });
  store.storage.set(`${ID.product}/${ID.imageA}.jpg`, true);
}

const imageUrlFor = (imageId) =>
  `https://mock.storage/product-images/${ID.product}/${imageId}.jpg`;

// ---------------------------------------------------------------------------
// 1–2. Add + search
// ---------------------------------------------------------------------------
section('Add product (optimize → upload → embed → attach)');

await test('uploadProductImage stores the object and attaches an embedded row', async () => {
  const store = freshState();
  store.rows.set(ID.product, { id: ID.product, name: 'Parle-G' });

  const result = await svc.uploadProductImage(ID.product, 'file:///tmp/photo-a.jpg');

  assert.equal(result.ok, true, `upload ok: ${result.ok ? '' : result.error}`);
  assert.equal(store.counters.uploads, 1, 'one storage upload');
  assert.equal(store.images.size, 1, 'one product_images row attached');
  const [image] = store.images.values();
  assert.match(image.image_url, /^https:\/\/mock\.storage\/product-images\//, 'public URL stored');
  assert.equal(store.counters.embeds, 0, 'upload does not embed by itself');
});

await test('embedding the new product fills exactly-512 vectors via the edge', async () => {
  const store = freshState();
  seedProduct(store, { withEmbedding: false });

  store.rpcResult = [{ product_id: ID.product, similarity: 0.97 }];

  const { generateProductEmbedding, verifyProductSearchable } = await import(
    pathToFileURL(path.join(ROOT, 'src', 'services', 'embedding.service.ts')).href
  );

  const embed = await generateProductEmbedding(ID.product);
  assert.equal(embed.ok, true, `embed ok: ${embed.ok ? '' : embed.error}`);
  assert.equal(embed.data.hasEmbedding, true, 'hasEmbedding reported');
  assert.equal(store.lastEmbedProductId, ID.product, 'edge pointed at the new product');

  const [image] = store.images.values();
  assert.equal(image.embedding.length, 512, 'stored vector is 512-d');

  const verify = await verifyProductSearchable(ID.product);
  assert.equal(verify.ok, true, `verify ok: ${verify.ok ? '' : verify.error}`);
  assert.equal(verify.data.searchable, true, 'product proven searchable');
  assert.deepEqual(
    store.lastRpc.args,
    { query_embedding: VALID_512, match_threshold: -1, match_count: 25 },
    'RPC ran with threshold -1 (machinery probe, not self-similarity)',
  );
});

await test('embedding failure is reported, never faked as searchable', async () => {
  const store = freshState();
  seedProduct(store, { withEmbedding: false });
  store.invokeError = { message: 'edge down', context: undefined };

  const { generateProductEmbedding } = await import(
    pathToFileURL(path.join(ROOT, 'src', 'services', 'embedding.service.ts')).href
  );

  const embed = await generateProductEmbedding(ID.product);
  assert.equal(embed.ok, false, 'failure surfaced');
  assert.match(embed.error, /edge down/, 'the REAL technical cause surfaced (not a generic success)');
  const [image] = store.images.values();
  assert.equal(image.embedding, null, 'no fake vector persisted');
  // The user-facing "not searchable" copy is added by the hook (asserted statically below).
});

// ---------------------------------------------------------------------------
// 3–4. Price-only edit + search
// ---------------------------------------------------------------------------
section('Price-only edit (no regeneration)');

await test('price change updates the row and leaves the vector byte-identical', async () => {
  const store = freshState();
  seedProduct(store);
  const vectorBefore = store.images.get(ID.imageA).embedding;

  const result = await svc.updateProduct(ID.product, {
    name: 'Parle-G',
    description: null,
    category: 'biscuits',
    mrp: 60,
    selling_price: 58,
    stock: 12,
    unit: 'pack',
  });
  assert.equal(result.ok, true, `update ok: ${result.ok ? '' : result.error}`);

  assert.equal(store.rows.get(ID.product).selling_price, 58, 'price updated');
  const vectorAfter = store.images.get(ID.imageA).embedding;
  assert.equal(vectorAfter, vectorBefore, 'SAME array reference — nothing regenerated');
  assert.equal(store.counters.embeds, 0, 'no edge call for a price-only save');
});

// ---------------------------------------------------------------------------
// 5–6. Image change + search
// ---------------------------------------------------------------------------
section('Image change (remove + upload + embed)');

await test('image swap removes the old row+object and embeds the new one', async () => {
  const store = freshState();
  seedProduct(store);

  const removed = await svc.removeProductImage(imageUrlFor(ID.imageA));
  assert.equal(removed.ok, true);
  assert.equal(store.images.has(ID.imageA), false, 'old row removed');
  assert.equal(store.storage.has(`${ID.product}/${ID.imageA}.jpg`), false, 'old object removed');

  const uploaded = await svc.uploadProductImage(ID.product, 'file:///tmp/photo-b.jpg');
  assert.equal(uploaded.ok, true);

  // The pipeline embeds AFTER upload (hook: embedAndVerify → edge).
  const { generateProductEmbedding } = await import(
    pathToFileURL(path.join(ROOT, 'src', 'services', 'embedding.service.ts')).href
  );
  const embed = await generateProductEmbedding(ID.product);
  assert.equal(embed.ok, true, `embed ok: ${embed.ok ? '' : embed.error}`);
  assert.equal(store.counters.embeds, 1, 'new image embedded via the edge');
  const [freshImage] = [...store.images.values()].filter((image) => image.id !== ID.imageA);
  assert.equal(freshImage.embedding.length, 512, 'new vector is 512-d');
});

// ---------------------------------------------------------------------------
// 7–8. Delete + confirm gone
// ---------------------------------------------------------------------------
section('Delete product (row + storage together)');

await test('delete removes the row AND all storage objects', async () => {
  const store = freshState();
  seedProduct(store);
  store.images.set(ID.imageB, {
    id: ID.imageB,
    product_id: ID.product,
    image_url: imageUrlFor(ID.imageB),
    embedding: [...VALID_512],
  });
  store.storage.set(`${ID.product}/${ID.imageB}.jpg`, true);

  const result = await svc.deleteProductWithStorage(ID.product);

  assert.equal(result.ok, true);
  assert.equal(result.data.deletedStorageObjects, 2, 'both objects removed');
  assert.equal(store.rows.has(ID.product), false, 'product row gone');
  assert.equal(store.images.size, 0, 'image rows cascaded');
  assert.equal(store.storage.size, 0, 'storage objects gone');
});

await test('storage hiccup after row delete still succeeds (logged, not failed)', async () => {
  const store = freshState();
  seedProduct(store);
  store.storageRemoveError = { message: 'bucket busy' };

  const result = await svc.deleteProductWithStorage(ID.product);

  assert.equal(result.ok, true, 'user delete still succeeds');
  assert.equal(result.data.deletedStorageObjects, 0);
  assert.equal(store.rows.has(ID.product), false, 'row deletion is the source of truth');
});

// ---------------------------------------------------------------------------
// Full lifecycle walk (1 → 8 in order)
// ---------------------------------------------------------------------------
section('Lifecycle: add → search → price → search → image → search → delete → gone');

await test('the required 8-step walk', async () => {
  const store = freshState();

  // 1. Add product.
  store.rows.set(ID.product, { id: ID.product, name: 'Parle-G', selling_price: 55, mrp: 60 });
  await svc.uploadProductImage(ID.product, 'file:///tmp/photo-a.jpg');
  const { generateProductEmbedding } = await import(
    pathToFileURL(path.join(ROOT, 'src', 'services', 'embedding.service.ts')).href
  );
  store.rpcResult = [{ product_id: ID.product, similarity: 0.97 }];
  await generateProductEmbedding(ID.product);

  // 2. Search product.
  const listed = await svc.listProducts({ search: 'Parle' });
  assert.equal(listed.ok, true);
  assert.equal(listed.data.length, 1, 'step 2: product found');
  assert.equal(listed.data[0].product_images.length, 1, 'image attached');

  // 3. Change price (full payload — the row update validates every field).
  await svc.updateProduct(ID.product, {
    name: 'Parle-G',
    description: null,
    category: 'biscuits',
    mrp: 60,
    selling_price: 58,
    stock: 12,
    unit: 'pack',
  });
  assert.equal(store.counters.embeds, 1, 'still only the add-time embed');

  // 4. Search again.
  const afterPrice = await svc.listProducts({ search: 'Parle' });
  assert.equal(afterPrice.data[0].selling_price, 58, 'step 4: new price served');
  const vectorBefore = store.images.get([...store.images.keys()][0]).embedding;

  // 5. Change image — use the row's ACTUAL stored URL (upload names the
  //    object by uuid, so a URL built from the row id would match nothing).
  const oldImageUrl = [...store.images.values()][0].image_url;
  await svc.removeProductImage(oldImageUrl);
  await svc.uploadProductImage(ID.product, 'file:///tmp/photo-b.jpg');
  await generateProductEmbedding(ID.product);
  assert.equal(store.images.size, 1, 'step 5: old row removed, exactly one survives');
  assert.equal(store.counters.embeds, 2, 'step 5: image change re-embedded');

  // 6. Search again.
  const afterImage = await svc.listProducts({ search: 'Parle' });
  assert.equal(afterImage.data.length, 1, 'step 6: product still listed');
  const [currentImage] = [...store.images.values()];
  assert.equal(currentImage.embedding.length, 512, 'surviving image carries a fresh 512-d vector');
  assert.notEqual(currentImage.embedding, vectorBefore, 'vector was regenerated for the new image');

  // 7. Delete product.
  const deleted = await svc.deleteProductWithStorage(ID.product);
  assert.equal(deleted.ok, true, 'step 7: delete succeeded');

  // 8. Confirm deleted product is no longer returned.
  const afterDelete = await svc.listProducts({ search: 'Parle' });
  assert.equal(afterDelete.data.length, 0, 'step 8: deleted product is gone');
});

// ---------------------------------------------------------------------------
// Layering (static): Screen → Hook → Service → Supabase
// ---------------------------------------------------------------------------
section('Layering: Screen → Hook → Service → Supabase');

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const addScreen = read('src/app/admin/(protected)/products/add.tsx');
const editScreen = read('src/app/admin/(protected)/products/[id]/edit.tsx');
const detailScreen = read('src/app/admin/(protected)/products/[id].tsx');
const hook = read('src/hooks/use-admin-product-form.ts');
const deleteHook = read('src/hooks/use-product-delete.ts');
const productService = read('src/services/product.service.ts');

/**
 * Screens may import PURE validation/constants services; they must never
 * import the Supabase-backed ones (that coupling belongs in hooks).
 */
const SUPABASE_BACKED_SERVICES = [
  'product.service',
  'embedding.service',
  'supabase.service',
  'product-search.service',
  'product-transfer.service',
  'health.service',
];

function hasRuntimeServiceImport(source) {
  return source
    .split('\n')
    .some(
      (line) =>
        line.includes("from '@/services/") &&
        !line.trim().startsWith('import type') &&
        SUPABASE_BACKED_SERVICES.some((name) => line.includes(name)),
    );
}

await test('add/edit screens import the hook, not the services', async () => {
  for (const [name, screen] of [['add', addScreen], ['edit', editScreen]]) {
    assert.match(screen, /useAdminProductForm/, `${name} screen uses the hook`);
    assert.ok(
      !hasRuntimeServiceImport(screen),
      `${name} screen must not import services at runtime`,
    );
  }
});

await test('detail screen deletes through the hook', async () => {
  assert.match(detailScreen, /useProductDelete/);
  assert.ok(!hasRuntimeServiceImport(detailScreen), 'no runtime service import');
});

await test('hook orchestrates the pipeline; service talks to Supabase', async () => {
  assert.match(hook, /generateProductEmbedding/);
  assert.match(hook, /verifyProductSearchable/);
  assert.match(hook, /planImageChanges/);
  assert.ok(!/supabase\b/.test(hook), 'hook must not touch Supabase directly');
  assert.match(productService, /supabase\.from\('products'\)/);
});

await test('hook keeps the honest status strategy', async () => {
  assert.match(hook, /Product saved, but embedding generation failed/);
  assert.match(hook, /not searchable by image/);
  assert.match(hook, /not findable by visual search yet/);
});

await test('image-change vs metadata-only branch exists in the hook', async () => {
  assert.match(hook, /imagesChanged/);
  assert.match(hook, /embedAndVerify/);
});

// ---------------------------------------------------------------------------
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  for (const f of failures) console.error(`FAILED: ${f.name}`);
  process.exit(1);
}
