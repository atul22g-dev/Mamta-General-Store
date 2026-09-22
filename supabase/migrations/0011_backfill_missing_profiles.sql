-- =============================================================================
-- 0011 — Backfill missing profile rows + re-assert the signup trigger
-- =============================================================================
-- Symptom this fixes
--   An account can sign in (GoTrue issues a session) yet the app immediately
--   signs it back out, because public.profiles has no row for that user id.
--   The app cannot map the session to a store role, so it refuses to render
--   the admin area. Nothing in the UI said why — this is the silent
--   "sign-in does nothing" bounce.
--
-- Cause
--   0001 creates profiles through the `on_auth_user_created` trigger, which
--   only fires on INSERT. Any auth user created BEFORE that trigger existed
--   (or on a database where the trigger was later dropped) has no profile
--   row, and no automatic path ever recreates it.
--
-- What this migration does — additive and idempotent:
--   1. Re-asserts the signup trigger so future users always get a profile.
--   2. Inserts a profile row for every existing auth user that lacks one.
--
-- Role safety
--   Backfilled rows get role = NULL, matching 0006 (new accounts have NO
--   privileges until an admin grants a role). This migration NEVER grants
--   'admin'/'staff' — promotion is explicit and auditable, via
--   supabase/create-admin-user.sql for the owner or "Add Staff" in the app.
--
-- RLS note
--   Migrations run as the `postgres` superuser, which bypasses RLS
--   (`force row level security` does not apply to superusers), so these
--   writes do not need — and must not get — a client-side insert policy.
-- =============================================================================

-- ----------------------------------------------------------------------------
-- 1. Re-assert the auto-profile trigger (idempotent)
-- ----------------------------------------------------------------------------
drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ----------------------------------------------------------------------------
-- 2. Backfill a profile row for every auth user missing one
-- ----------------------------------------------------------------------------
insert into public.profiles (id, email, role)
select
  u.id,
  coalesce(u.email, ''),
  null
from auth.users u
where not exists (
  select 1 from public.profiles p where p.id = u.id
);

comment on table public.profiles is
  'Store user profiles; 1:1 with auth.users. role = NULL means "no privileges yet" (granted explicitly by an admin). Backfilled by 0011 for accounts created before the signup trigger existed.';
