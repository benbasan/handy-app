-- Phase 1 — jobs (קריאה) and bids (הצעת מחיר).
--
-- `jobs` deliberately has NO price column, exactly as docs/architecture.md
-- section 3 draws it. That is what makes CLAUDE.md's "there is no direct
-- UPDATE jobs SET price path" true by construction rather than by policy: the
-- live price of a job is derived — the selected bid's price plus every
-- approved row in price_updates. The approve/reject state machine over those
-- rows belongs to Phase 5 and is not built here.

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles (id) on delete cascade,
  category_id uuid not null references public.categories (id) on delete restrict,
  description text not null check (length(trim(description)) > 0),
  photo_urls text[] not null default '{}',
  video_url text,
  voice_note_url text,
  location extensions.geography(Point, 4326) not null,
  address_text text not null,
  preferred_time text,
  status text not null default 'open'
    check (status in ('draft', 'open', 'bidding', 'assigned', 'in_progress', 'completed', 'cancelled')),
  created_at timestamptz not null default now()
);

create index jobs_location_idx on public.jobs using gist (location);
create index jobs_customer_id_idx on public.jobs (customer_id);
create index jobs_status_idx on public.jobs (status);

create table public.bids (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs (id) on delete cascade,
  pro_id uuid not null references public.pro_profiles (user_id) on delete cascade,
  price numeric(10, 2) not null check (price > 0),
  eta_minutes int not null check (eta_minutes > 0),
  note text,
  status text not null default 'pending'
    check (status in ('pending', 'selected', 'rejected', 'expired')),
  -- product-spec.md 4.4: a bid is valid for 45 minutes. The sweep that flips
  -- lapsed rows to 'expired' is Phase 4; the deadline is recorded from day one.
  expires_at timestamptz not null default now() + interval '45 minutes',
  created_at timestamptz not null default now(),
  -- One bid per pro per job.
  unique (job_id, pro_id)
);

create index bids_job_id_idx on public.bids (job_id);
create index bids_pro_id_idx on public.bids (pro_id);

-- Circular reference: bids point at their job, and the job points back at the
-- one bid the customer picked. Added after both tables exist.
alter table public.jobs
  add column selected_bid_id uuid references public.bids (id) on delete set null;

-- ---------------------------------------------------------------------------
-- RLS helpers that need jobs/bids to exist
-- ---------------------------------------------------------------------------

create function public.is_job_owner(p_job_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.jobs j
    where j.id = p_job_id and j.customer_id = (select auth.uid())
  );
$$;

create function public.is_assigned_pro(p_job_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.jobs j
    join public.bids b on b.id = j.selected_bid_id
    where j.id = p_job_id and b.pro_id = (select auth.uid())
  );
$$;

create function public.is_bidding_pro(p_job_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.bids b
    where b.job_id = p_job_id and b.pro_id = (select auth.uid())
  );
$$;

comment on function public.is_bidding_pro(uuid) is
  'Pro has a bid on this job — selected or not. Chat opens before selection (product-spec.md 3.3), so this is wider than is_assigned_pro.';

create function public.pro_serves_point(p_point extensions.geography)
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
      and extensions.st_dwithin(p.service_point, p_point, p.radius_km * 1000)
  );
$$;

comment on function public.pro_serves_point(extensions.geography) is
  'Does the calling pro cover this point? Indexed ST_DWithin against their own service_point and radius_km.';

-- ---------------------------------------------------------------------------
-- Grants + RLS: jobs
-- ---------------------------------------------------------------------------

alter table public.jobs enable row level security;

revoke all on public.jobs from anon, authenticated;
grant select, insert on public.jobs to authenticated;
-- customer_id and category_id are absent: a job cannot be reassigned to
-- another customer, and its category is fixed at posting time.
grant update (
  description, photo_urls, video_url, voice_note_url,
  location, address_text, preferred_time, status, selected_bid_id
) on public.jobs to authenticated;

create policy "jobs: customer reads own"
  on public.jobs for select to authenticated
  using (customer_id = (select auth.uid()));

create policy "jobs: customer inserts own"
  on public.jobs for insert to authenticated
  with check (
    customer_id = (select auth.uid())
    and public.auth_role() = 'customer'
  );

create policy "jobs: customer updates own"
  on public.jobs for update to authenticated
  using (customer_id = (select auth.uid()))
  with check (customer_id = (select auth.uid()));

-- The pro feed. Three gates, all enforced here rather than in the query:
-- verified, still accepting work, and the job actually inside their radius.
create policy "jobs: verified pro reads open jobs in radius"
  on public.jobs for select to authenticated
  using (
    status in ('open', 'bidding')
    and public.pro_serves_point(location)
  );

-- Once a pro wins a job they keep reading it through every later status.
create policy "jobs: assigned pro reads own job"
  on public.jobs for select to authenticated
  using (public.is_assigned_pro(id));

create policy "jobs: admin reads all"
  on public.jobs for select to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- Grants + RLS: bids
-- ---------------------------------------------------------------------------

alter table public.bids enable row level security;

revoke all on public.bids from anon, authenticated;
grant select, insert on public.bids to authenticated;
grant update (price, eta_minutes, note, status) on public.bids to authenticated;

create policy "bids: pro reads own"
  on public.bids for select to authenticated
  using (pro_id = (select auth.uid()));

-- The customer sees every bid on their own job — read only. Choosing one is a
-- Phase 4 flow that runs server-side; it is not a client UPDATE on this table.
create policy "bids: customer reads bids on own jobs"
  on public.bids for select to authenticated
  using (public.is_job_owner(job_id));

create policy "bids: admin reads all"
  on public.bids for select to authenticated
  using (public.is_admin());

create policy "bids: verified pro inserts own"
  on public.bids for insert to authenticated
  with check (
    pro_id = (select auth.uid())
    and public.is_verified_pro()
  );

create policy "bids: pro updates own"
  on public.bids for update to authenticated
  using (pro_id = (select auth.uid()))
  with check (pro_id = (select auth.uid()));
