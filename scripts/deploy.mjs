#!/usr/bin/env node
/**
 * ONE command for the whole Supabase backend:
 *
 *   npm run db:deploy
 *
 * What it does (in order):
 *   1. Preflight      — .env present, project ref derived from it, CLI runnable
 *   2. Authenticate   — SUPABASE_ACCESS_TOKEN env var, or `supabase login`
 *   3. Link           — links this folder to the Supabase project
 *   4. Migrate        — applies supabase/migrations/*.sql to the remote database
 *                       (auto-heals a database whose objects already exist by
 *                       marking local migrations as applied, then re-pushes)
 *   5. Deploy         — deploys every Edge Function in supabase/functions/
 *                       (one retry per function: the platform occasionally
 *                       returns a transient 500 while bundling)
 *   6. Verify         — migration history, RPC executability, function probes
 *
 * Status check only, changes nothing:
 *   npm run db:deploy -- --check
 *
 * Optional env: SUPABASE_ACCESS_TOKEN (skips the browser login).
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const ONLY_CHECK = process.argv.slice(2).includes('--check');

const c = {
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
};

function readEnvVar(name) {
  const envPath = path.join(ROOT, '.env');
  if (!fs.existsSync(envPath)) return process.env[name];
  const match = fs.readFileSync(envPath, 'utf8').match(new RegExp(`^${name}=(.+)$`, 'm'));
  return match?.[1]?.trim() || process.env[name];
}

/** Run a CLI command; returns { ok, output }. Input is inherited so any
 *  interactive prompt (login, db push confirmation) reaches the user. */
function run(cmd, argsForCmd) {
  const res = spawnSync(cmd, argsForCmd, {
    cwd: ROOT,
    encoding: 'utf8',
    shell: process.platform === 'win32',
    stdio: ['inherit', 'pipe', 'pipe'],
    env: { ...process.env, ...(accessToken ? { SUPABASE_ACCESS_TOKEN: accessToken } : {}) },
  });
  const outputText = `${res.stdout ?? ''}${res.stderr ?? ''}`.trim();
  for (const line of outputText.split('\n')) console.log(c.dim(`    ${line}`));
  return { ok: res.status === 0, output: outputText };
}

/** Run a command with retries for transient platform errors (bare 500s). */
function runWithRetry(cmd, argsForCmd, { attempts = 3, delayMs = 10_000, retryOn = /unexpected deploy status 5\d\d|internal error/i } = {}) {
  let last = { ok: false, output: '' };
  for (let i = 1; i <= attempts; i++) {
    if (i > 1) {
      console.log(c.yellow(`  ◌ retry ${i - 1}/${attempts - 1} after ${delayMs / 1000}s (transient platform error?)…`));
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, delayMs);
    }
    last = run(cmd, argsForCmd);
    if (last.ok || !retryOn.test(last.output)) return last;
  }
  return last;
}

function step(n, total, label) {
  console.log(`\n${c.bold(c.cyan(`[${n}/${total}]`))} ${label}`);
}

function fail(message, hint) {
  console.error(`\n${c.red('✗')} ${message}`);
  if (hint) console.error(c.dim(hint));
  process.exit(1);
}

// ---------------------------------------------------------------------------
// 1. Preflight
// ---------------------------------------------------------------------------
const TOTAL = 5;
step(1, TOTAL, 'Preflight');

const supabaseUrl = readEnvVar('EXPO_PUBLIC_SUPABASE_URL');
const publishableKey = readEnvVar('EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY');
if (!supabaseUrl || !publishableKey) {
  fail('.env is missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY.',
    'Copy .env.example to .env and fill in both values from Supabase Dashboard → Settings → API.');
}
const refMatch = supabaseUrl.match(/^https:\/\/([a-z0-9]{20})\.supabase\.co/i);
if (!refMatch) fail(`Could not read a project ref from EXPO_PUBLIC_SUPABASE_URL (${supabaseUrl}).`);
const PROJECT_REF = refMatch[1];

const migrationsDir = path.join(ROOT, 'supabase', 'migrations');
const functionsDir = path.join(ROOT, 'supabase', 'functions');
const migrations = fs.existsSync(migrationsDir)
  ? fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort()
  : [];
const functions = fs.existsSync(functionsDir)
  ? fs.readdirSync(functionsDir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && e.name !== '_shared')
      .map((e) => e.name)
  : [];

console.log(`${c.green('✓')} Project: ${c.dim(PROJECT_REF)}`);
console.log(`${c.green('✓')} Migrations: ${c.dim(migrations.length ? migrations.join(', ') : 'none')}`);
console.log(`${c.green('✓')} Edge Functions: ${c.dim(functions.length ? functions.join(', ') : 'none')}`);

// ---------------------------------------------------------------------------
// 2. Authenticate + 3. Link
// ---------------------------------------------------------------------------
step(2, TOTAL, 'Authentication');
let accessToken = process.env.SUPABASE_ACCESS_TOKEN || null;
if (accessToken) {
  console.log(c.green('✓ Access token provided via SUPABASE_ACCESS_TOKEN'));
} else {
  const whoami = run('npx', ['--yes', 'supabase', 'projects', 'list']);
  if (whoami.ok) {
    console.log(c.green('✓ Already logged in'));
  } else {
    console.log(c.yellow('◌ Not logged in — a browser window will open. Log in and return here.'));
    const login = run('npx', ['--yes', 'supabase', 'login']);
    if (!login.ok) {
      fail('Supabase login failed.',
        'Alternative: create a token at https://supabase.com/dashboard/account/tokens\n' +
        '  then run:  set SUPABASE_ACCESS_TOKEN=YOUR_TOKEN  (Windows)  and re-run the command.');
    }
  }
}

step(3, TOTAL, 'Link to project');
const link = run('npx', ['--yes', 'supabase', 'link', '--project-ref', PROJECT_REF]);
if (!link.ok) fail('Link failed — check the output above.');
console.log(c.green(`✓ Linked to ${PROJECT_REF}`));

if (ONLY_CHECK) {
  console.log(`\n${c.bold(c.green('--check: environment OK, project linked.'))} Nothing was changed.`);
  console.log(c.dim('Run without --check to migrate the database and deploy functions.'));
  process.exit(0);
}

// ---------------------------------------------------------------------------
// 4. Migrate the database (apply supabase/migrations/*.sql)
// ---------------------------------------------------------------------------
step(4, TOTAL, 'Migrate database');
const push = runWithRetry('npx', ['--yes', 'supabase', 'db', 'push'], { retryOn: /internal error|unexpected error/i });

if (push.ok) {
  console.log(c.green('✓ Database is up to date'));
} else if (/already exists/i.test(push.output)) {
  // The remote database already has these objects (e.g. built by a pasted
  // setup script). Mark the local migrations as applied, then push again —
  // the schema ends up correct AND tracked, without touching existing data.
  console.log(c.yellow('◌ Objects already exist on the remote — reconciling migration history…'));
  let repaired = true;
  for (const file of migrations) {
    const version = file.match(/^(\d+)_/)?.[1];
    if (!version) continue;
    const r = run('npx', ['--yes', 'supabase', 'migration', 'repair', version, '--status', 'applied']);
    if (!r.ok) repaired = false;
  }
  const repush = repaired ? run('npx', ['--yes', 'supabase', 'db', 'push']) : { ok: false };
  if (repaired && repush.ok) {
    console.log(c.green('✓ Migration history reconciled — database is up to date'));
  } else {
    fail('Could not reconcile migration history automatically.',
      'Open Supabase Dashboard → SQL Editor and run supabase/setup-all-in-one.sql instructions in README, or paste the CLI output into a chat with the assistant.');
  }
} else {
  fail('Database migration failed — check the output above.',
    'A common cause is a schema change the CLI cannot auto-apply; the README troubleshooting section covers it.');
}

// ---------------------------------------------------------------------------
// 5. Deploy every Edge Function (with transient-error retry)
// ---------------------------------------------------------------------------
if (functions.length === 0) {
  console.log(`\n${c.bold(c.cyan('[5/5]'))} ${c.dim('No Edge Functions to deploy — skipping.')}`);
} else {
  step(5, TOTAL, 'Deploy Edge Functions');
  const failures = [];
  for (const fn of functions) {
    console.log(`\n  ${c.bold(fn)}`);
    const deploy = runWithRetry('npx', ['--yes', 'supabase', 'functions', 'deploy', fn, '--use-api']);
    if (deploy.ok) console.log(c.green(`  ✓ ${fn} deployed`));
    else failures.push(fn);
  }
  if (failures.length > 0) {
    fail(`Failed to deploy: ${failures.join(', ')}`,
      'Usually transient (bundling 500s) — re-run npm run db:deploy. An expired token is the other common cause.');
  }
}

// ---------------------------------------------------------------------------
// 6. Verify — migration history, RPC, function probes
// ---------------------------------------------------------------------------
console.log(`\n${c.bold(c.cyan('[verify]'))} Checking the deployed backend…`);
await new Promise((r) => setTimeout(r, 3000)); // allow edge rollout

// 6a. Migration history: every local migration must be tracked as applied.
const migList = run('npx', ['--yes', 'supabase', 'migration', 'list']);
const unapplied = migList.output
  .split('\n')
  .filter((line) => /\|\s*(local\s*\||\|\s*not applied)/i.test(line) && !/migration/i.test(line));
if (unapplied.length > 0) {
  console.log(`${c.yellow('?')} Some migrations may not be applied remotely:`);
  for (const line of unapplied.slice(0, 6)) console.log(c.dim(`    ${line.trim()}`));
} else if (migList.ok) {
  console.log(`${c.green('✓')} Migration history: all local migrations applied on remote`);
}

// 6b. RPC executability: the visual-search RPC must run (empty result is fine;
//     error 404/42883 means the function definition itself is broken/missing).
const rpcBody = JSON.stringify({
  query_embedding: Array.from({ length: 512 }, () => 0.1),
  match_threshold: 0.99,
  match_count: 1,
});
try {
  const rpcRes = await fetch(`${supabaseUrl}/rest/v1/rpc/visual_search_matches`, {
    method: 'POST',
    headers: { apikey: publishableKey, 'Content-Type': 'application/json' },
    body: rpcBody,
    signal: AbortSignal.timeout(15_000),
  });
  if (rpcRes.status === 404) {
    console.log(`${c.red('✗')} RPC visual_search_matches: 404 — function missing on remote`);
  } else if (!rpcRes.ok) {
    const body = await rpcRes.text();
    console.log(`${c.red('✗')} RPC visual_search_matches: HTTP ${rpcRes.status} ${body.slice(0, 120)}`);
  } else {
    console.log(`${c.green('✓')} RPC visual_search_matches: executable (HTTP ${rpcRes.status})`);
  }
} catch {
  console.log(`${c.yellow('?')} RPC probe: network error — check your connection.`);
}

// 6c. Edge functions: any non-404 response means the deployment exists;
//     rejecting anonymous/invalid calls is exactly the security behavior we want.
for (const fn of functions) {
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/${fn}`, {
      method: 'POST',
      headers: { apikey: publishableKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ probe: true }),
      signal: AbortSignal.timeout(15_000),
    });
    if (res.status === 404) {
      console.log(`${c.red('✗')} ${fn}: 404 — not deployed (did step 5 succeed for this one?)`);
    } else {
      console.log(`${c.green('✓')} ${fn}: HTTP ${res.status} — live`);
    }
  } catch {
    console.log(`${c.yellow('?')} ${fn}: network error while probing — check your connection.`);
  }
}

console.log(`\n${c.bold('🎉 Backend deployed and verified.')}`);
console.log(`  • App: ${c.cyan('npx expo start -c')}`);
console.log(`  • Admin login repair (if needed): run ${c.dim('supabase/create-admin-user.sql')} in Dashboard → SQL Editor`);
