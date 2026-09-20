-- ============================================================================
-- CREATE OR REPAIR THE ADMIN LOGIN — ONE PASTE (Mamta General Store)
-- ============================================================================
-- Works on an EXISTING database (this is the file the app's login screen
-- points you to). Idempotent — safe to run any number of times.
--
-- For the given email it guarantees EVERYTHING password sign-in requires:
--   ✔ one single auth.users row (duplicates are collapsed — they alone
--     crash GoTrue's user lookup)
--   ✔ real bcrypt password hash  (this file (re)sets it — see EDIT ME)
--   ✔ confirmed email
--   ✔ EVERY nullable text column non-NULL — on BOTH the create and repair
--     paths. NULLs anywhere crash sign-in with 500 "Database error
--     querying schema" (server logs proved: confirmation_token, then
--     email_change, …). Real signups have '' in all of them, so this
--     matches a genuine GoTrue-created row exactly.
--   ✔ auth.identities row        (required by password sign-in)
--   ✔ public.profiles row with role = admin
--
-- SAFETY (per the audit rules):
--   • No duplicate identities / profiles (all writes are guarded upserts).
--   • Only the named account is touched. No other users, no schema changes.
--   • The plaintext password exists ONLY in the EDIT ME line below and is
--     immediately bcrypt-hashed; it is never stored or logged.
--   • No service-role credentials involved — run in the SQL Editor as the
--     postgres role. App users can never run this (RLS blocks auth writes).
-- ============================================================================

create extension if not exists pgcrypto;

do $$
declare
  v_email    text := lower(trim('owner@mamtastore.in'));  -- ▼ EDIT ME: admin email
  v_password text := 'Mamta@2026';                        -- ▼ EDIT ME: the password to sign in with
  u record;
  v_col record;
begin
  -- Exactly one user row: keep the newest, drop extras. Lookup is
  -- case- and whitespace-insensitive — a variant like 'Owner@MamtaStore.in'
  -- or a stray space would otherwise send the script down the CREATE path
  -- while the broken row stays behind (GoTrue finds rows case-insensitively).
  select * into u from auth.users
   where lower(trim(email)) = v_email
   order by created_at desc limit 1;

  if u.id is null then
    -- ---------------------------------------------------------------
    -- CREATE — fresh auth user with a real hash and confirmed email.
    -- auth.users.id has NO default in this project, so it must be
    -- generated explicitly (gen_random_uuid()); omitting it violates
    -- the NOT NULL constraint ("null value in column id").
    -- ---------------------------------------------------------------
    insert into auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, confirmation_token, recovery_token,
      email_change_token_new, email_change_token_current,
      created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data
    ) values (
      gen_random_uuid(),
      '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      v_email, crypt(v_password, gen_salt('bf', 10)),
      now(), '', '', '', '',
      now(), now(),
      '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb
    ) returning * into u;
    raise notice 'Created auth user %', v_email;
  else
    delete from auth.users where lower(trim(email)) = v_email and id <> u.id;

    -- ---------------------------------------------------------------
    -- REPAIR the existing row (this is the path a broken login takes).
    -- ---------------------------------------------------------------

    -- 1. Set the password to the EDIT ME value (running this file IS the
    --    intent to set this password).
    update auth.users
       set encrypted_password = crypt(v_password, gen_salt('bf', 10)),
           updated_at         = now()
     where id = u.id;

    -- 2. Confirm the email (else sign-in stops at "email not confirmed").
    update auth.users
       set email_confirmed_at = coalesce(email_confirmed_at, now())
     where id = u.id;

    raise notice 'Repaired existing auth user %', v_email;
  end if;

  -- 3★ BOTH paths: coalesce EVERY nullable text column to '' — dynamic
  --    over the catalog, so no column can ever be missed. A fresh CREATE
  --    also leaves columns like email_change/phone NULL (they are not in
  --    the insert list), and GoTrue crashes scanning those identically.
  --    Real GoTrue signups have '' in all of them — this matches that.
  for v_col in
    select column_name from information_schema.columns
    where table_schema = 'auth' and table_name = 'users'
      and data_type = 'text' and is_nullable = 'YES'
  loop
    execute format(
      'update auth.users set %I = coalesce(%I, '''') where id = %L',
      v_col.column_name, v_col.column_name, u.id);
  end loop;
  raise notice 'All nullable text columns ensured non-NULL for %', v_email;

  -- 4. The auth.identities row password sign-in REQUIRES (guarded — never
  --    duplicated).
  insert into auth.identities (
    user_id, provider_id, identity_data, provider,
    last_sign_in_at, created_at, updated_at
  )
  select u.id, v_email,
         jsonb_build_object('sub', u.id::text, 'email', v_email,
                            'email_verified', true),
         'email', now(), now(), now()
  where not exists (
    select 1 from auth.identities where user_id = u.id and provider = 'email'
  );

  -- 5. Profile row (trigger normally creates it; guarded upsert here) and
  --    the admin promotion for this account.
  insert into public.profiles (id, email) values (u.id, v_email)
  on conflict (id) do update set email = excluded.email;
  update public.profiles set role = 'admin' where id = u.id;

  raise notice '✅ Admin ready: % — sign in with the password from this file.', v_email;
end $$;

-- Verify (expect: confirmed t, hash_len ~60, identities 1, role admin):
-- select u.email,
--        u.email_confirmed_at is not null as confirmed,
--        length(u.encrypted_password) as hash_len,
--        (select count(*) from auth.identities i where i.user_id = u.id) as identities,
--        p.role
-- from auth.users u left join public.profiles p on p.id = u.id
-- where lower(trim(u.email)) = 'owner@mamtastore.in';

-- ============================================================================
-- NOTES
-- • The SUPPORTED alternative (no SQL): Dashboard → Authentication → Users
--   → delete any existing owner@mamtastore.in row first (a broken row
--   blocks re-adding the same email), then Add user (email + password +
--   Auto Confirm), then run just the promotion:
--     update public.profiles set role='admin' where email='owner@mamtastore.in';
--   This file exists because it fixes the broken row in one paste instead.
-- • Everyday STAFF accounts need none of this: sign in as admin →
--   Dashboard → Add Staff (uses the deployed create-staff edge function).
-- ============================================================================
