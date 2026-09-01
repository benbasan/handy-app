-- Phase 1 — identity layer: profiles, pro_profiles, verification_documents.
-- Data model: docs/architecture.md section 3. RLS rules: section 4.
--
-- Notes that apply to every Phase 1 migration:
--
--  * `enable row level security` only, never `force`. In this project the
--    table owner (`postgres`) already carries BYPASSRLS, which outranks FORCE,
--    so FORCE would change nothing while quietly breaking security-definer
--    triggers. App traffic arrives as `anon`/`authenticated`, and neither
--    bypasses RLS.
--  * Grants are explicit and column-scoped. RLS picks *rows*; it cannot pick
--    columns. `profiles` is the clearest case: a row policy saying "you may
--    update your own row" would happily let a customer set their own
--    `role = 'admin'`. The column grant is what actually stops that.
--  * PostGIS lives in the `extensions` schema (see the Phase 0 migration), so
--    its types and functions are schema-qualified.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  phone text not null unique,
  full_name text,
  role text not null default 'customer' check (role in ('customer', 'pro', 'admin')),
  created_at timestamptz not null default now()
);

comment on table public.profiles is
  'One row per authenticated user. Created by the on_auth_user_created trigger, never by client code.';
comment on column public.profiles.role is
  'customer | pro | admin. Only customer and pro are self-assignable at sign-up; admin is granted by direct SQL.';

create table public.pro_profiles (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  bio text,
  radius_km int not null default 5 check (radius_km between 1 and 100),
  service_point extensions.geography(Point, 4326),
  verification_status text not null default 'pending'
    check (verification_status in ('pending', 'verified', 'rejected', 'suspended')),
  rating_avg numeric(2, 1) check (rating_avg between 0 and 5),
  jobs_completed_count int not null default 0 check (jobs_completed_count >= 0),
  accepting_jobs boolean not null default true,
  profile_strength_pct int not null default 0 check (profile_strength_pct between 0 and 100),
  created_at timestamptz not null default now()
);

-- The reason PostGIS is in the stack: "which pros cover this job's location"
-- has to be an indexed ST_DWithin, not a full scan with distance maths in JS.
create index pro_profiles_service_point_idx
  on public.pro_profiles using gist (service_point);

create table public.verification_documents (
  id uuid primary key default gen_random_uuid(),
  pro_id uuid not null references public.pro_profiles (user_id) on delete cascade,
  doc_type text not null check (doc_type in ('id_card', 'license', 'insurance', 'profile_photo')),
  file_url text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create index verification_documents_pro_id_idx
  on public.verification_documents (pro_id);

-- ---------------------------------------------------------------------------
-- RLS helpers
--
-- security definer, because a policy on (say) `jobs` that reads `profiles`
-- would otherwise re-enter `profiles`' own policies and recurse. `search_path`
-- is emptied and every name qualified, so the function cannot be hijacked by a
-- caller's search_path.
-- ---------------------------------------------------------------------------

create function public.auth_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select p.role from public.profiles p where p.id = (select auth.uid());
$$;

comment on function public.auth_role() is
  'Role of the calling user. Named auth_role because current_role is a reserved SQL keyword.';

create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role = 'admin'
  );
$$;

create function public.is_verified_pro()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.pro_profiles pp
    where pp.user_id = (select auth.uid()) and pp.verification_status = 'verified'
  );
$$;

-- ---------------------------------------------------------------------------
-- Profile creation
-- ---------------------------------------------------------------------------

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_role text := new.raw_user_meta_data ->> 'role';
  resolved_role text;
begin
  -- Security boundary. `raw_user_meta_data` is client-supplied: whatever the
  -- browser passes as signInWithOtp's `options.data` lands here verbatim. Only
  -- the two self-service roles are honoured, so a caller asking for 'admin'
  -- gets 'customer'. Admin is granted by direct SQL, never by sign-up.
  resolved_role := case
    when requested_role in ('customer', 'pro') then requested_role
    else 'customer'
  end;

  insert into public.profiles (id, phone, full_name, role)
  values (
    new.id,
    coalesce(new.phone, new.email),
    nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
    resolved_role
  );

  -- Give a pro their extension row up front, so their own RLS policies have
  -- something to match from the very first request.
  if resolved_role = 'pro' then
    insert into public.pro_profiles (user_id) values (new.id);
  end if;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Grants + RLS: profiles
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;

revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
-- full_name is the only self-editable column. Notably absent: role and phone.
grant update (full_name) on public.profiles to authenticated;

create policy "profiles: read own"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()));

create policy "profiles: admin reads all"
  on public.profiles for select to authenticated
  using (public.is_admin());

create policy "profiles: update own"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Grants + RLS: pro_profiles
-- ---------------------------------------------------------------------------

alter table public.pro_profiles enable row level security;

revoke all on public.pro_profiles from anon, authenticated;
grant select on public.pro_profiles to authenticated;
-- Absent by design: verification_status, rating_avg, jobs_completed_count —
-- a pro must not be able to verify themselves or edit their own rating.
grant update (bio, radius_km, service_point, accepting_jobs, profile_strength_pct)
  on public.pro_profiles to authenticated;

create policy "pro_profiles: read own"
  on public.pro_profiles for select to authenticated
  using (user_id = (select auth.uid()));

create policy "pro_profiles: admin reads all"
  on public.pro_profiles for select to authenticated
  using (public.is_admin());

create policy "pro_profiles: update own"
  on public.pro_profiles for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Customers get no direct read here on purpose. The customer-facing pro
-- profile (rating, verified badge, gallery) is a public-safe view built in the
-- phase that needs it, not a hole in this table.

-- ---------------------------------------------------------------------------
-- Grants + RLS: verification_documents
-- ---------------------------------------------------------------------------

alter table public.verification_documents enable row level security;

revoke all on public.verification_documents from anon, authenticated;
-- No update/delete grant: a pro must not be able to flip their own document
-- to 'approved', or erase a rejection.
grant select, insert on public.verification_documents to authenticated;

create policy "verification_documents: pro reads own"
  on public.verification_documents for select to authenticated
  using (pro_id = (select auth.uid()));

create policy "verification_documents: admin reads all"
  on public.verification_documents for select to authenticated
  using (public.is_admin());

create policy "verification_documents: pro inserts own"
  on public.verification_documents for insert to authenticated
  with check (pro_id = (select auth.uid()));

-- Customers have no policy on this table at any operation. architecture.md
-- section 4 is explicit: they see the derived "verified" badge, never a
-- document.
