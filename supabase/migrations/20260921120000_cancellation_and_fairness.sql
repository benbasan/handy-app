-- ---------------------------------------------------------------------------
-- Phase 15 — ביטול, והוגנות הכסף
--
-- `jobs.status` has carried a `cancelled` value since Phase 1 with no way into
-- it, while `/cancellation` described a policy and the help centre promised a
-- one-tap cancel. Since Phase 10 that stopped being a gap and became a cost: a
-- pro pays 35 ₪ before the work, never refunded, and a customer who changes
-- their mind had no path in the product at all.
--
-- Decided with the user on 15.9.2026 (docs/roadmap.md, Phase 15):
--
--   1. The customer cancels on their own until a pro accepts.
--   2. After that, cancelling goes through the pro ("הלקוח ביטל") or an admin,
--      and the pro gets a credit: their next accepted job is free. The fee is
--      still never refunded — the 8.9.2026 decision stands.
--   3. No-shows are not built here.
--   4. A pro rates the customer after a job, privately: only an admin reads it.
--
-- Every status check in the functions that act on a job (`select_bid()`,
-- `accept_job()`, `mark_job_in_progress()`, `request_price_update()`,
-- `report_job_location()`, `complete_job()`) already refuses anything but the
-- statuses they expect, so a cancelled job is closed to all of them without
-- touching one.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 0. One notification kind
-- ---------------------------------------------------------------------------

alter table public.notifications drop constraint notifications_kind_check;

alter table public.notifications add constraint notifications_kind_check check (
  kind in (
    -- pro
    'job_in_radius',
    'job_requested',
    'bid_selected',
    'selection_moved',
    'selection_withdrawn',
    'selection_expiring',
    'selection_lapsed_pro',
    'price_update_approved',
    'price_update_rejected',
    'review_received',
    'pro_verified',
    'pro_rejected',
    -- customer
    'first_bid_received',
    'bid_received',
    'pro_accepted',
    'pro_declined',
    'selection_lapsed_customer',
    'pro_on_the_way',
    'pro_arrived',
    'price_update_requested',
    'job_completed',
    'no_bids_yet',
    'requested_pro_passed',
    'review_reminder',
    -- both
    'message_received',
    'visit_reminder',
    'job_cancelled'
  )
);

-- ---------------------------------------------------------------------------
-- 1. What a cancellation records
-- ---------------------------------------------------------------------------

alter table public.jobs
  add column cancelled_at timestamptz,
  add column cancelled_by text,
  add column cancel_reason text,
  add constraint jobs_cancelled_by_check
    check (cancelled_by in ('customer', 'pro', 'admin')),
  add constraint jobs_cancel_reason_check
    check (cancel_reason in (
      'solved_myself', 'found_elsewhere', 'not_needed', 'other',
      'customer_cancelled'
    )),
  add constraint jobs_cancellation_complete check (
    (status = 'cancelled') = (cancelled_at is not null and cancelled_by is not null)
  );

comment on column public.jobs.cancelled_by is
  'customer | pro | admin. Written only by cancel_job() and cancel_assigned_job(); no client grant.';
comment on column public.jobs.cancel_reason is
  'Closed vocabulary. The Hebrew labels live in lib/validation/cancellation.ts.';

-- ---------------------------------------------------------------------------
-- 2. The credit ledger
--
-- One row per job a customer cancelled after a pro had paid to take it. Spent
-- by accept_job() on that pro's next charged job. No client grant of any kind:
-- a credit a pro could write is a fee a pro could waive.
-- ---------------------------------------------------------------------------

create table public.fee_credits (
  id uuid primary key default gen_random_uuid(),
  pro_id uuid not null references public.pro_profiles (user_id) on delete cascade,
  source_job_id uuid not null unique references public.jobs (id) on delete cascade,
  amount numeric(10, 2) not null check (amount > 0),
  created_at timestamptz not null default now(),
  used_on_job_id uuid unique references public.jobs (id) on delete set null,
  used_at timestamptz,
  constraint fee_credits_used_pair check ((used_on_job_id is null) = (used_at is null))
);

comment on table public.fee_credits is
  'A credit for the fee a pro paid on a job that was cancelled after they took it. Spent by accept_job() on their next charged job. Written only by cancel_assigned_job(); no client grant.';

create index fee_credits_unused_idx
  on public.fee_credits (pro_id, created_at) where used_on_job_id is null;

alter table public.fee_credits enable row level security;
revoke all on public.fee_credits from anon, authenticated;
grant select on public.fee_credits to authenticated;

create policy "fee_credits: pro reads own"
  on public.fee_credits for select to authenticated
  using (pro_id = (select auth.uid()));

create policy "fee_credits: admin reads all"
  on public.fee_credits for select to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- 3. The fee, now with credits
--
-- `job_base_fee_for()` is what Phase 13.8 called `job_acceptance_fee_for()`:
-- the flat fee, or the new-customer waiver. `job_acceptance_fee_for()` is now
-- what accepting would actually charge — 0 if the base is 0, 0 if an unspent
-- credit covers it — so `my_fee_for_job()` and `my_pending_acceptances()`
-- keep telling the pro the true number without changing a line.
-- ---------------------------------------------------------------------------

create function public.job_base_fee_for(p_job_id uuid, p_pro_id uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when exists (
      select 1 from public.jobs j
       where j.id = p_job_id
         and j.requested_pro_id = p_pro_id
         and not exists (
           select 1 from public.job_fees f
             join public.jobs earlier on earlier.id = f.job_id
            where earlier.customer_id = j.customer_id
              and f.job_id <> j.id
         )
    ) then 0::numeric
    else public.job_acceptance_fee()
  end;
$$;

comment on function public.job_base_fee_for(uuid, uuid) is
  'The fee before credits: 0 on a new customer''s first job through this pro''s own link, job_acceptance_fee() otherwise.';

revoke execute on function public.job_base_fee_for(uuid, uuid) from public, anon, authenticated;

create or replace function public.job_acceptance_fee_for(p_job_id uuid, p_pro_id uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when public.job_base_fee_for(p_job_id, p_pro_id) = 0 then 0::numeric
    when exists (
      select 1 from public.fee_credits c
       where c.pro_id = p_pro_id and c.used_on_job_id is null
    ) then 0::numeric
    else public.job_acceptance_fee()
  end;
$$;

comment on function public.job_acceptance_fee_for(uuid, uuid) is
  'What accepting this job would charge this pro: 0 under the new-customer waiver or while they hold an unspent credit; job_acceptance_fee() otherwise.';

CREATE OR REPLACE FUNCTION public.accept_job(p_bid_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_bid public.bids;
  v_job public.jobs;
  v_id uuid;
  v_base numeric;
  v_credit uuid;
begin
  select * into v_bid from public.bids b where b.id = p_bid_id;
  if v_bid is null then
    raise exception 'no such bid' using errcode = 'P0002';
  end if;

  if v_bid.pro_id <> (select auth.uid()) then
    raise exception 'only the pro this job was offered to may take it'
      using errcode = '42501';
  end if;

  -- Already taken by this pro: hand back the fee row that exists.
  if v_bid.status = 'accepted' then
    select f.id into v_id from public.job_fees f where f.job_id = v_bid.job_id;
    return v_id;
  end if;

  if v_bid.status <> 'selected' then
    raise exception 'this job has not been offered to you' using errcode = '22023';
  end if;

  -- The two-hour clock, re-read here rather than trusted from the sweep — the
  -- same trade Phase 4 made with expires_at.
  if v_bid.accept_deadline is null or v_bid.accept_deadline <= now() then
    raise exception 'the time to take this job has passed' using errcode = '22023';
  end if;

  if not public.is_verified_pro() then
    raise exception 'only a verified pro may take a job' using errcode = '42501';
  end if;

  select * into v_job from public.jobs j where j.id = v_bid.job_id;

  if v_job.selected_bid_id is not null or v_job.status <> 'awaiting_pro' then
    raise exception 'this job is no longer waiting for an answer'
      using errcode = '22023';
  end if;

  update public.bids
     set status = 'accepted', accept_deadline = null
   where id = p_bid_id;

  -- Now, and only now, is the job somebody's. "בחירת הצעה נועלת את שאר
  -- ההצעות" moved to this line: every rival closes in the same statement, so
  -- there is no window in which two offers are live.
  update public.bids
     set status = 'rejected'
   where job_id = v_bid.job_id
     and id <> p_bid_id
     and status = 'pending';

  update public.jobs
     set selected_bid_id = p_bid_id,
         status = 'assigned'
   where id = v_bid.job_id;

  -- The fee is read from the function, never from the caller. The base is the
  -- flat fee, or 0 on a new customer's first job through this pro's own link
  -- (Phase 13.8). Since Phase 15 a credit — left by a job a customer cancelled
  -- after this pro took it — covers a charged job, and is spent here, in the
  -- same statement, locked so two acceptances cannot spend one credit twice.
  v_base := public.job_base_fee_for(v_bid.job_id, v_bid.pro_id);

  if v_base > 0 then
    update public.fee_credits
       set used_on_job_id = v_bid.job_id, used_at = now()
     where id = (
       select c.id from public.fee_credits c
        where c.pro_id = v_bid.pro_id and c.used_on_job_id is null
        order by c.created_at
        limit 1
        for update skip locked
     )
    returning id into v_credit;
  end if;

  insert into public.job_fees (job_id, pro_id, base_price, fee_amount)
  values (
    v_bid.job_id, v_bid.pro_id, v_bid.price,
    case when v_credit is not null then 0 else v_base end
  )
  returning id into v_id;

  -- Inside the same statement as the fee, which is what makes it idempotent
  -- for free: the early return above means a second tap never reaches here,
  -- so a retried button charges once and tells the customer once.
  perform public.notify_user(
    v_job.customer_id, 'pro_accepted', v_bid.job_id, v_bid.pro_id,
    jsonb_build_object('price', v_bid.price)
  );

  return v_id;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 4. The customer cancels — until a pro accepts
-- ---------------------------------------------------------------------------

create function public.cancel_job(p_job_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.jobs%rowtype;
begin
  select * into v_job from public.jobs where id = p_job_id for update;

  if not found or v_job.customer_id is distinct from (select auth.uid()) then
    raise exception 'not your job' using errcode = '42501';
  end if;

  if p_reason not in ('solved_myself', 'found_elsewhere', 'not_needed', 'other') then
    raise exception 'unknown cancel reason' using errcode = '22023';
  end if;

  -- `selected_bid_id` is what "a pro took it" means (CLAUDE.md section 3), so
  -- it is the line, not a status name.
  if v_job.selected_bid_id is not null
     or v_job.status not in ('open', 'bidding', 'awaiting_pro') then
    raise exception 'a pro has already taken this job' using errcode = '22023';
  end if;

  -- Every pro who is still in the running is told, once each, before their
  -- offers close — including the one who was chosen and has not answered.
  insert into public.notifications (user_id, kind, job_id, actor_id, payload)
  select distinct b.pro_id, 'job_cancelled', p_job_id, v_job.customer_id,
         jsonb_build_object('by', 'customer')
    from public.bids b
   where b.job_id = p_job_id
     and b.status in ('pending', 'selected');

  update public.bids
     set status = 'rejected', accept_deadline = null
   where job_id = p_job_id
     and status in ('pending', 'selected');

  update public.jobs
     set status = 'cancelled',
         cancelled_at = now(),
         cancelled_by = 'customer',
         cancel_reason = p_reason
   where id = p_job_id;
end;
$$;

comment on function public.cancel_job(uuid, text) is
  'The customer cancels a call no pro has taken yet. Closes every live offer and tells those pros. Charges nothing and credits nothing: nobody has paid.';

revoke execute on function public.cancel_job(uuid, text) from public, anon;
grant execute on function public.cancel_job(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. After a pro accepted — the pro or an admin, and a credit
-- ---------------------------------------------------------------------------

create function public.cancel_assigned_job(p_job_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.jobs%rowtype;
  v_fee public.job_fees%rowtype;
  v_by text;
begin
  select * into v_job from public.jobs where id = p_job_id for update;

  if not found then
    raise exception 'no such job' using errcode = 'P0002';
  end if;

  if public.is_admin() then
    v_by := 'admin';
  elsif public.is_assigned_pro(p_job_id) then
    v_by := 'pro';
  else
    raise exception 'only the pro who took this job, or an admin, may cancel it'
      using errcode = '42501';
  end if;

  if v_job.status not in ('assigned', 'in_progress') then
    raise exception 'this job is not under way' using errcode = '22023';
  end if;

  select * into v_fee from public.job_fees where job_id = p_job_id;

  update public.jobs
     set status = 'cancelled',
         cancelled_at = now(),
         cancelled_by = v_by,
         cancel_reason = 'customer_cancelled'
   where id = p_job_id;

  -- A price question nobody will answer any more, settled the way
  -- complete_job() settles one: refused, which changes no number.
  update public.price_updates
     set status = 'rejected', decided_at = now()
   where job_id = p_job_id and status = 'pending';

  -- The credit is exactly what was charged. A job taken under the new-customer
  -- waiver charged nothing, so it leaves nothing to give back.
  if v_fee.fee_amount > 0 then
    insert into public.fee_credits (pro_id, source_job_id, amount)
    values (v_fee.pro_id, p_job_id, v_fee.fee_amount)
    on conflict (source_job_id) do nothing;
  end if;

  -- The customer hears about it whoever pressed the button — and can dispute
  -- it. That is the check on a pro who takes a job off the platform and
  -- reports it as cancelled to be given their fee back.
  perform public.notify_user(
    v_job.customer_id, 'job_cancelled', p_job_id, v_fee.pro_id,
    jsonb_build_object('by', v_by)
  );

  if v_by = 'admin' then
    perform public.notify_user(
      v_fee.pro_id, 'job_cancelled', p_job_id, null,
      jsonb_build_object('by', 'admin')
    );
  end if;
end;
$$;

comment on function public.cancel_assigned_job(uuid) is
  'Cancels a job a pro has taken, at the customer''s request, by that pro or an admin. Credits the fee that was charged against the pro''s next job, and tells the customer, who may dispute it.';

revoke execute on function public.cancel_assigned_job(uuid) from public, anon;
grant execute on function public.cancel_assigned_job(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. The pro rates the customer — privately
--
-- Only an admin reads it, by the user's decision: it exists to find the
-- customer who is a pattern, not to let pros pre-judge a stranger's call. The
-- pro may read back the one they wrote. The customer never reads it.
-- ---------------------------------------------------------------------------

create table public.customer_ratings (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null unique references public.jobs (id) on delete cascade,
  pro_id uuid not null references public.profiles (id) on delete cascade,
  customer_id uuid not null references public.profiles (id) on delete cascade,
  rating int not null check (rating between 1 and 5),
  comment text check (comment is null or char_length(comment) <= 500),
  created_at timestamptz not null default now()
);

comment on table public.customer_ratings is
  'A pro''s private rating of the customer on a finished job. Read by an admin and by the pro who wrote it — never by the customer, never by another pro. Written only by rate_customer().';

create index customer_ratings_customer_idx on public.customer_ratings (customer_id);

alter table public.customer_ratings enable row level security;
revoke all on public.customer_ratings from anon, authenticated;
grant select on public.customer_ratings to authenticated;

create policy "customer_ratings: pro reads own"
  on public.customer_ratings for select to authenticated
  using (pro_id = (select auth.uid()));

create policy "customer_ratings: admin reads all"
  on public.customer_ratings for select to authenticated
  using (public.is_admin());

create function public.rate_customer(p_job_id uuid, p_rating int, p_comment text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.jobs%rowtype;
  v_id uuid;
begin
  if not public.is_assigned_pro(p_job_id) then
    raise exception 'only the pro who did this job may rate its customer'
      using errcode = '42501';
  end if;

  select * into v_job from public.jobs where id = p_job_id;

  if v_job.status <> 'completed' then
    raise exception 'a customer is rated after the job is finished'
      using errcode = '22023';
  end if;

  if p_rating is null or p_rating not between 1 and 5 then
    raise exception 'rating must be 1 to 5' using errcode = '22023';
  end if;

  insert into public.customer_ratings (job_id, pro_id, customer_id, rating, comment)
  values (p_job_id, (select auth.uid()), v_job.customer_id, p_rating,
          nullif(btrim(coalesce(p_comment, '')), ''))
  on conflict (job_id) do nothing
  returning id into v_id;

  if v_id is null then
    raise exception 'this customer was already rated for this job'
      using errcode = '23505';
  end if;

  return v_id;
end;
$$;

comment on function public.rate_customer(uuid, int, text) is
  'The pro who did a finished job rates its customer, once. Private: only an admin and the author read it.';

revoke execute on function public.rate_customer(uuid, int, text) from public, anon;
grant execute on function public.rate_customer(uuid, int, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. The console's count of cancellations
--
-- The design's "ביטולים" figure that Phase 6 refused to draw as a permanent
-- zero. An aggregate is a function (CLAUDE.md section 3), asked of the last
-- thirty days; the per-pro list is what makes a pattern of "the customer
-- cancelled" visible.
-- ---------------------------------------------------------------------------

create function public.admin_cancellation_stats()
returns table (
  by_customer int,
  by_pro int,
  by_admin int,
  credits_open int,
  top_pro_id uuid,
  top_pro_name text,
  top_pro_cancellations int
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'admins only' using errcode = '42501';
  end if;

  return query
  with recent as (
    select j.*, f.pro_id as taker
      from public.jobs j
      left join public.job_fees f on f.job_id = j.id
     where j.status = 'cancelled'
       and j.cancelled_at > now() - interval '30 days'
  ),
  top as (
    select taker, count(*)::int as n
      from recent
     where cancelled_by = 'pro'
     group by taker
     order by n desc
     limit 1
  )
  select
    (select count(*)::int from recent where cancelled_by = 'customer'),
    (select count(*)::int from recent where cancelled_by = 'pro'),
    (select count(*)::int from recent where cancelled_by = 'admin'),
    (select count(*)::int from public.fee_credits where used_on_job_id is null),
    top.taker,
    (select p.full_name from public.profiles p where p.id = top.taker),
    top.n
  from (select 1) as one
  left join top on true;
end;
$$;

comment on function public.admin_cancellation_stats() is
  'Cancellations in the last thirty days by who cancelled, unspent credits, and the pro who reported "the customer cancelled" most often. Admins only.';

revoke execute on function public.admin_cancellation_stats() from public, anon;
grant execute on function public.admin_cancellation_stats() to authenticated;
