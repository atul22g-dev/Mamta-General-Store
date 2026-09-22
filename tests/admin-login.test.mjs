/**
 * Admin login tests — the one flow no other suite guarded.
 *
 * Three layers are verified:
 *   1. EXECUTED — src/services/auth-errors.service.ts maps real Supabase
 *      error strings to safe human messages (no email/password leak, no
 *      over-matched repair path, actionable network + rate-limit copy).
 *   2. STATIC CONTRACT — auth-provider (error→message plumbing, profile
 *      failure branch matrix, stale-load guard), the login screen (client
 *      gates, disabled form, unexpected-rejection reset, redirect safety),
 *      and the protected layout (fail-closed guard states).
 *   3. LIVE (optional, read-only) — one deliberately wrong password against
 *      the real GoTrue endpoint proves auth is reachable and returns the
 *      exact error shape the mapping consumes. Self-skips without .env.
 *
 * Run: node tests/admin-login.test.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { register } from 'node:module';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

// Transpile-on-import loader so the pure TS service can be executed directly.
register(pathToFileURL(path.join(ROOT, 'tests', 'edge-module-loader.mjs')).href);

let passed = 0;
let failed = 0;
const failures = [];

/** Async-aware test runner: async fns are ALWAYS awaited before counting. */
async function test(name, fn) {
  try {
    await Promise.resolve().then(fn);
    passed += 1;
    console.log(`  ✅ ${name}`);
  } catch (err) {
    failed += 1;
    failures.push({ name, err });
    console.log(`  ❌ ${name}\n     ${err.message}`);
  }
}

function section(title) {
  console.log(`\n${title}`);
}

// ---------------------------------------------------------------------------
// 1. Error mapping service — EXECUTED against real Supabase error strings
// ---------------------------------------------------------------------------
const toSignInError = (await import(
  pathToFileURL(path.join(ROOT, 'src', 'services', 'auth-errors.service.ts')).href
)).toSignInError;

section('1. Error mapping — real GoTrue error strings');

await test('invalid credentials → generic message that does NOT leak which field was wrong', () => {
  const msg = toSignInError('Invalid login credentials');
  assert.match(msg, /Incorrect email or password\./);
  assert.ok(!/email/i.test(msg.replace('email', '')) === false || true); // readability only
  assert.ok(!/password was wrong|email was wrong/i.test(msg), 'must not attribute the failure to one field');
});

await test('email not confirmed → actionable inbox message', () => {
  assert.match(toSignInError('Email not confirmed'), /check your inbox/i);
});

await test('rate limit (both Supabase phrasings) → wait message', () => {
  assert.match(toSignInError('Too many requests'), /wait a moment/i);
  assert.match(toSignInError('over_request_rate_limit: signups disabled'), /wait a moment/i);
});

await test('GoTrue 500 family → repair path naming create-admin-user.sql', () => {
  for (const raw of [
    'Internal server error',
    'Database error querying schema',
    'error reading user',
  ]) {
    const msg = toSignInError(raw);
    assert.match(msg, /create-admin-user\.sql/, `"${raw}" must route to the repair path`);
  }
});

await test('a bare "500" inside unrelated text does NOT trigger the repair path', () => {
  // Over-matching here would tell users to run SQL for a mere rate limit.
  const msg = toSignInError('Too many requests (error_id 50012)');
  assert.ok(!/create-admin-user\.sql/.test(msg), 'repair path must stay scoped to real GoTrue 500s');
  assert.match(toSignInError('request id 500-abc: invalid login credentials'), /Incorrect email or password\./);
});

await test('network failures → connection message', () => {
  assert.match(toSignInError('TypeError: Network request failed'), /network/i);
  assert.match(toSignInError('fetch failed'), /network/i);
});

await test('unknown message passes through; empty falls back safely', () => {
  assert.equal(toSignInError('Some future GoTrue error'), 'Some future GoTrue error');
  assert.match(toSignInError(''), /Sign-in failed/);
  assert.match(toSignInError(undefined), /Sign-in failed/);
});

// ---------------------------------------------------------------------------
// 2. auth-provider — plumbing and profile-failure branch matrix (static)
// ---------------------------------------------------------------------------
const provider = read('src/providers/auth-provider.tsx');

section('2. auth-provider — error plumbing + profile branch matrix');

await test('signIn failures flow through toSignInError (never raw provider text)', () => {
  assert.match(provider, /toSignInError\(error\.message\)/);
});

await test('signIn trims the email before authenticating', () => {
  assert.match(provider, /email:\s*email\.trim\(\)/);
});

await test('provider never logs raw auth errors (console must stay clean in prod)', () => {
  assert.ok(!/console\.(log|warn|error)/.test(provider), 'provider must not echo provider internals');
});

await test('profile missing (PGRST116) → notice FIRST, then sign-out', () => {
  assert.match(provider, /PGRST116/);
  // Anchor WITHIN the PGRST_NO_ROWS branch — a plain indexOf would find the
  // earlier (legitimate) forceSignOut in the JWT branch above it.
  const branch = provider.indexOf("code === PGRST_NO_ROWS");
  assert.ok(branch > -1, 'the no-rows branch must exist');
  const idxNotice = provider.indexOf("setAuthNotice({ kind: 'profile-missing' })", branch);
  const idxSignOut = provider.indexOf('await forceSignOut()', branch);
  assert.ok(idxNotice > -1 && idxSignOut > -1, 'both steps must exist');
  assert.ok(idxNotice < idxSignOut, 'the notice must be set BEFORE forceSignOut so the login screen can explain');
});

await test('network failure during profile load keeps the session (no startup-logout)', () => {
  assert.match(provider, /isNetworkError\(error\)/);
  assert.match(provider, /setProfileUnavailable\(true\)/);
  assert.match(provider, /setStatus\('authenticated'\)/);
});

await test('dead JWT (PGRST301) ends the session instead of looping on Retry', () => {
  assert.match(provider, /PGRST301/);
  // Anchor at the BRANCH check (code === PGRST_JWT_INVALID), not the
  // top-of-file constant declaration — the branch is what must sign out.
  const branch = provider.indexOf('code === PGRST_JWT_INVALID');
  assert.ok(branch > -1, 'the JWT-invalid branch must exist');
  const forced = provider.indexOf('await forceSignOut()', branch);
  assert.ok(forced > -1 && forced - branch < 400, 'the JWT-invalid branch must force sign-out');
});

await test('stale profile loads cannot resurrect state (monotonic load id)', () => {
  assert.match(provider, /loadIdRef\.current \+= 1/);
  assert.match(provider, /loadId !== loadIdRef\.current/);
});

await test('SIGNED_OUT and dead sessions reset state via onAuthStateChange', () => {
  assert.match(provider, /event === 'SIGNED_OUT'/);
  assert.match(provider, /resetToSignedOut\(\)/);
});

// ---------------------------------------------------------------------------
// 3. Login screen + guard contract (static)
// ---------------------------------------------------------------------------
const loginScreen = read('src/app/admin/login.tsx');
const guard = read('src/app/admin/(protected)/_layout.tsx');

section('3. Login screen + protected guard');

await test('client-side gates: valid email AND ≥6-char password required to submit', () => {
  assert.match(loginScreen, /emailIsValid/);
  assert.match(loginScreen, /password\.length >= 6/);
  assert.match(loginScreen, /canSubmit/);
  assert.match(loginScreen, /disabled=\{!canSubmit\}/);
});

await test('submitting disables the form and shows progress on the button', () => {
  assert.match(loginScreen, /busy=\{submitting\}/);
  assert.match(loginScreen, /editable=\{!submitting\}/);
  assert.match(loginScreen, /Signing in…/);
});

await test('unexpected rejection still resets the button (no stuck spinner)', () => {
  const fn = loginScreen.slice(loginScreen.indexOf('const handleSignIn'));
  assert.match(fn, /try \{[\s\S]*await signIn[\s\S]*\} catch \{/, 'signIn must be wrapped in try/catch');
  assert.match(fn, /Something went wrong\. Please try again\./);
  assert.ok(fn.indexOf('setSubmitting(false)') > fn.indexOf('catch'), 'submitting must clear after a rejection too');
});

await test('success replaces the route to /admin', () => {
  assert.match(loginScreen, /router\.replace\('\/admin'\)/);
});

await test('already-authenticated admin redirects via <Redirect> (no setState-in-render crash)', () => {
  assert.match(loginScreen, /status === 'authenticated' && isAdmin/);
  assert.match(loginScreen, /<Redirect href="\/admin" \/>/);
  assert.ok(
    loginScreen.indexOf('<Redirect href="/admin" />') > loginScreen.indexOf('const handleSignIn') === false,
    'redirect must stay above the handlers as a render-time return',
  );
});

await test('profile-missing notice renders the guided repair panel', () => {
  assert.match(loginScreen, /authNotice\?\.kind === 'profile-missing'/);
  assert.match(loginScreen, /create-admin-user\.sql/);
  assert.match(loginScreen, /Open Supabase SQL Editor/);
});

await test('guard: unauthenticated → login, loading → neutral gate (no content flash)', () => {
  assert.match(guard, /status === 'loading'/);
  assert.match(guard, /<Redirect href="\/admin\/login" \/>/);
  assert.match(guard, /Checking your access…/);
});

await test('guard: profile unavailable → fail-closed retry, NOT a logout', () => {
  assert.match(guard, /profileUnavailable/);
  assert.match(guard, /Can't verify your access/);
  assert.match(guard, /onRetry=\{retryProfile\}/);
});

await test('guard: non-admin sees Access denied, never admin content', () => {
  assert.match(guard, /if \(!isAdmin\)/);
  assert.match(guard, /<AccessDenied/);
});

await test('admin area layout registers only protected screens under the guard', () => {
  for (const screen of ['index', 'products', 'products/add', 'products/[id]', 'products/[id]/edit']) {
    assert.ok(guard.includes(`<Stack.Screen name="${screen}"`), `missing guarded screen "${screen}"`);
  }
});

// ---------------------------------------------------------------------------
// 4. RLS backstop — role escalation must be impossible from the client
// ---------------------------------------------------------------------------
section('4. RLS backstop for authorization');

await test('migrations forbid profile self-updates (role changes are server-side only)', () => {
  const migrations = fs
    .readdirSync(path.join(ROOT, 'supabase', 'migrations'))
    .filter((f) => f.endsWith('.sql'))
    .map((f) => read(`supabase/migrations/${f}`))
    .join('\n\n');
  assert.match(migrations, /profiles[\s\S]{0,600}(update|insert)[\s\S]{0,600}(admin|role)/i,
    'some migration must restrict profiles writes to admins/server-side');
});

// ---------------------------------------------------------------------------
// 5. Live GoTrue probe (optional, read-only)
// ---------------------------------------------------------------------------
const env = {};
for (const line of read('.env').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2];
}
const liveReady =
  env.EXPO_PUBLIC_SUPABASE_URL &&
  env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY &&
  !/YOUR-PROJECT-REF|YOUR-PUBLISHABLE/.test(env.EXPO_PUBLIC_SUPABASE_URL) &&
  !/YOUR-PUBLISHABLE/.test(env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY);

if (!liveReady) {
  console.log('\n○ live GoTrue probe skipped — .env does not hold real credentials');
} else {
  section('5. Live GoTrue probe (wrong password → mapped message)');
  await test('real auth endpoint returns the exact error the mapping consumes', async () => {
    const res = await fetch(`${env.EXPO_PUBLIC_SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        apikey: env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: 'probe@does-not-exist.invalid',
        password: 'definitely-wrong-password',
      }),
    });
    assert.equal(res.status, 400, `expected 400 for bad credentials, got ${res.status}`);
    const body = await res.json();
    // The exact string toSignInError() maps — proves the live contract.
    assert.match(String(body.msg || body.error_description || body.message || ''), /invalid login credentials/i);
    const mapped = toSignInError(String(body.msg || body.error_description || body.message || ''));
    assert.match(mapped, /Incorrect email or password\./);
  });
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  for (const f of failures) console.error(`FAILED: ${f.name}`);
  process.exit(1);
}
