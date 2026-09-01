-- Phase 1 — reviews, commission_charges, disputes, saved_pros.

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  -- One review per job (architecture.md section 3 draws JOBS ||--o| REVIEWS).
  job_id uuid not null unique references public.jobs (id) on delete cascade,
  rating int not null check (rating between 1 and 5),
  comment text,
  created_at timestamptz not null default now()
);

alter table public.reviews enable row level security;

revoke all on public.reviews from anon, authenticated;
grant select, insert on public.reviews to authenticated;
grant update (rating, comment) on public.reviews to authenticated;

create policy "reviews: job owner reads"
  on public.reviews for select to authenticated
  using (public.is_job_owner(job_id));

create policy "reviews: reviewed pro reads"
  on public.reviews for select to authenticated
  using (public.is_assigned_pro(job_id));

create policy "reviews: admin reads all"
  on public.reviews for select to authenticated
  using (public.is_admin());

create policy "reviews: job owner writes"
  on public.reviews for insert to authenticated
  with check (public.is_job_owner(job_id));

create policy "reviews: job owner edits own"
  on public.reviews for update to authenticated
  using (public.is_job_owner(job_id))
  with check (public.is_job_owner(job_id));

-- Anonymous read of reviews belongs to the public pro profile (Phase 8) and
-- will arrive as a curated view, not as a policy widening on this table.

-- ---------------------------------------------------------------------------
-- commission_charges
-- ---------------------------------------------------------------------------

create table public.commission_charges (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null unique references public.jobs (id) on delete cascade,
  -- Denormalised from job -> selected_bid -> pro. architecture.md section 3
  -- leaves the pro implicit, but "a pro sees only their own earnings" then
  -- becomes a two-hop join inside a policy evaluated on every row. Storing
  -- pro_id makes it one indexed column comparison. Recorded in that doc.
  pro_id uuid not null references public.pro_profiles (user_id) on delete cascade,
  base_price numeric(10, 2) not null check (base_price >= 0),
  total_price numeric(10, 2) not null check (total_price >= 0),
  commission_amount numeric(10, 2) not null check (commission_amount >= 0),
  payment_method text not null
    check (payment_method in ('cash', 'bit', 'paybox', 'bank_transfer')),
  charged_at timestamptz not null default now()
);

create index commission_charges_pro_id_idx on public.commission_charges (pro_id);

alter table public.commission_charges enable row level security;

revoke all on public.commission_charges from anon, authenticated;
-- Read only, for every client role. Money is server-authoritative (CLAUDE.md
-- section 3): the 12% is computed and written by elevated server code in
-- Phase 6, so no browser needs insert or update here at all.
grant select on public.commission_charges to authenticated;

create policy "commission_charges: pro reads own"
  on public.commission_charges for select to authenticated
  using (pro_id = (select auth.uid()));

create policy "commission_charges: admin reads all"
  on public.commission_charges for select to authenticated
  using (public.is_admin());

-- Customers have no policy on this table, at any operation. architecture.md
-- section 4: the commission is between Handy and the pro; it is none of the
-- customer's business.

-- ---------------------------------------------------------------------------
-- disputes
-- ---------------------------------------------------------------------------

create table public.disputes (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs (id) on delete cascade,
  opened_by uuid not null references public.profiles (id) on delete cascade,
  reason text not null check (length(trim(reason)) > 0),
  status text not null default 'open'
    check (status in ('open', 'in_review', 'resolved', 'rejected')),
  credit_amount numeric(10, 2) check (credit_amount >= 0),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create index disputes_job_id_idx on public.disputes (job_id);

alter table public.disputes enable row level security;

revoke all on public.disputes from anon, authenticated;
-- No update grant: resolving a dispute, and any credit attached to it, is an
-- admin action carried out with elevated access in Phase 7. Neither party can
-- close their own case.
grant select, insert on public.disputes to authenticated;

create policy "disputes: participants read"
  on public.disputes for select to authenticated
  using (public.is_job_owner(job_id) or public.is_bidding_pro(job_id));

create policy "disputes: admin reads all"
  on public.disputes for select to authenticated
  using (public.is_admin());

create policy "disputes: participants open as themselves"
  on public.disputes for insert to authenticated
  with check (
    opened_by = (select auth.uid())
    and (public.is_job_owner(job_id) or public.is_bidding_pro(job_id))
  );

-- ---------------------------------------------------------------------------
-- saved_pros
-- ---------------------------------------------------------------------------

create table public.saved_pros (
  customer_id uuid not null references public.profiles (id) on delete cascade,
  pro_id uuid not null references public.pro_profiles (user_id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (customer_id, pro_id)
);

create index saved_pros_pro_id_idx on public.saved_pros (pro_id);

alter table public.saved_pros enable row level security;

revoke all on public.saved_pros from anon, authenticated;
grant select, insert, delete on public.saved_pros to authenticated;

create policy "saved_pros: customer reads own"
  on public.saved_pros for select to authenticated
  using (customer_id = (select auth.uid()));

create policy "saved_pros: customer saves own"
  on public.saved_pros for insert to authenticated
  with check (customer_id = (select auth.uid()));

create policy "saved_pros: customer removes own"
  on public.saved_pros for delete to authenticated
  using (customer_id = (select auth.uid()));

-- A pro cannot see who saved them: that is a customer's private list, and
-- exposing it would leak intent before a job is even posted.
