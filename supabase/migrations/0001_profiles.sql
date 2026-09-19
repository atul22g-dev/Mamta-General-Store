-- =============================================================================
-- 0001 — profiles & access control helpers
-- =============================================================================
-- profiles extends auth.users with store-specific fields (role).
-- A database trigger creates a profile row for every new signup.

create type public.user_role as enum ('admin', 'staff');

create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  email      text not null,
  role       public.user_role not null default 'staff',
  created_at timestamptz not null default now()
);

-- RLS is enabled at creation so the table is never exposed without it;
-- policies are defined in 0003_rls.sql.
alter table public.profiles enable row level security;

comment on table public.profiles is 'Store user profiles; 1:1 with auth.users.';

create index profiles_role_idx on public.profiles (role);

-- -----------------------------------------------------------------------------
-- Helpers (security definer to avoid RLS recursion on profiles)
-- -----------------------------------------------------------------------------
-- Returns the role of the current user, or null for anon callers.
create or replace function public.current_role()
returns public.user_role
language sql
stable
security definer
set search_path = ''
as $$
  select role from public.profiles where id = auth.uid()
$$;

-- True when the caller is authenticated with the 'admin' role.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.current_role() = 'admin'
$$;

-- -----------------------------------------------------------------------------
-- Auto-create a profile on signup
-- -----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, coalesce(new.email, ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
