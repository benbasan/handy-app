-- ---------------------------------------------------------------------------
-- Phase 13 — התראות
--
-- The thesis, because every decision below follows from it:
--
--   **A notification row is a database fact, written inside the transaction
--   that caused it. A push is a best-effort accelerant on top, and no
--   correctness in this product depends on one having been delivered.**
--
-- That is what lets this phase satisfy the rule in CLAUDE.md section 2 that
-- pg_cron is "only ever housekeeping — nothing in the product may depend on a
-- sweep having run" without weakening it. `/pro/notifications` is correct with
-- the sweep switched off entirely; the sweep only ever stamps `pushed_at`.
--
-- It is also the answer to the thing Phase 10 broke. `select_bid()` gives the
-- pro two hours, `accept_job()` charges 35 ₪ before the work and never refunds
-- it, and until now nothing told the pro they had been chosen. The comment on
-- ACCEPT_WINDOW_MINUTES said so in as many words: "Two hours because nothing
-- notifies a pro whose tab is closed."
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. notifications
--
-- No title or body column. What a notification *says* is Hebrew copy, and
-- copy belongs in `lib/notifications/messages.ts` beside the rest of it — a
-- sentence frozen into a row at write time cannot be corrected, retranslated,
-- or read differently by the two sides of the same event. The row carries the
-- kind and the identifiers; the reader renders it.
--
-- `kind` is a closed vocabulary with a `check`, the same shape as
-- `jobs.preferred_time`. `lib/notifications/kinds.ts` mirrors this list and a
-- Vitest assertion reads this file to keep the two identical — the technique
-- `RESERVED_SLUGS` already uses.
-- ---------------------------------------------------------------------------

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null,
  job_id uuid references public.jobs (id) on delete cascade,
  /** Whoever caused it, where that is a person. Never rendered as a name. */
  actor_id uuid references public.profiles (id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  /** Stamped by the dispatcher. Null means "not yet pushed", not "unread". */
  pushed_at timestamptz,

  constraint notifications_kind_check check (
    kind in (
      -- pro
      'job_in_radius',
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
      -- both
      'message_received'
    )
  )
);

comment on table public.notifications is
  'One thing that happened, addressed to one person. Written only inside the security definer function or trigger that caused the event — no client role has an insert grant. Carries no Hebrew: the copy lives in lib/notifications/messages.ts.';

create index notifications_user_created_idx
  on public.notifications (user_id, created_at desc);

create index notifications_unread_idx
  on public.notifications (user_id) where read_at is null;

-- The dispatcher's own read path. Partial, because the rows it wants are
-- always a vanishing fraction of the table.
create index notifications_unpushed_idx
  on public.notifications (created_at) where pushed_at is null;

alter table public.notifications enable row level security;

-- ---------------------------------------------------------------------------
-- Grants. The shape is `job_locations` for the insert side and
-- `messages.read_at` for the update side, and both for the same reason.
--
-- INSERT: nobody, ever. A row that cannot be forged is what makes "the
-- customer chose you" a record rather than a claim — which matters here more
-- than usual, because the two hours it starts are worth 35 ₪.
--
-- DELETE: nobody. The design (design/screens/pro-5.4-notifications.png) offers
-- "סמן הכל כנקרא" and no delete, and a dispute is judged against the record.
-- ---------------------------------------------------------------------------

revoke all on public.notifications from anon, authenticated;
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;

create policy "notifications: recipient reads own"
  on public.notifications for select to authenticated
  using (user_id = (select auth.uid()));

create policy "notifications: admin reads all"
  on public.notifications for select to authenticated
  using (public.is_admin());

create policy "notifications: recipient marks read"
  on public.notifications for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- `read_at` is the caller's to set and the clock's to say.
--
-- `messages.read_at` accepts whatever timestamp the client sends, which has
-- never mattered because nothing reads it as a time. Here it does — "unread
-- since" is what the badge counts — so the value is pinned, and the trigger
-- holds that line even for a caller who bypasses RLS entirely. Same technique
-- as `price_updates_guard_update`, and the same argument (CLAUDE.md section 3).
-- ---------------------------------------------------------------------------

create function public.notifications_guard_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.user_id is distinct from old.user_id
     or new.kind is distinct from old.kind
     or new.job_id is distinct from old.job_id
     or new.actor_id is distinct from old.actor_id
     or new.payload is distinct from old.payload
     or new.created_at is distinct from old.created_at
     or new.pushed_at is distinct from old.pushed_at then
    raise exception 'only read_at may be updated on a notification'
      using errcode = '42501';
  end if;

  -- Marking read is one-way. Un-reading is not a thing the product does, and
  -- allowing it would make the unread badge a number the reader can inflate.
  new.read_at := coalesce(old.read_at, now());

  return new;
end;
$$;

comment on function public.notifications_guard_update() is
  'read_at is set to now() and every other column is frozen — enforced in a trigger rather than a policy so it holds against a caller that bypasses RLS.';

create trigger notifications_guard_update
  before update on public.notifications
  for each row execute function public.notifications_guard_update();

-- ---------------------------------------------------------------------------
-- 2. push_subscriptions — one row per device.
--
-- **This is deliberately NOT the `saved_places` pattern**, and the difference
-- is worth stating because the two look alike. A saved address is only ever
-- the caller's, so a column default plus an insert grant is enough. A push
-- endpoint is not: a shared family phone, or a pro who signs out and a
-- customer who signs in on the same browser, produces a second account
-- claiming an endpoint that already belongs to the first. Under RLS the second
-- account cannot see the row it must replace, so `on conflict do update`
-- raises instead of taking ownership. **A policy cannot arbitrate a key it
-- cannot see.** Hence a definer function for the write.
-- ---------------------------------------------------------------------------

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth_key text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_success_at timestamptz
);

comment on table public.push_subscriptions is
  'Where to push, per device. Written only through save_push_subscription(), which can reassign an endpoint a shared browser handed to a second account. No admin read policy, on purpose — see the comment on the policies below.';

create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

revoke all on public.push_subscriptions from anon, authenticated;
grant select, delete on public.push_subscriptions to authenticated;

create policy "push_subscriptions: owner reads own"
  on public.push_subscriptions for select to authenticated
  using (user_id = (select auth.uid()));

create policy "push_subscriptions: owner deletes own"
  on public.push_subscriptions for delete to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- There is deliberately NO admin read policy on this table, and it will look
-- inconsistent to somebody tidying up later, so: an endpoint is not a record
-- of what happened, it is a *capability* to push to somebody's device. Every
-- other table here carries "admin reads all" because an admin adjudicates
-- disputes against the record. Nothing is adjudicated against an endpoint.
--
-- Same asymmetry as `job_receipt()` returning `fee_amount` as NULL to the
-- customer: what one party holds is not automatically everyone's to read.
-- ---------------------------------------------------------------------------

create function public.save_push_subscription(
  p_endpoint text,
  p_p256dh text,
  p_auth_key text,
  p_user_agent text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;

  if coalesce(trim(p_endpoint), '') = ''
     or coalesce(trim(p_p256dh), '') = ''
     or coalesce(trim(p_auth_key), '') = '' then
    raise exception 'incomplete subscription' using errcode = '22023';
  end if;

  -- Reassigns rather than refuses. The browser is the authority on its own
  -- endpoint, and if it has handed this one to a different account then that
  -- account is who the device now belongs to.
  insert into public.push_subscriptions
    (user_id, endpoint, p256dh, auth_key, user_agent)
  values
    ((select auth.uid()), p_endpoint, p_p256dh, p_auth_key, p_user_agent)
  on conflict (endpoint) do update
    set user_id = (select auth.uid()),
        p256dh = excluded.p256dh,
        auth_key = excluded.auth_key,
        user_agent = excluded.user_agent
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.save_push_subscription(text, text, text, text) is
  'Register this browser for push, taking ownership of the endpoint if a different account on the same device had it. Definer because RLS cannot arbitrate a unique key the caller cannot see.';

revoke execute on function public.save_push_subscription(text, text, text, text)
  from public, anon;
grant execute on function public.save_push_subscription(text, text, text, text)
  to authenticated;

-- ---------------------------------------------------------------------------
-- 3. notify_user() — the one writer.
--
-- Every insert into `notifications` in this repo goes through here, so "who
-- may create a notification" has one answer and one place to read it. Not
-- granted to any client role: its callers are the definer functions and
-- triggers below, which run as the owner.
--
-- Silently does nothing when there is nobody to tell. A notification aimed at
-- a null user is not an error worth aborting somebody's job posting for.
-- ---------------------------------------------------------------------------

create function public.notify_user(
  p_user_id uuid,
  p_kind text,
  p_job_id uuid default null,
  p_actor_id uuid default null,
  p_payload jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_user_id is null then return; end if;

  insert into public.notifications (user_id, kind, job_id, actor_id, payload)
  values (p_user_id, p_kind, p_job_id, p_actor_id, coalesce(p_payload, '{}'::jsonb));
end;
$$;

comment on function public.notify_user(uuid, text, uuid, uuid, jsonb) is
  'The only path into public.notifications. Called from the definer functions and triggers that own each transition; no client role may execute it.';

revoke execute on function public.notify_user(uuid, text, uuid, uuid, jsonb)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. pros_serving_job() — the feed predicate, asked from the other side.
--
-- `pro_serves_job()` is written against `(select auth.uid())` and answers "does
-- the *caller* serve this job". The fan-out needs the inverse: given a job,
-- who serves it. Same three conditions as the RLS policy plus the trade filter
-- `open_jobs_for_pro()` applies, so "you were told about it" and "it is in
-- your feed" cannot disagree.
-- ---------------------------------------------------------------------------

create function public.pros_serving_job(p_job_id uuid)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.user_id
    from public.pro_profiles p
    join public.jobs j on j.id = p_job_id
   where p.verification_status = 'verified'
     and p.accepting_jobs
     and p.service_point is not null
     and extensions.st_dwithin(
           p.service_point,
           j.location,
           least(p.radius_km, j.search_radius_km) * 1000
         )
     and (
       not exists (
         select 1 from public.pro_categories pc where pc.pro_id = p.user_id
       )
       or exists (
         select 1 from public.pro_categories pc
          where pc.pro_id = p.user_id and pc.category_id = j.category_id
       )
     );
$$;

comment on function public.pros_serving_job(uuid) is
  'Which verified, accepting pros would receive this job — the inverse of pro_serves_job(), for the fan-out. Mirrors open_jobs_for_pro()''s predicate so the notification and the feed agree.';

revoke execute on function public.pros_serving_job(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. The four triggers.
--
-- Only where no definer function owns the transition. `bids` and `messages`
-- are the two tables a client writes to directly, so there is nothing to
-- extend and an app-layer call could be skipped by a second write path. The
-- other two hang off an insert that happens exactly once.
--
-- AFTER INSERT only. Every UPDATE on `bids` is already somebody's function.
-- ---------------------------------------------------------------------------

create function public.notify_bid_received()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_customer uuid;
begin
  select customer_id into v_customer from public.jobs where id = new.job_id;

  -- The first offer is the one that changes the customer's day; the fourth is
  -- a number going up. Different kinds so the copy can differ.
  perform public.notify_user(
    v_customer,
    case when public.job_bid_count(new.job_id) = 1
      then 'first_bid_received' else 'bid_received' end,
    new.job_id,
    new.pro_id,
    jsonb_build_object('bid_id', new.id)
  );

  return null;
end;
$$;

create trigger bids_notify_customer
  after insert on public.bids
  for each row execute function public.notify_bid_received();

create function public.notify_message_received()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_recipient uuid;
begin
  -- A thread is (job, pro). The other side of *this* thread is the customer
  -- when the pro wrote, and this thread's pro when the customer wrote — which
  -- is what stops a pro being told about a conversation that is not theirs.
  if new.sender_id = new.pro_id then
    select customer_id into v_recipient from public.jobs where id = new.job_id;
  else
    v_recipient := new.pro_id;
  end if;

  perform public.notify_user(
    v_recipient, 'message_received', new.job_id, new.sender_id,
    jsonb_build_object('pro_id', new.pro_id)
  );

  return null;
end;
$$;

create trigger messages_notify_recipient
  after insert on public.messages
  for each row execute function public.notify_message_received();

-- ---------------------------------------------------------------------------
-- The fan-out. One insert, many recipients — the only event here with no
-- recipient on the row that changed.
--
-- A trigger and not a sweep: a sweep needs a watermark, and worse, a pro who
-- widened their radius would be told about week-old jobs, at which point
-- "a call entered your radius" stops meaning what it says.
--
-- The cost lands inside the customer's `postJob` transaction. It is one
-- set-based insert behind the GiST index that already serves the feed, and it
-- is the thing to measure first if posting ever gets slow (`npm run
-- perf:postgis`). The escape hatch, if it ever bites, is to move this one kind
-- to a sweep — safe precisely because it is the only kind with no clock on it.
-- ---------------------------------------------------------------------------

create function public.notify_pros_in_radius()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.notifications (user_id, kind, job_id, actor_id, payload)
  select pro_id, 'job_in_radius', new.id, new.customer_id,
         jsonb_build_object('category_id', new.category_id)
    from public.pros_serving_job(new.id) as pro_id;

  return null;
end;
$$;

create trigger jobs_notify_pros_in_radius
  after insert on public.jobs
  for each row execute function public.notify_pros_in_radius();

-- ---------------------------------------------------------------------------
-- "בעל המקצוע בדרך" hangs off the FIRST location row and not off
-- report_job_location(), which runs every fifteen seconds while the tab is
-- open. `job_locations.job_id` is the primary key, so every later ping is an
-- update and this fires exactly once per job.
-- ---------------------------------------------------------------------------

create function public.notify_pro_on_the_way()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_customer uuid;
begin
  select customer_id into v_customer from public.jobs where id = new.job_id;

  perform public.notify_user(
    v_customer, 'pro_on_the_way', new.job_id, new.pro_id, '{}'::jsonb
  );

  return null;
end;
$$;

create trigger job_locations_notify_customer
  after insert on public.job_locations
  for each row execute function public.notify_pro_on_the_way();

-- ---------------------------------------------------------------------------
-- 6. The transitions that already have an owner.
--
-- Each of these is `create or replace` on a function that existed before this
-- phase, with the notification written into the statement that causes the
-- event. The alternative — a row trigger per table — was rejected for one
-- concrete reason, and `select_bid()` is where it shows: it releases the
-- previous holder with an UPDATE that is byte-identical to the one in
-- `withdraw_bid_selection()`. A trigger sees `selected -> pending` in both and
-- cannot tell "the customer chose somebody else" from "the customer took it
-- back". The function has the decision in hand; the trigger would guess.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.select_bid(p_bid_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_bid public.bids;
  v_job public.jobs;
  v_released uuid;
begin
  select * into v_bid from public.bids b where b.id = p_bid_id;
  if v_bid is null then
    raise exception 'no such bid' using errcode = 'P0002';
  end if;

  select * into v_job from public.jobs j where j.id = v_bid.job_id;

  if v_job.customer_id <> (select auth.uid()) then
    raise exception 'only the customer who posted this job may choose a bid'
      using errcode = '42501';
  end if;

  -- Pressing "בחר" twice on the same card is not a second decision.
  if v_bid.status = 'selected' and v_bid.accept_deadline > now() then
    return p_bid_id;
  end if;

  -- Once a pro has accepted, the price is agreed and only a price_update may
  -- move it. That is the line this check holds.
  if v_job.selected_bid_id is not null
     or v_job.status not in ('open', 'bidding', 'awaiting_pro') then
    raise exception 'a pro has already taken this job' using errcode = '22023';
  end if;

  -- Re-checked here rather than trusted from the sweep: a bid that lapsed one
  -- second ago is not selectable even if no sweep has run since.
  if v_bid.status <> 'pending' or v_bid.expires_at <= now() then
    raise exception 'this bid is no longer valid' using errcode = '22023';
  end if;

  -- Release whoever was holding the job before this call, if anyone was, and
  -- tell them. This UPDATE is byte-identical to the one in
  -- withdraw_bid_selection(), which is exactly why the notification is written
  -- here and not in a row trigger: the trigger sees `selected -> pending` in
  -- both cases and cannot tell "the customer chose somebody else" from "the
  -- customer took it back". The function has the decision in hand.
  for v_released in
    update public.bids
       set status = case when expires_at <= now() then 'expired' else 'pending' end,
           accept_deadline = null
     where job_id = v_bid.job_id
       and status = 'selected'
    returning pro_id
  loop
    perform public.notify_user(
      v_released, 'selection_moved', v_bid.job_id, v_job.customer_id
    );
  end loop;

  update public.bids
     set status = 'selected',
         accept_deadline = now() + public.bid_accept_window()
   where id = p_bid_id;

  update public.jobs
     set status = 'awaiting_pro'
   where id = v_bid.job_id;

  -- The one notification this whole phase exists for: two hours are now
  -- running, and 35 ₪ ride on the pro noticing.
  perform public.notify_user(
    v_bid.pro_id, 'bid_selected', v_bid.job_id, v_job.customer_id,
    jsonb_build_object('bid_id', v_bid.id, 'price', v_bid.price)
  );

  return p_bid_id;
end;
$function$;

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

  -- The fee is read from the function, never from the caller. base_price is
  -- the price this pro is taking the job at; what it ends up being at closing
  -- time is complete_job()'s business, and does not change what is charged.
  insert into public.job_fees (job_id, pro_id, base_price, fee_amount)
  values (v_bid.job_id, v_bid.pro_id, v_bid.price, public.job_acceptance_fee())
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

CREATE OR REPLACE FUNCTION public.decline_job(p_bid_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_bid public.bids;
  v_customer uuid;
begin
  select * into v_bid from public.bids b where b.id = p_bid_id;
  if v_bid is null then
    raise exception 'no such bid' using errcode = 'P0002';
  end if;

  if v_bid.pro_id <> (select auth.uid()) then
    raise exception 'only the pro this job was offered to may decline it'
      using errcode = '42501';
  end if;

  if v_bid.status <> 'selected' then
    raise exception 'this job has not been offered to you' using errcode = '22023';
  end if;

  update public.bids
     set status = 'declined', accept_deadline = null
   where id = p_bid_id;

  update public.jobs
     set status = 'bidding'
   where id = v_bid.job_id
     and status = 'awaiting_pro';

  select customer_id into v_customer from public.jobs where id = v_bid.job_id;

  perform public.notify_user(
    v_customer, 'pro_declined', v_bid.job_id, v_bid.pro_id
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.withdraw_bid_selection(p_job_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_job public.jobs;
  v_released uuid;
begin
  if not public.is_job_owner(p_job_id) then
    raise exception 'not your job' using errcode = '42501';
  end if;

  select * into v_job from public.jobs j where j.id = p_job_id;

  if v_job.status <> 'awaiting_pro' then
    raise exception 'this job is not waiting for a pro to answer'
      using errcode = '22023';
  end if;

  -- Byte-identical to the release inside select_bid(), and that is the point:
  -- a row trigger sees `selected -> pending` in both and cannot tell "the
  -- customer changed their mind" from "the customer went to somebody else".
  -- Two different pieces of news, so two different kinds, written by the
  -- function that knows which one this is.
  update public.bids
     set status = case when expires_at <= now() then 'expired' else 'pending' end,
         accept_deadline = null
   where job_id = p_job_id
     and status = 'selected'
  returning pro_id into v_released;

  update public.jobs set status = 'bidding' where id = p_job_id;

  perform public.notify_user(
    v_released, 'selection_withdrawn', p_job_id, v_job.customer_id
  );
end;
$function$;

create or replace function public.expire_stale_selections()
returns integer
language sql
security definer
set search_path = ''
as $$
  with lapsed as (
    update public.bids
       set status = 'expired', accept_deadline = null
     where status = 'selected'
       and accept_deadline <= now()
    returning job_id, pro_id
  ),
  reopened as (
    update public.jobs j
       set status = 'bidding'
      from lapsed
     where j.id = lapsed.job_id
       and j.status = 'awaiting_pro'
    returning j.id, j.customer_id
  ),
  -- Both sides find out, in two different sentences: the pro lost work they
  -- were given, and the customer is waiting on somebody who is no longer
  -- coming. Written here rather than left to the sweep's caller because a
  -- lapse has no other owner — it is the one transition nobody performs.
  told as (
    insert into public.notifications (user_id, kind, job_id)
    select pro_id, 'selection_lapsed_pro', job_id from lapsed
    union all
    select customer_id, 'selection_lapsed_customer', id from reopened
    returning 1
  )
  select count(*)::int from lapsed;
$$;

CREATE OR REPLACE FUNCTION public.set_pro_verification(p_pro_id uuid, p_status text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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

  -- The decision the pro has been refreshing a page for. Until now the
  -- product promised an SMS here and sent nothing.
  if p_status in ('verified', 'rejected') then
    perform public.notify_user(
      p_pro_id,
      case when p_status = 'verified' then 'pro_verified' else 'pro_rejected' end,
      null,
      (select auth.uid())
    );
  end if;

  return p_status;
end;
$function$;

CREATE OR REPLACE FUNCTION public.request_price_update(p_job_id uuid, p_new_price numeric, p_photo_url text, p_note text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_job public.jobs;
  v_original numeric;
  v_id uuid;
begin
  select * into v_job from public.jobs j where j.id = p_job_id;

  if v_job is null or not public.is_assigned_pro(p_job_id) then
    raise exception 'only the pro assigned to this job may ask to change its price'
      using errcode = '42501';
  end if;

  -- Phase 7: an admin can take this away from a specific pro
  -- (product-spec.md 5.4). Checked where the row is written, so there is no
  -- version of the client that can get around it.
  if exists (
    select 1 from public.pro_profiles pp
     where pp.user_id = (select auth.uid()) and pp.price_updates_blocked
  ) then
    raise exception 'field price updates are blocked for this pro'
      using errcode = '42501';
  end if;

  if v_job.status not in ('assigned', 'in_progress') then
    raise exception 'this job is not in progress' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.price_updates pu
     where pu.job_id = p_job_id and pu.status = 'pending'
  ) then
    raise exception 'a price update is already waiting for the customer'
      using errcode = '22023';
  end if;

  if p_photo_url is null
     or split_part(p_photo_url, '/', 1) <> (select auth.uid())::text
     or split_part(p_photo_url, '/', 2) <> p_job_id::text
     or split_part(p_photo_url, '/', 3) = ''
  then
    raise exception 'the photo must be one you uploaded for this job'
      using errcode = '22023';
  end if;

  v_original := public.job_effective_price(p_job_id);

  if v_original is null then
    raise exception 'this job has no agreed price yet' using errcode = '22023';
  end if;

  insert into public.price_updates
    (job_id, pro_id, original_price, new_price, photo_url, note)
  values
    (p_job_id, (select auth.uid()), v_original, p_new_price, p_photo_url,
     nullif(btrim(coalesce(p_note, '')), ''))
  returning id into v_id;

  -- The customer side's urgent one: a question about money, waiting on them,
  -- on a screen they may well have closed.
  perform public.notify_user(
    v_job.customer_id, 'price_update_requested', p_job_id, (select auth.uid()),
    jsonb_build_object('price_update_id', v_id)
  );

  return v_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.decide_price_update(p_id uuid, p_approve boolean)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_row public.price_updates;
begin
  select * into v_row from public.price_updates pu where pu.id = p_id;

  if v_row is null or not public.is_job_owner(v_row.job_id) then
    raise exception 'only the customer who posted this job may decide its price updates'
      using errcode = '42501';
  end if;

  if v_row.status <> 'pending' then
    raise exception 'this price update has already been decided'
      using errcode = '22023';
  end if;

  update public.price_updates
     set status = case when p_approve then 'approved' else 'rejected' end,
         decided_at = now()
   where id = p_id;

  perform public.notify_user(
    v_row.pro_id,
    case when p_approve then 'price_update_approved' else 'price_update_rejected' end,
    v_row.job_id,
    (select auth.uid()),
    jsonb_build_object('price_update_id', p_id)
  );

  return case when p_approve then 'approved' else 'rejected' end;
end;
$function$;

CREATE OR REPLACE FUNCTION public.mark_job_in_progress(p_job_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_status text;
  v_customer uuid;
begin
  if not public.is_assigned_pro(p_job_id) then
    raise exception 'only the pro assigned to this job may start it'
      using errcode = '42501';
  end if;

  select j.status into v_status from public.jobs j where j.id = p_job_id;

  if v_status = 'in_progress' then
    return v_status;
  end if;

  if v_status <> 'assigned' then
    raise exception 'this job is not waiting to be started' using errcode = '22023';
  end if;

  update public.jobs set status = 'in_progress' where id = p_job_id;

  select customer_id into v_customer from public.jobs where id = p_job_id;

  perform public.notify_user(
    v_customer, 'pro_arrived', p_job_id, (select auth.uid())
  );

  return 'in_progress';
end;
$function$;

CREATE OR REPLACE FUNCTION public.complete_job(p_job_id uuid, p_payment_method text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_job public.jobs;
  v_total numeric;
  v_id uuid;
begin
  if not public.is_assigned_pro(p_job_id) then
    raise exception 'only the pro assigned to this job may close it'
      using errcode = '42501';
  end if;

  select * into v_job from public.jobs j where j.id = p_job_id;

  -- Already closed: hand back the row that exists rather than touching it
  -- again, and rather than raising on a button pressed twice.
  if v_job.status = 'completed' then
    select f.id into v_id from public.job_fees f where f.job_id = p_job_id;
    return v_id;
  end if;

  if v_job.status not in ('assigned', 'in_progress') then
    raise exception 'this job is not one that can be completed'
      using errcode = '22023';
  end if;

  if p_payment_method is null
     or p_payment_method not in ('cash', 'bit', 'paybox', 'bank_transfer') then
    raise exception 'unknown payment method' using errcode = '22023';
  end if;

  -- A request the customer never answered is settled here rather than left
  -- pending on a finished job. It changes no number — job_effective_price()
  -- has never counted a pending row — it closes the question.
  update public.price_updates
     set status = 'rejected', decided_at = now()
   where job_id = p_job_id and status = 'pending';

  v_total := public.job_effective_price(p_job_id);

  if v_total is null then
    raise exception 'this job has no agreed price' using errcode = '22023';
  end if;

  update public.job_fees
     set total_price = v_total,
         payment_method = p_payment_method,
         completed_at = now()
   where job_id = p_job_id
  returning id into v_id;

  -- Every assigned job has a fee row, because accept_job() is the only way to
  -- become assigned and it writes one. If that is ever untrue, it is a bug in
  -- this migration and not something to paper over with an insert here.
  if v_id is null then
    raise exception 'this job has no fee row to complete' using errcode = '22023';
  end if;

  update public.jobs set status = 'completed' where id = p_job_id;

  update public.pro_profiles
     set jobs_completed_count = jobs_completed_count + 1
   where user_id = (select auth.uid());

  perform public.notify_user(
    v_job.customer_id, 'job_completed', p_job_id, (select auth.uid())
  );

  return v_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.submit_job_review(p_job_id uuid, p_rating integer, p_comment text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_status text;
  v_id uuid;
  v_pro uuid;
begin
  if not public.is_job_owner(p_job_id) then
    raise exception 'only the customer who posted this job may rate it'
      using errcode = '42501';
  end if;

  select j.status into v_status from public.jobs j where j.id = p_job_id;

  if v_status <> 'completed' then
    raise exception 'a job can only be rated once it is finished'
      using errcode = '22023';
  end if;

  if p_rating is null or p_rating < 1 or p_rating > 5 then
    raise exception 'a rating is one to five stars' using errcode = '22023';
  end if;

  insert into public.reviews (job_id, rating, comment)
  values (p_job_id, p_rating, nullif(btrim(coalesce(p_comment, '')), ''))
  on conflict (job_id) do update
    set rating = excluded.rating,
        comment = excluded.comment
  returning id into v_id;

  -- Through jobs.selected_bid_id, which is what "assigned" means in this
  -- schema — the same definition is_assigned_pro() uses.
  select b.pro_id into v_pro
    from public.jobs j
    join public.bids b on b.id = j.selected_bid_id
   where j.id = p_job_id;

  perform public.notify_user(
    v_pro, 'review_received', p_job_id, (select auth.uid()),
    jsonb_build_object('rating', p_rating)
  );

  return v_id;
end;
$function$;


-- ---------------------------------------------------------------------------
-- 7. "הבחירה שלך עומדת לפוג" — the one event with no row change at all.
--
-- Nothing happens when `accept_deadline` crosses T-30min, so unlike everything
-- above this genuinely needs a sweep. It is honest housekeeping: a warning
-- that never fires leaves the pro exactly where today's product leaves them,
-- and `accept_job()` still re-reads the deadline itself. Nothing depends on it.
--
-- `lapse_warned_at` has no client grant, for the same reason `accept_deadline`
-- has none: it is the clock's to say.
-- ---------------------------------------------------------------------------

alter table public.bids add column lapse_warned_at timestamptz;

comment on column public.bids.lapse_warned_at is
  'When the pro was warned their two-hour window is nearly up. Set by warn_expiring_selections(); no client role may write it.';

-- ---------------------------------------------------------------------------
-- `bids_guard_update` has to learn about the new column first, and the reason
-- is worth writing down because the test is what found it.
--
-- The guard refuses any update to a bid that is not `pending`, unless the
-- update is the status itself — which is right: a price cannot be edited after
-- the offer has been chosen. But `lapse_warned_at` is written on a bid that is
-- `selected` by definition, and changes no status, so the sweep below would
-- have raised "bid is no longer editable" every five minutes in production and
-- nowhere else. It is a column no client role can write, so letting it through
-- widens nothing.
-- ---------------------------------------------------------------------------

create or replace function public.bids_guard_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    return new;
  end if;

  -- Housekeeping on a bid that is, by definition, already selected. Ungranted
  -- to every client role, so this is the sweep's own column and nobody else's.
  if new.lapse_warned_at is distinct from old.lapse_warned_at
     and new.price is not distinct from old.price
     and new.eta_minutes is not distinct from old.eta_minutes
     and new.note is not distinct from old.note then
    return new;
  end if;

  if old.status <> 'pending' or old.expires_at <= now() then
    raise exception 'bid is no longer editable' using errcode = '22023';
  end if;

  if new.price is distinct from old.price
     or new.eta_minutes is distinct from old.eta_minutes
     or new.note is distinct from old.note
  then
    new.expires_at := now() + interval '45 minutes';
  end if;

  return new;
end;
$$;

create function public.warn_expiring_selections()
returns integer
language sql
security definer
set search_path = ''
as $$
  with warned as (
    update public.bids
       set lapse_warned_at = now()
     where status = 'selected'
       and lapse_warned_at is null
       and accept_deadline between now() and now() + interval '30 minutes'
    returning pro_id, job_id
  ),
  told as (
    insert into public.notifications (user_id, kind, job_id)
    select pro_id, 'selection_expiring', job_id from warned
    returning 1
  )
  select count(*)::int from warned;
$$;

comment on function public.warn_expiring_selections() is
  'Warns a pro once, thirty minutes before their acceptance window lapses. Housekeeping: accept_job() re-reads the deadline itself, so nothing depends on this having run.';

revoke execute on function public.warn_expiring_selections() from public, anon;
grant execute on function public.warn_expiring_selections() to authenticated;

-- ---------------------------------------------------------------------------
-- 8. Delivery.
--
-- The row above is the product. This is transport, and the split is what keeps
-- the rule in CLAUDE.md section 2 intact: `/pro/notifications` is correct with
-- everything below switched off, and the sweep only ever stamps `pushed_at`.
--
-- **Why a sweep and not a per-row trigger.** A burst is the normal case here —
-- three pros answering within a second, a chat exchange, one job landing in
-- forty feeds. Per-row would be forty outbound requests inside the customer's
-- `postJob` transaction and forty buzzes on a phone. Batched is one of each.
--
-- **Why pg_net to our own route handler and not an Edge Function.** There is
-- no `supabase/functions/` in this repo and never has been; Phase 4 chose
-- pg_cron over a scheduled Edge Function precisely to avoid a second deploy
-- target. The decisive extra cost is that the Hebrew would then exist twice —
-- once in Deno for the push title, once in TypeScript for the in-app row — and
-- `lib/content/` exists so copy has one home.
--
-- **What the body carries.** Everything the dispatcher needs: the kind, the
-- payload, and the recipient's endpoint and keys. So the route handler never
-- queries the database and holds no credential for it. That is what keeps
-- `SUPABASE_SERVICE_ROLE_KEY` unread anywhere in this repo — the property
-- lib/actions/demo.ts fought for in Phase 8.
--
-- Absent configuration is not an error: the function returns 0 and says so.
-- Same posture as ALLOW_NO_MAPS_KEY, and what lets CI and a fresh local stack
-- run with no secrets at all.
-- ---------------------------------------------------------------------------

create function public.dispatch_pending_pushes()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
  v_batch jsonb;
  v_ids uuid[];
begin
  select decrypted_secret into v_url
    from vault.decrypted_secrets where name = 'notifications_dispatch_url';
  select decrypted_secret into v_secret
    from vault.decrypted_secrets where name = 'notifications_dispatch_secret';

  if v_url is null or v_secret is null then
    -- Loud, because the failure mode otherwise is silence: the app keeps
    -- working in-app-only and nobody notices push never arrives.
    raise notice 'dispatch_pending_pushes: no vault secrets, nothing pushed';
    return 0;
  end if;

  -- Nothing stale ever buzzes. A notification an hour old has been read on the
  -- screen already, or has stopped mattering.
  with due as (
    select n.id, n.kind, n.job_id, n.payload,
           s.endpoint, s.p256dh, s.auth_key
      from public.notifications n
      join public.push_subscriptions s on s.user_id = n.user_id
     where n.pushed_at is null
       and n.read_at is null
       and n.created_at > now() - interval '1 hour'
     limit 200
  )
  select jsonb_agg(to_jsonb(due)), array_agg(distinct due.id)
    into v_batch, v_ids
    from due;

  if v_ids is null then return 0; end if;

  -- Stamped before the request, not after: pg_net is fire-and-forget and this
  -- function has no way to learn the outcome. Stamping first means a
  -- dispatcher outage loses those pushes; stamping after would mean a slow one
  -- sends them repeatedly. The in-app row survives either way, and a duplicate
  -- buzz is worse than a missed one.
  update public.notifications set pushed_at = now() where id = any (v_ids);

  perform net.http_post(
    url := v_url,
    body := jsonb_build_object('notifications', v_batch),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Handy-Dispatch', v_secret
    )
  );

  return array_length(v_ids, 1);
end;
$$;

comment on function public.dispatch_pending_pushes() is
  'Batches unread, unpushed notifications with their recipients'' push endpoints and POSTs them to the app''s dispatch route. Transport only — the notification itself is already a row, readable whether or not this ever runs.';

revoke execute on function public.dispatch_pending_pushes() from public, anon, authenticated;

create function public.prune_push_subscriptions()
returns integer
language sql
security definer
set search_path = ''
as $$
  with gone as (
    delete from public.push_subscriptions
     where last_success_at is null
       and created_at < now() - interval '90 days'
    returning 1
  )
  select count(*)::int from gone;
$$;

comment on function public.prune_push_subscriptions() is
  'Drops endpoints that never once accepted a push. The browser is the first authority on a dead endpoint (pushsubscriptionchange) and the dispatch route the second (410 Gone); this is the backstop for a device that was simply thrown away.';

revoke execute on function public.prune_push_subscriptions() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Scheduling, guarded exactly as Phase 4 and Phase 10 guard theirs, so
-- `npm run db:reset` applies on a Postgres with neither extension.
-- ---------------------------------------------------------------------------

do $$
begin
  perform cron.schedule(
    'handy-warn-expiring-selections',
    '*/5 * * * *',
    $cron$ select public.warn_expiring_selections(); $cron$
  );
exception when others then
  raise notice 'pg_cron not available; the acceptance warning will not sweep (%). Nothing depends on it: accept_job() re-reads the deadline itself.', sqlerrm;
end $$;

do $$
begin
  perform cron.schedule(
    'handy-dispatch-pushes',
    '* * * * *',
    $cron$ select public.dispatch_pending_pushes(); $cron$
  );
exception when others then
  raise notice 'pg_cron/pg_net not available; nothing will be pushed (%). The notification centre is unaffected — every row is written in the transaction that caused it.', sqlerrm;
end $$;

-- ---------------------------------------------------------------------------
-- 9. Realtime, so the header badge moves in an open tab without a poll.
--
-- Realtime applies the subscriber's own RLS before delivering a row, so
-- publishing this table widens nothing: a pro is woken only by their own.
-- ---------------------------------------------------------------------------

alter publication supabase_realtime add table public.notifications;

-- ---------------------------------------------------------------------------
-- 10. `/pro/notifications` is now one of the app's own paths, so no pro may
-- take it as their public slug.
--
-- The constraint has to be dropped and rebuilt because that is the only way to
-- change a `check`. `lib/validation/publicProfile.ts` holds the same list, and
-- `lib/validation/__tests__/publicProfile.test.ts` reads THIS file to keep the
-- two identical — which is why the test's migration path has to move with it.
-- ---------------------------------------------------------------------------

alter table public.pro_profiles
  drop constraint pro_profiles_public_slug_format_check;

alter table public.pro_profiles
  add constraint pro_profiles_public_slug_format_check
  check (
    public_slug is null
    or (
      public_slug ~ '^[a-z0-9]([a-z0-9-]{1,38})[a-z0-9]$'
      and public_slug not like '%--%'
      and public_slug not in (
        'login', 'dashboard', 'join', 'onboarding', 'jobs', 'offers',
        'messages', 'notifications', 'settings', 'my-jobs', 'wallet',
        'profile', 'help', 'api', 'admin', 'new', 'search', 'about',
        'terms', 'privacy'
      )
    )
  );
