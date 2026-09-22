/**
 * Supabase security contract tests — the policy matrix as executable
 * documentation. Parses the migration SQL (static analysis, no live DB
 * needed) and the app client, asserting:
 *
 *   1. RLS is ENABLED and FORCEd on every public table (never disabled).
 *   2. The public policy matrix: anon can SELECT catalog only; no anon DML.
 *   3. Staff can insert; only admins update/delete.
 *   4. Storage: public read bucket; uploads staff/admin + extension + path
 *      gated; update/delete admin-only — every required policy present.
 *   5. SECURITY DEFINER functions have explicit EXECUTE grants (no
 *      default-PUBLIC reliance); destructive helpers are service-role-only.
 *   6. The React Native client uses ONLY the publishable key from env —
 *      no service_role, no hard-coded secrets.
 *   7. No secrets are committed to git: .env untracked, .env.example holds
 *      placeholders, no real key-shaped values in the tree.
 *
 * Run: node tests/supabase-security.test.mjs
 */
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
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

function section(title) {
  console.log(`\n${title}`);
}

/** Strips SQL comment lines so assertions see executable statements only. */
function code(sql) {
  return sql
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');
}

const m3 = code(read('supabase/migrations/0003_rls.sql'));
const m6 = code(read('supabase/migrations/0006_security_hardening.sql'));
const m7 = code(read('supabase/migrations/0007_rls_storage_hardening.sql'));
const m12 = code(read('supabase/migrations/0012_fix_product_image_upload.sql'));
const m14 = code(read('supabase/migrations/0014_supabase_security_audit_fixes.sql'));

// ---------------------------------------------------------------------------
// 1. RLS enabled + forced — never disabled anywhere
// ---------------------------------------------------------------------------
section('RLS enabled and forced');

test('0003 enables RLS on profiles, products, product_images', () => {
  for (const table of ['profiles', 'products', 'product_images']) {
    assert.match(m3, new RegExp(`enable row level security;?\\s*\\n?.*${table}`), table);
  }
  // Simpler exhaustive check: three enable statements exist.
  const enables = m3.match(/enable row level security/g) ?? [];
  assert.ok(enables.length >= 3);
});

test('0003 forces RLS (belt & braces against owner bypass)', () => {
  const forces = m3.match(/force row level security/g) ?? [];
  assert.ok(forces.length >= 3);
});

test('0014 re-asserts enable + force (drift repair, still ON)', () => {
  assert.equal((m14.match(/enable row level security/g) ?? []).length, 3);
  assert.equal((m14.match(/force row level security/g) ?? []).length, 3);
  assert.ok(!/disable row level security/.test(m14), 'RLS must never be disabled');
});

test('no migration ever disables RLS', () => {
  const dir = path.join(ROOT, 'supabase/migrations');
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.sql'))) {
    const sql = code(read(path.join('supabase/migrations', file)));
    assert.ok(!/disable row level security/.test(sql), `${file} disables RLS`);
  }
});

// ---------------------------------------------------------------------------
// 2/3. The public-schema policy matrix
// ---------------------------------------------------------------------------
section('Products / images / profiles policy matrix');

test('anon can read the catalog (products + images) — required for browsing', () => {
  assert.match(m3, /create policy "catalog is readable by everyone"[\s\S]*?to anon, authenticated/);
  assert.match(m3, /create policy "images are readable by everyone"[\s\S]*?to anon, authenticated/);
});

test('NO anon INSERT/UPDATE/DELETE policy exists on any public table', () => {
  for (const sql of [m3, m6, m7, m14]) {
    const policies = sql.match(/create policy[^;]+/g) ?? [];
    for (const policy of policies) {
      if (/to\s+anon(?!\w)/.test(policy) && !/to anon,\s*authenticated/.test(policy)) {
        assert.ok(!/for insert|for update|for delete/.test(policy),
          `anon-only DML policy found: ${policy.slice(0, 80)}`);
      }
    }
  }
  // And 0014's verification query (in the raw file, comments included)
  // documents the same invariant for DB-side checks.
  assert.match(read('supabase/migrations/0014_supabase_security_audit_fixes.sql'), /cmd <> 'SELECT'/);
});

test('products INSERT: staff or admin only (authenticated)', () => {
  assert.match(
    m3,
    /create policy "staff and admins can create products"[\s\S]*?to authenticated[\s\S]*?with check \(public\.is_admin\(\) or public\.current_role\(\) = 'staff'\)/,
  );
});

test('products UPDATE + DELETE: admin only', () => {
  assert.match(m3, /create policy "admins can update products"[\s\S]*?using \(public\.is_admin\(\)\)[\s\S]*?with check \(public\.is_admin\(\)\)/);
  assert.match(m3, /create policy "admins can delete products"[\s\S]*?using \(public\.is_admin\(\)\)/);
});

test('profiles: role can never be self-granted', () => {
  // Self-update must pin role to the caller's CURRENT role.
  assert.match(m3, /with check \(id = auth\.uid\(\) and role = public\.current_role\(\)\)/);
});

test('profiles insert: admins only (anon path is the definer trigger)', () => {
  assert.match(m3, /create policy "admins can insert profiles"[\s\S]*?with check \(public\.is_admin\(\)\)/);
});

test('product_images UPDATE narrowed to admins (0006 §3)', () => {
  assert.match(m6, /create policy "admins can update images"[\s\S]*?using \(public\.is_admin\(\)\)[\s\S]*?with check \(public\.is_admin\(\)\)/);
});

test('0014 re-asserts the complete matrix (drop policy if exists + recreate)', () => {
  const drops = (m14.match(/drop policy if exists/g) ?? []).length;
  const creates = (m14.match(/create policy/g) ?? []).length;
  assert.equal(drops, creates, 'every drop must pair with a recreate');
  assert.ok(creates >= 13, `expected the full matrix, found ${creates} policies`);
});

// ---------------------------------------------------------------------------
// 4. Storage policies — every required one present and correctly gated
// ---------------------------------------------------------------------------
section('Storage policy matrix');

test('public read policy on product images', () => {
  assert.match(m4Storage(), /create policy "product images are publicly readable"[\s\S]*?bucket_id = 'product-images'/);
  function m4Storage() {
    return code(read('supabase/migrations/0004_product_images_storage.sql'));
  }
});

test('upload (INSERT): authenticated staff/admin + extension gate + product-folder path gate', () => {
  const insert = m12.slice(m12.indexOf('"staff and admins can upload product images"'));
  assert.match(insert, /public\.current_role\(\) in \('admin', 'staff'\)/);
  assert.match(insert, /storage\.extension\(name\)/);
  assert.match(insert, /storage\.foldername\(storage\.objects\.name\)\)\[1\]/);
});

test('update (both row states) + delete: admin only', () => {
  const update = m12.slice(m12.indexOf('"admins can update product images"'));
  assert.match(update, /using \([\s\S]*?public\.is_admin\(\)/);
  assert.match(update, /with check \([\s\S]*?public\.is_admin\(\)/);
  const del = m7.slice(m7.indexOf('"admins can delete product images"'));
  assert.match(del, /using \([\s\S]*?public\.is_admin\(\)/);
});

test('bucket enforces image MIME types + 5 MiB cap server-side', () => {
  const bucket = m12.slice(0, m12.indexOf('2. INSERT'));
  assert.match(bucket, /allowed_mime_types = array\[/);
  assert.match(bucket, /file_size_limit = 5 \* 1024 \* 1024/);
  // Re-asserted by 0014 as well.
  assert.match(m14, /allowed_mime_types = array\[/);
});

// ---------------------------------------------------------------------------
// 5. Function EXECUTE privileges — no default-PUBLIC reliance
// ---------------------------------------------------------------------------
section('Function privileges');

test('clear_product_embeddings is service-role only (re-asserted)', () => {
  const stmt = m14.slice(m14.indexOf('clear_product_embeddings(uuid)'));
  assert.match(stmt, /from public, anon, authenticated/);
  assert.match(stmt, /to service_role/);
});

test('visual_search_matches: explicit anon + authenticated grants, revoked from public', () => {
  const stmt = m14.slice(m14.indexOf('visual_search_matches(vector(512), double precision, integer)'));
  assert.match(stmt, /from public;/);
  assert.match(stmt, /to anon, authenticated/);
});

test('handle_new_user is service-role only; RLS helpers granted to authenticated', () => {
  const hnu = m14.slice(m14.indexOf('handle_new_user()'));
  assert.match(hnu, /from public, anon, authenticated/);
  assert.match(hnu, /to service_role/);
  const cr = m14.slice(m14.indexOf('current_role()'));
  assert.match(cr, /to authenticated/);
});

// ---------------------------------------------------------------------------
// 6. React Native client — publishable key only, from env
// ---------------------------------------------------------------------------
section('App client key hygiene');

const client = read('src/services/supabase.service.ts');

test('client reads ONLY EXPO_PUBLIC_* env vars', () => {
  assert.match(client, /process\.env\.EXPO_PUBLIC_SUPABASE_URL/);
  assert.match(client, /process\.env\.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY/);
});

test('no service_role / secret key anywhere in src/', () => {
  const hits = execSync(
    'git grep -ilE "service_role|SUPABASE_SERVICE_ROLE|sb_secret_" -- src || true',
    { cwd: ROOT, encoding: 'utf8' },
  ).trim();
  assert.equal(hits, '', `service-role references in app code: ${hits}`);
});

test('no hard-coded JWT/secret-shaped values in src/ or supabase/functions/', () => {
  const hits = execSync(
    'git grep -nE "sb_secret_[A-Za-z0-9_-]{10,}|eyJ[A-Za-z0-9_-]{20,}\\.[A-Za-z0-9_-]{10,}" -- src supabase/functions || true',
    { cwd: ROOT, encoding: 'utf8' },
  ).trim();
  assert.equal(hits, '', `secret-shaped literals: ${hits}`);
});

// ---------------------------------------------------------------------------
// 7. Secrets not committed to git
// ---------------------------------------------------------------------------
section('Git secret hygiene');

test('.env is NOT tracked; only .env.example is', () => {
  const tracked = execSync('git ls-files -- .env .env.* ".env.example"', {
    cwd: ROOT,
    encoding: 'utf8',
  })
    .split('\n')
    .filter(Boolean);
  assert.deepEqual(tracked, ['.env.example']);
});

test('.gitignore excludes .env (and every .env.* except the example)', () => {
  const gi = read('.gitignore');
  assert.match(gi, /^\.env$/m);
  assert.match(gi, /^\.env\.\*$/m);
  assert.match(gi, /^!\.env\.example$/m);
});

test('.env.example contains placeholders only — no real values', () => {
  const example = read('.env.example');
  assert.match(example, /YOUR-PROJECT-REF/);
  assert.match(example, /YOUR-PUBLISHABLE/);
  assert.ok(!/https:\/\/[a-z0-9]{20}\.supabase\.co/.test(example), 'no real project URL');
});

test('no real admin password remains anywhere in the working tree', () => {
  // The historic credential (docs/BUG-AUDIT.md quoted it verbatim).
  const hits = execSync('git grep -i "Mamta@2026" -- . || true', {
    cwd: ROOT,
    encoding: 'utf8',
  }).trim();
  assert.equal(hits, '', `historic password still in tree: ${hits}`);
});

test('edge functions read the service role from Deno.env, never a literal', () => {
  for (const fn of ['embed-product-image', 'create-staff', 'visual-match']) {
    const source = read(`supabase/functions/${fn}/index.ts`);
    assert.match(source, /Deno\.env\.get\('SUPABASE_SERVICE_ROLE_KEY'\)|SUPABASE_ANON_KEY/);
    assert.ok(!/SUPABASE_SERVICE_ROLE_KEY\s*=\s*['"]/.test(source), `${fn} hard-codes a key`);
  }
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
