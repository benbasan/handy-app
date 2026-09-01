-- Phase 1 — price_updates (עדכון מחיר בשטח) and messages.
--
-- price_updates is the table that carries the product's central promise: a
-- price can only move through a row here, and a row here cannot exist without
-- a photo. Phase 1 creates the table and its access rules; Phase 5 adds the
-- pending -> approved/rejected transition enforcement and the derived price.

create table public.price_updates (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs (id) on delete cascade,
  pro_id uuid not null references public.pro_profiles (user_id) on delete cascade,
  original_price numeric(10, 2) not null check (original_price >= 0),
  new_price numeric(10, 2) not null check (new_price >= 0),
  -- NOT NULL and non-blank: "a photo of the fault" is a database constraint,
  -- not a required field in a form somebody can bypass.
  photo_url text not null check (length(trim(photo_url)) > 0),
  note text,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  decided_at timestamptz,
  created_at timestamptz not null default now()
);

create index price_updates_job_id_idx on public.price_updates (job_id);
create index price_updates_pro_id_idx on public.price_updates (pro_id);

alter table public.price_updates enable row level security;

revoke all on public.price_updates from anon, authenticated;
grant select, insert on public.price_updates to authenticated;
-- Only the decision columns are updatable, and only the customer holds the
-- update policy below. The pro cannot approve their own price change, and
-- neither side can rewrite the amounts or the photo after the fact.
grant update (status, decided_at) on public.price_updates to authenticated;

create policy "price_updates: job owner reads"
  on public.price_updates for select to authenticated
  using (public.is_job_owner(job_id));

create policy "price_updates: pro reads own"
  on public.price_updates for select to authenticated
  using (pro_id = (select auth.uid()));

create policy "price_updates: admin reads all"
  on public.price_updates for select to authenticated
  using (public.is_admin());

create policy "price_updates: assigned pro inserts"
  on public.price_updates for insert to authenticated
  with check (
    pro_id = (select auth.uid())
    and public.is_assigned_pro(job_id)
    and status = 'pending'
  );

-- Approve / reject is the customer's alone.
create policy "price_updates: job owner decides"
  on public.price_updates for update to authenticated
  using (public.is_job_owner(job_id))
  with check (public.is_job_owner(job_id));

-- ---------------------------------------------------------------------------
-- messages
-- ---------------------------------------------------------------------------

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (length(trim(body)) > 0),
  created_at timestamptz not null default now()
);

create index messages_job_id_created_at_idx on public.messages (job_id, created_at);

alter table public.messages enable row level security;

revoke all on public.messages from anon, authenticated;
-- No update or delete: a conversation that can be edited afterwards is
-- worthless as evidence in a dispute.
grant select, insert on public.messages to authenticated;

-- is_bidding_pro rather than is_assigned_pro: product-spec.md 3.3 lets the
-- customer message a pro before choosing one.
create policy "messages: job participants read"
  on public.messages for select to authenticated
  using (public.is_job_owner(job_id) or public.is_bidding_pro(job_id));

create policy "messages: admin reads all"
  on public.messages for select to authenticated
  using (public.is_admin());

create policy "messages: job participants send as themselves"
  on public.messages for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and (public.is_job_owner(job_id) or public.is_bidding_pro(job_id))
  );
