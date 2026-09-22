-- =============================================================================
-- create-admin-user.sql — create/repair the store admin login (idempotent)
-- =============================================================================
-- WHY THIS FILE EXISTS
--   Signing in can fail in two different ways, and they need different fixes:
--
--     A. "Incorrect email or password"      -> the auth user is wrong/missing.
--     B. Sign-in appears to do nothing: the token is issued, then the app
--        bounces straight back to the login screen ("This account isn't set
--        up yet"). That means the AUTH user exists but its public.profiles
--        row is missing, so the app cannot tell which store role it has.
--
--   This script only ever fixes (B) - the store-side profile. It NEVER writes
--   to auth.users: hand-inserted auth rows lack GoTrue's token/identity
--   columns, which is the known cause of the "500 Database error querying
--   schema" login error. Auth accounts are created by GoTrue, not by SQL.
--
-- HOW TO USE
--   1. Create the account if it does not exist yet:
--        Dashboard -> Authentication -> Users -> Add user
--        (tick "Auto Confirm User", set email + password)
--      Already have one? Skip this step.
--   2. Replace the email in the EDIT ME section below with that account's email.
--   3. Paste this WHOLE file into Dashboard -> SQL Editor -> Run.
--   4. Check the "Results" pane: your email must appear with role = admin.
--
--   Safe to re-run: it creates the profile row when missing, repairs the email
--   when drifted, and re-asserts role = 'admin'. Nothing is ever deleted.
--
--   CLI equivalent (no Dashboard needed):
--     npx supabase db query --linked -f supabase/create-admin-user.sql
-- =============================================================================

do $$
declare
  -- EDIT ME - the email of the account that should be the admin
  v_email text := 'owner@mamtastore.in';

  v_normalized_email text := lower(trim(v_email));
  v_user_id uuid;
begin
  if v_normalized_email = '' then
    raise exception 'Set v_email (EDIT ME) before running this script.';
  end if;

  -- The auth account must already exist (step 1 above).
  select u.id
    into v_user_id
  from auth.users u
  where lower(u.email) = v_normalized_email
  order by u.created_at
  limit 1;

  if v_user_id is null then
    raise exception
      'No auth user with email "%". Create it first in Dashboard -> Authentication -> Users (tick "Auto Confirm User"), then run this script again.',
      v_normalized_email;
  end if;

  -- Create the missing profile row, or repair the existing one.
  -- role = 'admin' is the only role that unlocks the admin dashboard;
  -- staff accounts are granted 'staff' from the app (Add Staff) instead.
  insert into public.profiles (id, email, role)
  values (v_user_id, v_normalized_email, 'admin')
  on conflict (id) do update
    set role  = 'admin',
        email = excluded.email;

  raise notice 'Admin profile ready for % (user id %).', v_normalized_email, v_user_id;
end $$;

-- Verification - every admin account in the store. The email you edited
-- above must appear here with role = admin.
select id, email, role, created_at
from public.profiles
where role = 'admin'
order by created_at;
