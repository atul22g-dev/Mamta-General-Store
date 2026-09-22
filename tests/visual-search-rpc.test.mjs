/**
 * visual_search_matches RPC contract tests — drift guard for the
 * database/vector-search layer (migration 0013).
 *
 * Static checks (always run):
 *   1. Migration 0013 defines the RPC with the full result surface:
 *      product_id · image_id · product_name · selling_price · mrp ·
 *      image_url · similarity — with the 0008/0009 hardening intact.
 *   2. All three standalone helper SQL scripts stay in sync with 0013.
 *   3. Embedding dimension parity: model throws ≠512 → edges validate 512 →
 *      DB column is vector(512). No truncation/padding path exists.
 *
 * Logic checks (always run, pure functions — same math as the RPC):
 *   4. similarity = 1 − cosine_distance ∈ [−1, 1]; result mapping carries
 *      product_id, name, selling_price, mrp, image_url; threshold/order/clamp.
 *
 * Live check (optional, read-only):
 *   5. If .env holds real project URL + publishable key, POST a synthetic
 *      512-d vector to the deployed RPC via PostgREST. HTTP 200 proves the
 *      deployed function exists with matching params + grants. A 511-d
 *      vector must be rejected (proves dimension enforcement is loud).
 *      Skipped (never fails) when .env is absent or network is down.
 *
 * Run: node tests/visual-search-rpc.test.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

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

// ---------------------------------------------------------------------------
// 1. Migration 0013 — canonical RPC definition
// ---------------------------------------------------------------------------
const m13 = read('supabase/migrations/0013_visual_search_rpc_product_data.sql');

console.log('\nMigration 0013 — RPC result surface & hardening');

test('0013 exists and defines visual_search_matches', () => {
  assert.match(m13, /create or replace function public\.visual_search_matches\(/);
});

test('returns product_id, image_id, product_name, selling_price, mrp, image_url, similarity', () => {
  const returnsBlock = m13.slice(m13.indexOf('returns table'), m13.indexOf('language sql'));
  for (const col of [
    'product_id uuid',
    'image_id uuid',
    'product_name text',
    'selling_price numeric',
    'mrp numeric',
    'image_url text',
    'similarity double precision',
  ]) {
    assert.ok(returnsBlock.includes(col), `missing column "${col}" in returns table`);
  }
});

test('select list joins products for name + live prices and product_images for image_url', () => {
  assert.match(m13, /p\.name as product_name/);
  assert.match(m13, /p\.selling_price as selling_price/);
  assert.match(m13, /p\.mrp as mrp/);
  assert.match(m13, /pi\.image_url as image_url/);
  assert.match(m13, /inner join public\.products p on p\.id = pi\.product_id/);
});

test('prices are read from products — never computed or supplied', () => {
  assert.ok(!/coalesce\(p\.selling_price|0\.00 as selling_price|generated/.test(m13),
    'prices must come straight from the products table');
});

test('similarity is cosine: 1 - (embedding <=> query)', () => {
  assert.match(m13, /1 - \(pi\.embedding <=> query_embedding\) as similarity/);
});

test('threshold filter + cosine ordering preserved', () => {
  assert.match(m13, /and 1 - \(pi\.embedding <=> query_embedding\) >= match_threshold/);
  assert.match(m13, /order by pi\.embedding <=> query_embedding asc/);
});

test('NULL-embedding guard preserved (0008)', () => {
  assert.match(m13, /where pi\.embedding is not null/);
});

test('is_active filter preserved (0009)', () => {
  assert.match(m13, /and p\.is_active = true/);
});

test('match_count clamped to [1, 25] (0008)', () => {
  assert.match(m13, /limit least\(greatest\(coalesce\(match_count, 5\), 1\), 25\)/);
});

test('SECURITY DEFINER + safe search_path (0008)', () => {
  // Strip comment lines so explanatory text (which MENTIONS the forbidden
  // pg_catalog pinning) cannot satisfy or trip code assertions.
  const code = m13
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');
  assert.match(code, /security definer/);
  assert.match(code, /set search_path = public, extensions, pg_catalog/);
  assert.ok(!code.includes('operator(pg_catalog.<=>)'),
    'cosine operator must NOT be pinned to pg_catalog (42883 regression)');
});

test('execute granted to anon + authenticated, revoked from public', () => {
  assert.match(m13, /revoke all on function public\.visual_search_matches/);
  assert.match(m13, /grant execute on function public\.visual_search_matches[\s\S]*?to anon, authenticated/);
});

test('RPC parameter is vector(512) — exact dimension, fixed-width', () => {
  assert.match(m13, /query_embedding vector\(512\)/);
  assert.match(m13, /visual_search_matches\(vector\(512\), double precision, integer\)/);
});

test('pgvector re-asserted defensively', () => {
  assert.match(m13, /create extension if not exists vector/);
});

// ---------------------------------------------------------------------------
// 2. Helper SQL scripts stay in sync with 0013
// ---------------------------------------------------------------------------
console.log('\nHelper scripts in sync with 0013');

const returnColumns = ['product_name text', 'selling_price numeric', 'mrp numeric', 'image_url text'];
const selectAliases = [
  'p.name as product_name',
  'p.selling_price as selling_price',
  'p.mrp as mrp',
  'pi.image_url as image_url',
];

for (const script of [
  'supabase/setup-all-in-one.sql',
  'supabase/REPAIR_FIND_PRODUCT.sql',
  'supabase/fix-visual-search-schema.sql',
]) {
  const sql = read(script);
  test(`${script} — returns the 0013 columns`, () => {
    for (const col of returnColumns) assert.ok(sql.includes(col), `missing "${col}"`);
  });
  test(`${script} — selects identity + price + image`, () => {
    for (const alias of selectAliases) assert.ok(sql.includes(alias), `missing "${alias}"`);
  });
  test(`${script} — still vector(512) + hardening`, () => {
    assert.match(sql, /query_embedding vector\(512\)/);
    assert.match(sql, /pi\.embedding is not null/);
    assert.match(sql, /p\.is_active = true/);
  });
}

// ---------------------------------------------------------------------------
// 3. Schema + embedding dimension parity (the critical requirement)
// ---------------------------------------------------------------------------
console.log('\nEmbedding dimension parity — model 512 == DB vector(512)');

test('products.name / selling_price / mrp are NOT NULL in 0002', () => {
  const m2 = read('supabase/migrations/0002_products.sql');
  assert.match(m2, /name\s+text not null/);
  assert.match(m2, /selling_price\s+numeric\(10, 2\) not null/);
  assert.match(m2, /mrp\s+numeric\(10, 2\) not null/);
});

test('product_images.image_url exists, NOT NULL (0002)', () => {
  const m2 = read('supabase/migrations/0002_products.sql');
  assert.match(m2, /image_url\s+text not null/);
});

test('embedding column is vector(512) with HNSW cosine index (0005)', () => {
  const m5 = read('supabase/migrations/0005_visual_search.sql');
  assert.match(m5, /embedding\s+vector\(512\)/);
  assert.match(m5, /hnsw/i);
  assert.match(m5, /vector_cosine_ops/);
});

test('engine descriptor is exactly 512 and THROWS on any other width (no truncate/pad)', () => {
  const engine = read('supabase/functions/_shared/embedding-engine.ts');
  assert.match(engine, /const EMBEDDING_DIMS = 512/);
  assert.match(engine, /if \(features\.length !== EMBEDDING_DIMS\)/);
  assert.match(engine, /Descriptor produced \$\{features\.length\} dimensions; expected/);
  assert.ok(!/\.slice\(0, EMBEDDING|\.concat\(new Array|padEnd|truncate/i.test(engine),
    'no truncation or padding path may exist in the embedding engine');
});

test('enforcement chain: engine throws ≠512 for ALL produced vectors (both functions)', () => {
  // embed-product-image does not call validateEmbeddingVector directly — its
  // guarantee comes from the engine, which THROWS unless the descriptor is
  // exactly 512 (computeImageDescriptor). visual-match additionally validates
  // the incoming search vector before the RPC. The DB vector(512) type is the
  // final backstop (proven live below: a 511-d call is rejected).
  const shared = read('supabase/functions/_shared/embedding.ts');
  assert.match(shared, /EMBEDDING_DIMENSIONS = 512/);
  const engine = read('supabase/functions/_shared/embedding-engine.ts');
  assert.match(engine, /if \(features\.length !== EMBEDDING_DIMS\)/);
  const visualMatch = read('supabase/functions/visual-match/index.ts');
  assert.match(visualMatch, /validateEmbeddingVector/);
});

test('client-side type contract matches the 0013 RPC shape', () => {
  const types = read('src/types/database.ts');
  const rpc = types.slice(types.indexOf('visual_search_matches'), types.indexOf('Enums:'));
  for (const field of [
    'product_id: string',
    'image_id: string',
    'product_name: string',
    'selling_price: number',
    'mrp: number',
    'image_url: string',
    'similarity: number',
  ]) {
    assert.ok(rpc.includes(field), `missing "${field}" in visual_search_matches Returns`);
  }
});

// ---------------------------------------------------------------------------
// 4. Pure-logic verification of the RPC's math and row mapping
// ---------------------------------------------------------------------------
console.log('\nSimilarity math + result mapping (same formulas as the RPC)');

/** Cosine similarity — identical semantics to pgvector's `1 - (a <=> b)`. */
function cosineSimilarity(a, b) {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/** The RPC's row builder: SQL row + query vector → mapped result (or null if below threshold). */
function mapRow(row, query, threshold) {
  const similarity = 1 - row.cosineDistance; // SQL: 1 - (embedding <=> query)
  if (!(similarity >= threshold)) return null; // SQL NULL-comparison semantics
  return {
    product_id: row.productId,
    image_id: row.imageId,
    product_name: row.name,
    selling_price: row.sellingPrice,
    mrp: row.mrp,
    image_url: row.imageUrl,
    similarity,
  };
}

const q = Array.from({ length: 512 }, (_, i) => (i % 7 === 0 ? 0.5 : i % 3 === 0 ? -0.25 : 0.125));

test('identical vector → similarity ≈ 1 (perfect match)', () => {
  const s = cosineSimilarity(q, q);
  assert.ok(Math.abs(s - 1) < 1e-12, `expected ~1, got ${s}`);
  const mapped = mapRow({ cosineDistance: 1 - s, productId: 'p1', imageId: 'i1', name: 'N', sellingPrice: 10, mrp: 12, imageUrl: 'u' }, q, 0.82);
  assert.equal(mapped.similarity, s);
});

test('orthogonal vector → similarity ≈ 0, filtered at 0.82', () => {
  const other = q.map((_, i) => (i % 2 === 0 ? 1 : -1));
  const s = cosineSimilarity(q, other);
  assert.ok(Math.abs(s) < 1e-9, `expected ~0, got ${s}`);
  assert.equal(mapRow({ cosineDistance: 1 - s }, q, 0.82), null);
});

test('similarity always within [-1, 1] across random vectors', () => {
  let seed = 42;
  const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) - 0.5;
  for (let t = 0; t < 50; t++) {
    const a = Array.from({ length: 512 }, () => rand());
    const b = Array.from({ length: 512 }, () => rand());
    const s = cosineSimilarity(a, b);
    assert.ok(s >= -1 - 1e-9 && s <= 1 + 1e-9, `similarity out of range: ${s}`);
  }
});

test('row mapping carries product_id, name, price, mrp, image_url and score together', () => {
  const mapped = mapRow({
    cosineDistance: 0.1,
    productId: 'uuid-p',
    imageId: 'uuid-i',
    name: 'Spray Bottle Head with Pipe',
    sellingPrice: 45,
    mrp: 60,
    imageUrl: 'product-images/uuid/main.jpg',
  }, q, 0.82);
  assert.deepEqual(mapped, {
    product_id: 'uuid-p',
    image_id: 'uuid-i',
    product_name: 'Spray Bottle Head with Pipe',
    selling_price: 45,
    mrp: 60,
    image_url: 'product-images/uuid/main.jpg',
    similarity: 0.9,
  });
});

test('threshold boundary: exactly-at-threshold row passes (>= semantics)', () => {
  // 1 - 0.18 in IEEE-754 is 0.8200000000000001 — still >= 0.82, which is
  // exactly the behavior Postgres double precision exhibits too.
  const at = mapRow({ cosineDistance: 0.18 }, q, 0.82);
  assert.ok(at !== null, 'row exactly at threshold must pass');
  assert.ok(Math.abs(at.similarity - 0.82) < 1e-9, `expected ~0.82, got ${at.similarity}`);
  assert.equal(mapRow({ cosineDistance: 0.180001 }, q, 0.82), null, 'row below threshold must be filtered');
});

test('candidate ordering: best similarity first', () => {
  const rows = [
    { product_id: 'mid', similarity: 0.85 },
    { product_id: 'best', similarity: 0.95 },
    { product_id: 'worst', similarity: 0.83 },
  ];
  const ordered = [...rows].sort((a, b) => b.similarity - a.similarity);
  assert.deepEqual(ordered.map((r) => r.product_id), ['best', 'mid', 'worst']);
});

test('match_count clamp: least(greatest(n, 1), 25)', () => {
  const clamp = (n) => Math.min(Math.max(n ?? 5, 1), 25);
  assert.equal(clamp(undefined), 5);
  assert.equal(clamp(0), 1);
  assert.equal(clamp(-3), 1);
  assert.equal(clamp(100), 25);
});

// ---------------------------------------------------------------------------
// 5. Optional live probe — deployed RPC, read-only
// ---------------------------------------------------------------------------
console.log('\nLive RPC probe (optional)');

function loadEnv() {
  const envPath = path.join(ROOT, '.env');
  if (!fs.existsSync(envPath)) return {};
  const out = {};
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}

async function probeRpc(baseUrl, apiKey, vector, matchCount) {
  const res = await fetch(`${baseUrl}/rest/v1/rpc/visual_search_matches`, {
    method: 'POST',
    headers: {
      apikey: apiKey,
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query_embedding: vector, match_threshold: 0.01, match_count: matchCount }),
  });
  return { status: res.status, body: await res.text() };
}

const env = loadEnv();
const baseUrl = env.EXPO_PUBLIC_SUPABASE_URL;
const apiKey = env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const liveReady =
  baseUrl && apiKey &&
  !/YOUR-PROJECT-REF|YOUR-PUBLISHABLE/.test(baseUrl) &&
  !/YOUR-PUBLISHABLE/.test(apiKey);

if (!liveReady) {
  console.log('  ○ skipped — .env does not hold a real project URL/key (static checks already passed)');
} else {
  try {
    // Deterministic pseudo-random unit-ish vector (LCG seed 20260922).
    let seed = 20260922;
    const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) - 0.5;
    const vec = Array.from({ length: 512 }, () => rand());

    const { status, body } = await probeRpc(baseUrl, apiKey, vec, 1);
    test(`deployed RPC accepts a valid 512-d vector (HTTP ${status})`, () => {
      assert.equal(status, 200, `expected 200, got ${status}: ${body.slice(0, 200)}`);
    });
    if (status === 200) {
      test('deployed RPC response rows carry the 0013 fields', () => {
        const rows = JSON.parse(body);
        assert.ok(Array.isArray(rows), 'expected a JSON array');
        for (const row of rows) {
          for (const key of ['product_id', 'image_id', 'product_name', 'selling_price', 'mrp', 'image_url', 'similarity']) {
            assert.ok(key in row, `deployed RPC row missing "${key}" — deploy migration 0013 (npm run db:deploy)`);
          }
        }
        console.log(`    ${rows.length} row(s) returned${rows.length ? ` — e.g. "${rows[0].product_name}" @ ${rows[0].selling_price}` : '(no stored embeddings match yet — still proves params/grants)'}`);
      });
    }

    // Dimension enforcement must be loud: 511 values must be rejected.
    const bad = await probeRpc(baseUrl, apiKey, vec.slice(0, 511), 1);
    test(`deployed RPC rejects a 511-d vector (HTTP ${bad.status})`, () => {
      assert.ok(bad.status >= 400, `expected 4xx for wrong dimension, got ${bad.status}: ${bad.body.slice(0, 200)}`);
    });
  } catch (err) {
    console.log(`  ○ live probe skipped — network unreachable (${err.message.split('\n')[0]})`);
  }
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  for (const f of failures) console.error(`FAILED: ${f.name}`);
  process.exit(1);
}
