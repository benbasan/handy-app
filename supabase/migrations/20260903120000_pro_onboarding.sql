-- Phase 3 — the pro's side: onboarding, verification documents, and the job
-- feed's radius query.
--
-- Five things happen here.
--
--  1. `pro_profiles` grows the fields the five onboarding steps collect
--     (product-spec.md 4.2) and the availability screen edits
--     (design/screens/pro-5.2-availability-settings.png): working days and
--     hours, the base address behind `service_point`, how the pro collects
--     payment, and where the 12% commission is charged from.
--
--  2. `verification_status` gains a `draft` state and defaults to it. Phase 1
--     defaulted a brand-new pro to `pending`, which made "waiting for the
--     Handy team" indistinguishable from "has not filled anything in yet" —
--     and the roadmap's definition of done for this phase is precisely that a
--     pro *reaches* `pending` by completing the five steps.
--
--  3. Two join tables the ERD in docs/architecture.md already draws or the
--     feed needs: `pro_categories` (PRO_PROFILES }o--o{ CATEGORIES) and
--     `job_dismissals` (the "לא מתאים לי" button on every feed card).
--
--  4. Two status transitions that must not be column grants:
--     `submit_pro_for_approval()` (draft → pending, by the pro) and
--     `set_pro_verification()` (→ verified/rejected/suspended, by an admin).
--     RLS picks rows, not columns, so a grant on `verification_status` wide
--     enough for an admin would also let a pro verify themselves. Both are
--     `security definer` functions that check the caller instead.
--
--  5. The feed itself: the two radii finally meet. Phase 2 left open how
--     `jobs.search_radius_km` (how far the customer wants their job sent) and
--     `pro_profiles.radius_km` (how far the pro will travel) combine. The
--     answer is **both have to agree** — a job is visible at
--     `least(radius_km, search_radius_km)`, enforced in the RLS policy rather
--     than in the query, so it holds for anything that ever reads the table.

-- ---------------------------------------------------------------------------
-- 1. pro_profiles: what onboarding collects
-- ---------------------------------------------------------------------------

alter table public.pro_profiles
  -- 0 = Sunday … 6 = Saturday, matching the א…ש chips in the design.
  add column work_days smallint[] not null default array[0, 1, 2, 3, 4]::smallint[]
    constraint pro_profiles_work_days_check
    check (work_days <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[]),
  add column work_start_time time not null default '08:00',
  add column work_end_time time not null default '18:00',
  -- The address the pro typed; `service_point` is its geocoded form. Kept so
  -- the settings screen can show what they entered instead of coordinates.
  add column service_address_text text,
  -- Highest onboarding step completed, 0–5. product-spec.md 4.2: the flow can
  -- be stopped and resumed, which needs somewhere to record where it stopped.
  add column onboarding_step smallint not null default 0
    check (onboarding_step between 0 and 5),
  add column submitted_at timestamptz,
  -- How the pro takes money from the customer. Handy never touches it
  -- (business rule 4); this is what the customer is told to expect.
  add column payment_methods text[] not null default '{}'
    constraint pro_profiles_payment_methods_check
    check (payment_methods <@ array['cash', 'bit', 'paybox', 'transfer']),
  -- Where the 12% commission is charged from. Deliberately NOT a full account
  -- number: the last four digits identify the account to its owner on screen,
  -- and collecting the rest is a payments-phase decision with the user in the
  -- room (CLAUDE.md section 8 — real money movement).
  add column payout_bank_name text,
  add column payout_bank_branch text,
  add column payout_account_last4 text
    constraint pro_profiles_payout_last4_check
    check (payout_account_last4 ~ '^\d{4}$');

comment on column public.pro_profiles.work_days is
  '0 = Sunday … 6 = Saturday. Only jobs inside these days/hours are meant to reach the pro.';
comment on column public.pro_profiles.onboarding_step is
  'Highest of the five onboarding steps completed. 5 plus verification_status = pending means the profile was submitted.';
comment on column public.pro_profiles.payout_account_last4 is
  'Last four digits only. The full account number is not collected until the payments phase decides how it is stored.';

alter table public.pro_profiles
  drop constraint pro_profiles_verification_status_check;

alter table public.pro_profiles
  add constraint pro_profiles_verification_status_check
  check (verification_status in ('draft', 'pending', 'verified', 'rejected', 'suspended'));

alter table public.pro_profiles
  alter column verification_status set default 'draft';

comment on column public.pro_profiles.verification_status is
  'draft (still filling in onboarding) → pending (submitted) → verified | rejected. suspended is an admin enforcement action.';

-- The new self-editable columns. Still absent, and still deliberately:
-- verification_status, rating_avg, jobs_completed_count, submitted_at — a pro
-- must not be able to verify themselves or backdate their own queue position.
grant update (
  work_days, work_start_time, work_end_time, service_address_text,
  onboarding_step, payment_methods,
  payout_bank_name, payout_bank_branch, payout_account_last4
) on public.pro_profiles to authenticated;

-- ---------------------------------------------------------------------------
-- 2. pro_categories — תחומי התמחות
--
-- The ERD's PRO_PROFILES }o--o{ CATEGORIES edge. The feed uses it as a filter,
-- not as a security boundary: a job inside a pro's radius is not secret from
-- them because it is in another trade, so the gate stays radius + verified and
-- the category narrowing lives in the feed query.
-- ---------------------------------------------------------------------------

create table public.pro_categories (
  pro_id uuid not null references public.pro_profiles (user_id) on delete cascade,
  category_id uuid not null references public.categories (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (pro_id, category_id)
);

create index pro_categories_category_id_idx on public.pro_categories (category_id);

alter table public.pro_categories enable row level security;

revoke all on public.pro_categories from anon, authenticated;
grant select, insert, delete on public.pro_categories to authenticated;

create policy "pro_categories: pro reads own"
  on public.pro_categories for select to authenticated
  using (pro_id = (select auth.uid()));

create policy "pro_categories: admin reads all"
  on public.pro_categories for select to authenticated
  using (public.is_admin());

create policy "pro_categories: pro inserts own"
  on public.pro_categories for insert to authenticated
  with check (
    pro_id = (select auth.uid())
    and public.auth_role() = 'pro'
  );

create policy "pro_categories: pro deletes own"
  on public.pro_categories for delete to authenticated
  using (pro_id = (select auth.uid()));

-- Customers get no policy here. The customer-facing "which trades does this
-- pro do" belongs to the public profile in Phase 8, alongside the rest of it.

-- ---------------------------------------------------------------------------
-- 3. job_dismissals — "לא מתאים לי" on a feed card
--
-- Purely the pro's own view state, which is why it is a table and not a
-- client-side hide: dismissing a job on a phone should still hold on a laptop.
-- It hides nothing from anyone else and grants nothing.
-- ---------------------------------------------------------------------------

create table public.job_dismissals (
  pro_id uuid not null references public.pro_profiles (user_id) on delete cascade,
  job_id uuid not null references public.jobs (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (pro_id, job_id)
);

alter table public.job_dismissals enable row level security;

revoke all on public.job_dismissals from anon, authenticated;
grant select, insert, delete on public.job_dismissals to authenticated;

create policy "job_dismissals: pro reads own"
  on public.job_dismissals for select to authenticated
  using (pro_id = (select auth.uid()));

create policy "job_dismissals: admin reads all"
  on public.job_dismissals for select to authenticated
  using (public.is_admin());

create policy "job_dismissals: pro inserts own"
  on public.job_dismissals for insert to authenticated
  with check (pro_id = (select auth.uid()));

create policy "job_dismissals: pro deletes own"
  on public.job_dismissals for delete to authenticated
  using (pro_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- 4. The two status transitions
-- ---------------------------------------------------------------------------

create function public.submit_pro_for_approval()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  me public.pro_profiles;
  category_count int;
begin
  select * into me from public.pro_profiles where user_id = (select auth.uid());

  if me is null then
    raise exception 'not a pro' using errcode = '42501';
  end if;

  -- Re-submission after a rejection is fine. Re-submitting something already
  -- verified, or suspended by an admin, is not.
  if me.verification_status not in ('draft', 'rejected') then
    raise exception 'profile is not in a submittable state' using errcode = '22023';
  end if;

  select count(*) into category_count
    from public.pro_categories where pro_id = me.user_id;

  -- The same completeness the form checks, restated where it cannot be
  -- skipped by posting straight at the API.
  if me.service_point is null or category_count = 0
     or not exists (
       select 1 from public.verification_documents
       where pro_id = me.user_id and doc_type = 'id_card'
     )
  then
    raise exception 'profile is incomplete' using errcode = '22023';
  end if;

  update public.pro_profiles
     set verification_status = 'pending',
         onboarding_step = 5,
         submitted_at = now()
   where user_id = me.user_id;

  return 'pending';
end;
$$;

comment on function public.submit_pro_for_approval() is
  'draft|rejected → pending, by the pro themselves. A security definer function rather than a column grant, because a grant wide enough for this would also let a pro write verification_status = ''verified''.';

revoke execute on function public.submit_pro_for_approval() from public, anon;
grant execute on function public.submit_pro_for_approval() to authenticated;

create function public.set_pro_verification(p_pro_id uuid, p_status text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;

  if p_status not in ('verified', 'rejected', 'suspended', 'pending') then
    raise exception 'unsupported verification status: %', p_status using errcode = '22023';
  end if;

  update public.pro_profiles
     set verification_status = p_status
   where user_id = p_pro_id;

  if not found then
    raise exception 'no such pro' using errcode = 'P0002';
  end if;

  -- Approving the pro approves the documents that were reviewed to get there,
  -- so the admin queue does not keep showing them as unread.
  update public.verification_documents
     set status = case when p_status = 'verified' then 'approved' else 'rejected' end,
         reviewed_at = now()
   where pro_id = p_pro_id
     and status = 'pending'
     and p_status in ('verified', 'rejected');

  return p_status;
end;
$$;

comment on function public.set_pro_verification(uuid, text) is
  'Admin decision on a pro. Checks is_admin() itself; no client role holds an UPDATE grant on verification_status.';

revoke execute on function public.set_pro_verification(uuid, text) from public, anon;
grant execute on function public.set_pro_verification(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. The feed: both radii have to agree
--
-- `pro_serves_point(geography)` from Phase 1 only asked the pro's side of the
-- question. It is replaced by a two-argument version that also honours the
-- radius the customer chose when posting.
-- ---------------------------------------------------------------------------

create function public.pro_serves_job(
  p_point extensions.geography,
  p_search_radius_km int
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.pro_profiles p
    where p.user_id = (select auth.uid())
      and p.verification_status = 'verified'
      and p.accepting_jobs
      and p.service_point is not null
      and extensions.st_dwithin(
            p.service_point,
            p_point,
            least(p.radius_km, coalesce(p_search_radius_km, p.radius_km)) * 1000
          )
  );
$$;

comment on function public.pro_serves_job(extensions.geography, int) is
  'Is this job inside BOTH radii — the pro''s own radius_km and the job''s search_radius_km? Indexed ST_DWithin against the caller''s service_point.';

-- The storage-side twin has to move with it, or a pro could still read the
-- photos of a job whose customer asked for a narrower broadcast.
create or replace function public.can_read_job_media(p_object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.jobs j
    where (
        p_object_name = any (j.photo_urls)
        or p_object_name = j.video_url
        or p_object_name = j.voice_note_url
      )
      and (
        j.customer_id = (select auth.uid())
        or public.is_admin()
        or (j.status in ('open', 'bidding') and public.pro_serves_job(j.location, j.search_radius_km))
        or public.is_bidding_pro(j.id)
        or public.is_assigned_pro(j.id)
      )
  );
$$;

drop policy "jobs: verified pro reads open jobs in radius" on public.jobs;

create policy "jobs: verified pro reads open jobs in radius"
  on public.jobs for select to authenticated
  using (
    status in ('open', 'bidding')
    and public.pro_serves_job(location, search_radius_km)
  );

drop function public.pro_serves_point(extensions.geography);

-- How many bids a job has already collected. The design puts that number on
-- every feed card, and the SELECT policy on `bids` deliberately shows a pro
-- only their own rows — so this is a security definer function rather than a
-- widening of that policy. It returns a count and nothing else: no prices, no
-- identities, nothing a competitor could use beyond "there is competition".
create function public.job_bid_count(p_job_id uuid)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::int from public.bids b where b.job_id = p_job_id;
$$;

revoke execute on function public.job_bid_count(uuid) from public, anon;
grant execute on function public.job_bid_count(uuid) to authenticated;

/*
 * The feed query itself — product-spec.md 4.3.
 *
 * security INVOKER (the default), on purpose: the policy above is what decides
 * which jobs come back, and this function only narrows further. Nothing here
 * can widen it, which is why the radius filter chips can be a plain argument.
 *
 * `p_max_km` is the chip the pro picked (3 / 5 / all). `null` means "all",
 * which still means their own radius_km, because RLS says so.
 */
create function public.open_jobs_for_pro(p_max_km int default null)
returns table (
  id uuid,
  category_id uuid,
  category_name_he text,
  category_slug text,
  description text,
  address_text text,
  preferred_time text,
  search_radius_km int,
  status text,
  created_at timestamptz,
  photo_urls text[],
  latitude double precision,
  longitude double precision,
  distance_km double precision,
  bids_count int
)
language sql
stable
set search_path = ''
as $$
  with me as (
    select p.service_point, p.radius_km
      from public.pro_profiles p
     where p.user_id = (select auth.uid())
  )
  select
    j.id,
    j.category_id,
    c.name_he,
    c.slug,
    j.description,
    j.address_text,
    j.preferred_time,
    j.search_radius_km,
    j.status,
    j.created_at,
    j.photo_urls,
    j.latitude,
    j.longitude,
    round((extensions.st_distance(j.location, me.service_point) / 1000.0)::numeric, 1)::double precision,
    public.job_bid_count(j.id)
  from public.jobs j
  cross join me
  join public.categories c on c.id = j.category_id
  where j.status in ('open', 'bidding')
    and extensions.st_dwithin(
          j.location,
          me.service_point,
          least(me.radius_km, coalesce(p_max_km, me.radius_km)) * 1000
        )
    and not exists (
      select 1 from public.job_dismissals d
       where d.job_id = j.id and d.pro_id = (select auth.uid())
    )
    -- A pro who has not picked any trade sees everything in radius rather
    -- than an empty feed.
    and (
      not exists (select 1 from public.pro_categories pc where pc.pro_id = (select auth.uid()))
      or exists (
        select 1 from public.pro_categories pc
         where pc.pro_id = (select auth.uid()) and pc.category_id = j.category_id
      )
    )
  order by j.created_at desc
  limit 100;
$$;

comment on function public.open_jobs_for_pro(int) is
  'The pro job feed (product-spec.md 4.3). Runs as the caller, so the RLS policy on jobs — verified, accepting, and inside both radii — is what selects the rows.';

revoke execute on function public.open_jobs_for_pro(int) from public, anon;
grant execute on function public.open_jobs_for_pro(int) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. The verification-docs bucket
--
-- Private, and unlike job-media it has no "someone else may read this through
-- a related row" path: product-spec.md 4.2 is explicit that documents are
-- never shown to customers, who see only the derived מאומת badge. Exactly two
-- readers — the pro who uploaded it, and an admin.
--
-- Layout: <pro_id>/<filename>. There is no upload group here because, unlike a
-- job, the pro_profiles row already exists by the time anything is uploaded.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'verification-docs',
  'verification-docs',
  false,
  10485760, -- 10 MiB: an ID photo or a one-page PDF, nothing larger
  array[
    'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
    'application/pdf'
  ]
)
on conflict (id) do nothing;

create policy "verification-docs: pro reads own folder"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'verification-docs'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "verification-docs: admin reads all"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'verification-docs'
    and public.is_admin()
  );

create policy "verification-docs: pro uploads to own folder"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'verification-docs'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and public.auth_role() = 'pro'
  );

-- No update and no delete policy at all. A verification document is evidence
-- in exactly the way a price-update photo is: replacing one means uploading a
-- new row, so a rejection cannot be quietly erased.
