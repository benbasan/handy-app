-- Phase 10 — אישור בעל המקצוע ודמי קבלת עבודה קבועים.
--
-- Two changes to the business model that meet at one point, which is why they
-- are one migration and not two. The customer's choice no longer assigns a job
-- — it *offers* it, and the pro has two hours to take it. And Handy's cut stops
-- being 12% of a closed job: it is a flat 35 ₪, charged the moment the pro
-- accepts. The instant money enters moves from the end of the flow to its
-- beginning, so every function that had "the price at closing time" in its
-- head has to be re-read.
--
-- Seven things happen here, and — as in every phase before it — each exists
-- because the UI must not be the thing enforcing it:
--
--  1. **`select_bid()` stops being the end of the story.** It marks the chosen
--     bid `selected`, stamps a two-hour `accept_deadline` and moves the job to
--     `awaiting_pro`. It deliberately does NOT write `jobs.selected_bid_id`
--     and does NOT reject the rivals. Both of those now belong to the pro's
--     answer, because until there is an answer there is no agreement.
--
--  2. **`selected_bid_id` is what "assigned" means, so it waits for the
--     acceptance.** `is_assigned_pro()` is defined through that column, and
--     the chat policies, the live location, `request_price_update()`,
--     `complete_job()` and the receipt are all defined through *it*. Had the
--     column been written at selection time, a pro who never answered would
--     have held every power of the assigned pro. Not one of those functions
--     changes in this migration, and that is the reason.
--
--  3. **One clock replaces another.** A bid is valid 45 minutes (business rule
--     6), but once the customer picks it the pro gets two hours to answer, and
--     the offer must not lapse underneath them mid-window.
--     `expire_stale_bids()` only ever touched `status = 'pending'`, so a
--     `selected` row is already outside its reach; `accept_job()` checks
--     `accept_deadline`, never `expires_at`.
--
--  4. **The rivals stay alive, and the job stays in the feed.** A job with an
--     unanswered offer is not committed to anybody, so it keeps taking new
--     bids and the customer may change their mind at any moment
--     (`withdraw_bid_selection()`, or simply calling `select_bid()` again).
--     This is what makes a two-hour window survivable for the customer: they
--     are never holding an empty screen while they wait.
--
--  5. **The 35 ₪ is written by `accept_job()` and by nothing else.** Same
--     treatment the 12% had: no client role has ever held an INSERT grant on
--     the ledger, and the amount is read from `job_acceptance_fee()` inside
--     the function rather than accepted from the caller (CLAUDE.md section 3,
--     money is server-authoritative).
--
--  6. **The ledger is renamed, because "commission" is now a false word.**
--     `commission_charges` → `job_fees`, `commission_amount` → `fee_amount`.
--     Its row is created at acceptance and *completed* later, so
--     `total_price`, `payment_method` and the new `completed_at` are null
--     until `complete_job()` fills them. Every reader that used to assume "a
--     row here means a finished job" had to be told otherwise — that is most
--     of section 10 below.
--
--  7. **The fee is never refunded** (decided with the user, 8.9.2026). So
--     `resolve_dispute()` does not appear in this migration at all: a credit
--     to the customer and the fee charged to the pro are two different
--     questions, and only the first one has an answer in this product.
--
-- Screens: design/screens/pro-2.4-my-bids.png (the "נבחרת" card is new),
-- customer-2.2-compare-bids.png (the chosen card becomes a wait), and every
-- screen that used to print 12%.

-- ---------------------------------------------------------------------------
-- 1. The two numbers
-- ---------------------------------------------------------------------------

/*
 * 35 ₪ per accepted job, charged to the pro — the replacement for business
 * rule 3, decided with the user on 8.9.2026: flat across every category and
 * every price, charged at acceptance, never refunded.
 *
 * A function for exactly the reason commission_rate() was one: the number
 * appears on the bid form, in the ledger row, on the receipt, in the wallet
 * and on the public pricing page, and one of those drifting from the others is
 * a bug nobody notices until a pro reads their statement.
 */
create function public.job_acceptance_fee()
returns numeric
language sql
immutable
as $$ select 35::numeric $$;

comment on function public.job_acceptance_fee() is
  'Handy''s fee for taking a job: a flat 35 ₪, charged to the pro at the moment they accept, never refunded.';

-- Reachable without a session on purpose: /pricing prints this number to a
-- stranger. Revoked from public first, because a bare `grant` on top of the
-- default PUBLIC execute is not a decision about who may call it.
revoke execute on function public.job_acceptance_fee() from public;
grant execute on function public.job_acceptance_fee() to authenticated, anon;

-- There is no percentage of anything any more. Dropped rather than left in
-- place, so that nothing can quietly keep calling it.
drop function public.commission_rate();

/*
 * How long the pro has to answer. Two hours, and long on purpose: there is no
 * push notification in this product yet (CLAUDE.md section 9), so the window
 * has to survive a pro who is under a sink with their phone in a pocket.
 *
 * The other half of making that survivable is that the customer is not stuck
 * for those two hours — see section 4.
 */
create function public.bid_accept_window()
returns interval
language sql
immutable
as $$ select interval '2 hours' $$;

comment on function public.bid_accept_window() is
  'How long a chosen pro has to accept before the selection lapses: two hours. Long because nothing notifies them yet.';

revoke execute on function public.bid_accept_window() from public, anon;
grant execute on function public.bid_accept_window() to authenticated;

-- ---------------------------------------------------------------------------
-- 2. The ledger: commission_charges -> job_fees
--
-- A rename rather than a new table, because it is the same fact — what Handy
-- charged for one job — measured differently. Two tables would have meant two
-- answers to "what did this job earn Handy", and a receipt that has to pick.
--
-- The shape change is the interesting half: the row is now born at acceptance,
-- when the final price and the payment method are not yet knowable, and is
-- completed later. Three columns therefore become nullable-until-closing.
-- ---------------------------------------------------------------------------

alter table public.commission_charges rename to job_fees;
alter table public.job_fees rename column commission_amount to fee_amount;

alter index commission_charges_pkey rename to job_fees_pkey;
alter index commission_charges_job_id_key rename to job_fees_job_id_key;
alter index commission_charges_pro_id_idx rename to job_fees_pro_id_idx;

alter table public.job_fees
  rename constraint commission_charges_base_price_check to job_fees_base_price_check;
alter table public.job_fees
  rename constraint commission_charges_total_price_check to job_fees_total_price_check;
alter table public.job_fees
  rename constraint commission_charges_commission_amount_check to job_fees_fee_amount_check;
alter table public.job_fees
  rename constraint commission_charges_payment_method_check to job_fees_payment_method_check;
alter table public.job_fees
  rename constraint commission_charges_job_id_fkey to job_fees_job_id_fkey;
alter table public.job_fees
  rename constraint commission_charges_pro_id_fkey to job_fees_pro_id_fkey;

-- Null until the pro closes the job. The payment_method check still holds for
-- the rows that have one: `null in ('cash', ...)` is null, not false.
alter table public.job_fees alter column total_price drop not null;
alter table public.job_fees alter column payment_method drop not null;

alter table public.job_fees
  add column completed_at timestamptz;

comment on table public.job_fees is
  'One row per accepted job: what Handy charged the pro for taking it. Written by accept_job(), completed by complete_job(), never refunded. Read-only to every client role.';

comment on column public.job_fees.charged_at is
  'When the pro accepted the job — which is when the fee was charged, not when the work finished.';

comment on column public.job_fees.completed_at is
  'When the pro closed the job. Null on a job that was accepted and is still open, which is why every "what did I earn" reader filters on it.';

comment on column public.job_fees.base_price is
  'The accepted bid''s price, as it stood at acceptance.';

comment on column public.job_fees.total_price is
  'job_effective_price() at closing time — the agreed price plus every approved field update. Null until then.';

-- Every historical row is a closed job under the old model: it was written by
-- the old complete_job(), which only ever ran at closing time. The amount
-- stays whatever was actually charged — rewriting history to 35 ₪ would be a
-- lie about money that changed hands.
update public.job_fees set completed_at = charged_at where completed_at is null;

-- The policies carry the table's name in their own, and a policy that says
-- "commission_charges" on a table called job_fees is a policy nobody will find.
drop policy "commission_charges: pro reads own" on public.job_fees;
drop policy "commission_charges: admin reads all" on public.job_fees;

create policy "job_fees: pro reads own"
  on public.job_fees for select to authenticated
  using (pro_id = (select auth.uid()));

create policy "job_fees: admin reads all"
  on public.job_fees for select to authenticated
  using (public.is_admin());

-- Unchanged in substance, restated because the table changed name: read-only
-- for every client role, and customers hold no policy at all — what Handy
-- charges the pro is between Handy and the pro.
revoke all on public.job_fees from anon, authenticated;
grant select on public.job_fees to authenticated;

-- ---------------------------------------------------------------------------
-- 3. The vocabulary of an offer that has to be answered
-- ---------------------------------------------------------------------------

alter table public.jobs drop constraint jobs_status_check;
alter table public.jobs add constraint jobs_status_check
  check (status in (
    'draft', 'open', 'bidding', 'awaiting_pro',
    'assigned', 'in_progress', 'completed', 'cancelled'
  ));

comment on column public.jobs.status is
  'awaiting_pro sits between bidding and assigned: the customer has chosen, the pro has not answered yet. The job is not committed to anyone in that state — it stays in the feed and keeps taking bids.';

alter table public.bids drop constraint bids_status_check;
alter table public.bids add constraint bids_status_check
  check (status in (
    'pending', 'selected', 'accepted', 'declined', 'rejected', 'expired'
  ));

alter table public.bids
  add column accept_deadline timestamptz;

comment on column public.bids.status is
  'pending -> selected (the customer chose) -> accepted / declined (the pro answered). rejected is a rival closed out by an acceptance; expired covers both a bid nobody chose in 45 minutes and a selection nobody answered in two hours.';

comment on column public.bids.accept_deadline is
  'Set by select_bid(), cleared when the selection ends. While it is set, expires_at is not the clock that matters.';

-- One live selection per job. The customer changing their mind releases the
-- previous one in the same statement that takes the new one, so this index
-- exists to make that atomicity provable rather than trusted.
create unique index bids_one_selected_per_job
  on public.bids (job_id) where status = 'selected';

create index bids_selected_deadline_idx
  on public.bids (accept_deadline) where status = 'selected';

-- Every bid the old select_bid() marked `selected` is a job the pro went on to
-- do: under the old model there was nothing to answer. They are `accepted`.
update public.bids b
   set status = 'accepted'
  from public.jobs j
 where j.selected_bid_id = b.id
   and b.status = 'selected';

-- ---------------------------------------------------------------------------
-- 4. Choosing — and un-choosing
-- ---------------------------------------------------------------------------

/*
 * The customer picks one offer. What changes from Phase 4 is everything that
 * came *after* the pick: the rivals are left alone, `jobs.selected_bid_id`
 * stays null, and the job goes to `awaiting_pro` rather than `assigned`.
 *
 * Re-choosing is now legal, and is the same call: a customer who has waited 40
 * minutes may take the offer back and hand it to somebody else. The previous
 * selection is released in the same statement — back to `pending` if its own
 * 45 minutes are still running, `expired` if they are not. It does not get a
 * fresh 45 minutes: the offer was made when it was made.
 */
create or replace function public.select_bid(p_bid_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bid public.bids;
  v_job public.jobs;
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

  -- Release whoever was holding the job before this call, if anyone was.
  update public.bids
     set status = case when expires_at <= now() then 'expired' else 'pending' end,
         accept_deadline = null
   where job_id = v_bid.job_id
     and status = 'selected';

  update public.bids
     set status = 'selected',
         accept_deadline = now() + public.bid_accept_window()
   where id = p_bid_id;

  update public.jobs
     set status = 'awaiting_pro'
   where id = v_bid.job_id;

  return p_bid_id;
end;
$$;

comment on function public.select_bid(uuid) is
  'The customer offers the job to one pro: the bid goes to selected with a two-hour deadline and the job to awaiting_pro. It does NOT write selected_bid_id and does NOT reject the rivals — both wait for accept_job(). Calling it again hands the job to somebody else.';

revoke execute on function public.select_bid(uuid) from public, anon;
grant execute on function public.select_bid(uuid) to authenticated;

/*
 * "בטל בחירה" — the customer takes the offer back without handing it to
 * anybody else, and the job returns to the pile.
 *
 * A separate entry point from select_bid() because it answers a different
 * question, and because the screen has a button for exactly this: a customer
 * who has changed their mind about the pro but not about the job.
 */
create function public.withdraw_bid_selection(p_job_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.jobs;
begin
  if not public.is_job_owner(p_job_id) then
    raise exception 'not your job' using errcode = '42501';
  end if;

  select * into v_job from public.jobs j where j.id = p_job_id;

  if v_job.status <> 'awaiting_pro' then
    raise exception 'this job is not waiting for a pro to answer'
      using errcode = '22023';
  end if;

  update public.bids
     set status = case when expires_at <= now() then 'expired' else 'pending' end,
         accept_deadline = null
   where job_id = p_job_id
     and status = 'selected';

  update public.jobs set status = 'bidding' where id = p_job_id;
end;
$$;

comment on function public.withdraw_bid_selection(uuid) is
  'The customer takes back an offer nobody has answered yet. The bid returns to pending (or expired, if its own 45 minutes ran out while it waited) and the job returns to bidding.';

revoke execute on function public.withdraw_bid_selection(uuid) from public, anon;
grant execute on function public.withdraw_bid_selection(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Answering
-- ---------------------------------------------------------------------------

/*
 * "אשר וקח את העבודה" — the new step, and the moment Handy charges.
 *
 * Everything that Phase 4's select_bid() used to do at the end now happens
 * here, plus the fee, and all of it in one statement because every part has to
 * be true at the same instant: this pro holds the job, no rival is still live,
 * and the 35 ₪ is on the books.
 *
 * Idempotent for the reason complete_job() is: this is a button pressed on a
 * phone, and a retried request must not charge twice. `job_fees.job_id` is
 * unique, so a second insert would fail loudly rather than double-charge —
 * but returning the existing row is the answer the caller actually wants.
 *
 * Verification is re-checked here and not only at bidding time: a pro
 * suspended, or sent back for fresh documents (Phase 7), in the window between
 * the offer and the answer must not be able to take the work.
 */
create function public.accept_job(p_bid_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
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

  return v_id;
end;
$$;

comment on function public.accept_job(uuid) is
  'The pro takes a job that was offered to them: assigns it, closes every rival bid, and charges the flat fee — one statement. Idempotent. Re-checks verification, because a pro suspended since bidding must not be able to take work.';

revoke execute on function public.accept_job(uuid) from public, anon;
grant execute on function public.accept_job(uuid) to authenticated;

/*
 * "ויתור" — the pro passes. No charge, and the job goes straight back to the
 * customer's list with every rival offer still live.
 *
 * Deliberately says nothing about *why*. A reason field here would be a
 * reputation record kept on one side of a conversation the other side cannot
 * see, and this product has one of those already (reviews) with two owners.
 */
create function public.decline_job(p_bid_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bid public.bids;
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
end;
$$;

comment on function public.decline_job(uuid) is
  'The pro passes on a job offered to them. No fee is charged, the job returns to bidding, and the rival offers were never touched.';

revoke execute on function public.decline_job(uuid) from public, anon;
grant execute on function public.decline_job(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Lapsing — the same trade expire_stale_bids() makes
-- ---------------------------------------------------------------------------

/*
 * A selection nobody answered inside the window. Housekeeping only: nothing in
 * the product depends on this having run, because accept_job() re-checks the
 * deadline itself and every read path reports a lapsed selection as expired.
 */
create function public.expire_stale_selections()
returns int
language sql
security definer
set search_path = ''
as $$
  with lapsed as (
    update public.bids
       set status = 'expired', accept_deadline = null
     where status = 'selected'
       and accept_deadline <= now()
    returning job_id
  ),
  reopened as (
    update public.jobs j
       set status = 'bidding'
      from lapsed
     where j.id = lapsed.job_id
       and j.status = 'awaiting_pro'
    returning 1
  )
  select count(*)::int from lapsed;
$$;

comment on function public.expire_stale_selections() is
  'Housekeeping: releases selections the pro never answered, and returns their jobs to bidding. Advances only rows the clock has already settled, which is why any authenticated caller may run it — and why nothing depends on it having run.';

revoke execute on function public.expire_stale_selections() from public, anon;
grant execute on function public.expire_stale_selections() to authenticated;

-- Guarded exactly like Phase 4's schedule: on a Postgres without pg_cron the
-- migration must still apply, and correctness does not depend on the sweep.
do $$
begin
  perform cron.schedule(
    'handy-expire-stale-selections',
    '* * * * *',
    $cron$ select public.expire_stale_selections(); $cron$
  );
exception
  when others then
    raise notice
      'pg_cron not scheduled (%). Selection expiry still holds: it is re-checked on every read and inside accept_job().',
      sqlerrm;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. One expression for "what does this bid say right now"
--
-- Phase 4 wrote `case when status = 'pending' and expires_at <= now() ...`
-- into four read functions, so that a bid whose 45 minutes ran out reads as
-- expired whether or not a sweep has run. There are two clocks now, and four
-- copies of a two-armed case is how they drift.
-- ---------------------------------------------------------------------------

create function public.bid_effective_status(
  p_status text,
  p_expires_at timestamptz,
  p_accept_deadline timestamptz
)
returns text
language sql
stable
as $$
  select case
    when p_status = 'pending' and p_expires_at <= now() then 'expired'
    when p_status = 'selected' and p_accept_deadline <= now() then 'expired'
    else p_status
  end;
$$;

comment on function public.bid_effective_status(text, timestamptz, timestamptz) is
  'What a bid''s row means once both clocks are applied: an unanswered offer lapses at expires_at, a chosen one at accept_deadline. Nothing depends on a sweep having run.';

revoke execute on function public.bid_effective_status(text, timestamptz, timestamptz)
  from public, anon;
grant execute on function public.bid_effective_status(text, timestamptz, timestamptz)
  to authenticated;

-- ---------------------------------------------------------------------------
-- 8. The feed keeps the job while it waits
--
-- Decided with the user (8.9.2026): a job whose offer is unanswered is not
-- committed to anybody, so it stays in the feed and keeps taking bids. That is
-- what stops a two-hour window from leaving the customer with an empty screen
-- — when they change their mind there is something to change it to.
-- ---------------------------------------------------------------------------

drop policy "jobs: verified pro reads open jobs in radius" on public.jobs;

create policy "jobs: verified pro reads open jobs in radius"
  on public.jobs for select to authenticated
  using (
    status in ('open', 'bidding', 'awaiting_pro')
    and public.pro_serves_job(location, search_radius_km)
  );

create or replace function public.can_bid_on_job(p_job_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.jobs j
    where j.id = p_job_id
      and j.status in ('open', 'bidding', 'awaiting_pro')
      and j.selected_bid_id is null
      and public.pro_serves_job(j.location, j.search_radius_km)
  );
$$;

comment on function public.can_bid_on_job(uuid) is
  'Is this job still taking bids AND inside both radii for the calling pro? Includes awaiting_pro: an unanswered offer commits nobody, and selected_bid_id is what says the job is taken.';

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
        or (
          j.status in ('open', 'bidding', 'awaiting_pro')
          and public.pro_serves_job(j.location, j.search_radius_km)
        )
        or public.is_bidding_pro(j.id)
        or public.is_assigned_pro(j.id)
      )
  );
$$;

/*
 * The feed itself. One new column: whether this job already has an offer
 * waiting for an answer.
 *
 * It is shown rather than hidden because hiding it would be the dishonest
 * option — a pro who bids on a job that is 90 minutes into somebody else's
 * two-hour window has spent their time on a long shot, and they are entitled
 * to know that before they price it. It is a boolean and not the deadline: how
 * long another pro has been thinking is not this pro's business.
 */
drop function public.open_jobs_for_pro(int);

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
  bids_count int,
  awaiting_answer boolean
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
    public.job_bid_count(j.id),
    j.status = 'awaiting_pro'
  from public.jobs j
  cross join me
  join public.categories c on c.id = j.category_id
  where j.status in ('open', 'bidding', 'awaiting_pro')
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
  'The pro feed, under the caller''s own RLS. awaiting_answer marks a job already offered to somebody who has not answered yet — visible on purpose, so a pro can price a long shot knowingly.';

revoke execute on function public.open_jobs_for_pro(int) from public, anon;
grant execute on function public.open_jobs_for_pro(int) to authenticated;

-- ---------------------------------------------------------------------------
-- 9. Reading — both sides of the wait
-- ---------------------------------------------------------------------------

/*
 * design/screens/customer-2.2-compare-bids.png, now with a state it did not
 * have: one card is "ממתין לאישור" with a clock on it, and the others are
 * still choosable. `accept_deadline` is what the screen counts down.
 */
drop function public.bids_for_job(uuid);

create function public.bids_for_job(p_job_id uuid)
returns table (
  id uuid,
  pro_id uuid,
  pro_name text,
  pro_rating numeric,
  pro_jobs_completed int,
  pro_verified boolean,
  price numeric,
  eta_minutes int,
  note text,
  status text,
  expires_at timestamptz,
  accept_deadline timestamptz,
  created_at timestamptz,
  unread_count int
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (public.is_job_owner(p_job_id) or public.is_admin()) then
    raise exception 'not your job' using errcode = '42501';
  end if;

  return query
  select
    b.id,
    b.pro_id,
    pr.full_name,
    pp.rating_avg,
    pp.jobs_completed_count,
    pp.verification_status = 'verified',
    b.price,
    b.eta_minutes,
    b.note,
    public.bid_effective_status(b.status, b.expires_at, b.accept_deadline),
    b.expires_at,
    b.accept_deadline,
    b.created_at,
    (
      select count(*)::int from public.messages m
       where m.job_id = b.job_id
         and m.pro_id = b.pro_id
         and m.sender_id <> (select auth.uid())
         and m.read_at is null
    )
  from public.bids b
  join public.pro_profiles pp on pp.user_id = b.pro_id
  join public.profiles pr on pr.id = b.pro_id
  where b.job_id = p_job_id
  order by b.created_at;
end;
$$;

comment on function public.bids_for_job(uuid) is
  'Every bid on one job, with just enough of each pro for the compare screen. accept_deadline is set on the one the customer chose and is what the wait counts down.';

revoke execute on function public.bids_for_job(uuid) from public, anon;
grant execute on function public.bids_for_job(uuid) to authenticated;

/*
 * design/screens/pro-2.4-my-bids.png — ההצעות שלי, which now has to show a
 * row the pro must act on rather than only rows they are waiting on.
 */
drop function public.my_bids();

create function public.my_bids()
returns table (
  id uuid,
  job_id uuid,
  job_description text,
  job_address_text text,
  job_status text,
  job_created_at timestamptz,
  category_name_he text,
  category_slug text,
  photo_urls text[],
  price numeric,
  eta_minutes int,
  note text,
  status text,
  expires_at timestamptz,
  accept_deadline timestamptz,
  created_at timestamptz,
  winning_price numeric,
  unread_count int
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    b.id,
    j.id,
    j.description,
    j.address_text,
    j.status,
    j.created_at,
    c.name_he,
    c.slug,
    j.photo_urls,
    b.price,
    b.eta_minutes,
    b.note,
    public.bid_effective_status(b.status, b.expires_at, b.accept_deadline),
    b.expires_at,
    b.accept_deadline,
    b.created_at,
    case when b.status = 'rejected' then w.price end,
    (
      select count(*)::int from public.messages m
       where m.job_id = b.job_id
         and m.pro_id = b.pro_id
         and m.sender_id <> (select auth.uid())
         and m.read_at is null
    )
  from public.bids b
  join public.jobs j on j.id = b.job_id
  join public.categories c on c.id = j.category_id
  left join public.bids w on w.id = j.selected_bid_id
  where b.pro_id = (select auth.uid())
  order by b.created_at desc
  limit 200;
$$;

comment on function public.my_bids() is
  'The calling pro''s own bids with the job behind each one. winning_price is filled only on a rejected bid: the price that took the job, never who offered it.';

revoke execute on function public.my_bids() from public, anon;
grant execute on function public.my_bids() to authenticated;

/*
 * "שיעור קבלה" — which is now a different number, because there are two ways
 * to win and one of them is the pro's own doing.
 *
 * `accepted` counts jobs this pro actually took. The rate is measured over the
 * offers the *customer* decided — taken or given to somebody else — so a job
 * the pro declined or let lapse is not counted against them here. It is not a
 * flattering choice, it is the honest one: this figure answers "do customers
 * pick me", and a job the pro turned down is not an answer to that.
 */
drop function public.my_bid_stats();

create function public.my_bid_stats()
returns table (
  total int,
  pending int,
  accepted int,
  awaiting_answer int,
  acceptance_pct int,
  avg_response_minutes int
)
language sql
stable
security definer
set search_path = ''
as $$
  with mine as (
    select
      public.bid_effective_status(b.status, b.expires_at, b.accept_deadline) as status,
      extract(epoch from (b.created_at - j.created_at)) / 60.0 as response_minutes
    from public.bids b
    join public.jobs j on j.id = b.job_id
    where b.pro_id = (select auth.uid())
  ),
  decided as (
    select count(*) as n from mine where status in ('accepted', 'rejected')
  )
  select
    (select count(*)::int from mine),
    (select count(*)::int from mine where status = 'pending'),
    (select count(*)::int from mine where status = 'accepted'),
    (select count(*)::int from mine where status = 'selected'),
    case when (select n from decided) = 0 then null
         else round(
           100.0 * (select count(*) from mine where status = 'accepted')
                 / (select n from decided)
         )::int
    end,
    (select round(avg(response_minutes))::int from mine);
$$;

comment on function public.my_bid_stats() is
  'The subtitle of ההצעות שלי. awaiting_answer is the count the pro must act on: offers the customer has made them that they have not answered.';

revoke execute on function public.my_bid_stats() from public, anon;
grant execute on function public.my_bid_stats() to authenticated;

/*
 * The "נבחרת" card — the one screen this phase exists for.
 *
 * A function of its own rather than a filter over my_bids(), because it
 * carries something no other list does: the fee this pro is about to be
 * charged. It comes from job_acceptance_fee() so that the number under the
 * button and the number written to the ledger cannot be two numbers.
 */
create function public.my_pending_acceptances()
returns table (
  bid_id uuid,
  job_id uuid,
  description text,
  address_text text,
  category_name_he text,
  customer_name text,
  price numeric,
  eta_minutes int,
  accept_deadline timestamptz,
  fee_amount numeric,
  photo_urls text[],
  selected_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    b.id,
    j.id,
    j.description,
    j.address_text,
    c.name_he,
    cust.full_name,
    b.price,
    b.eta_minutes,
    b.accept_deadline,
    public.job_acceptance_fee(),
    j.photo_urls,
    b.accept_deadline - public.bid_accept_window()
  from public.bids b
  join public.jobs j on j.id = b.job_id
  join public.categories c on c.id = j.category_id
  join public.profiles cust on cust.id = j.customer_id
  where b.pro_id = (select auth.uid())
    and b.status = 'selected'
    and b.accept_deadline > now()
    and j.status = 'awaiting_pro'
  order by b.accept_deadline
  limit 20;
$$;

comment on function public.my_pending_acceptances() is
  'Jobs offered to the calling pro and not yet answered, with the deadline and the fee accepting will charge. Definer because the card names the customer, and profiles is closed.';

revoke execute on function public.my_pending_acceptances() from public, anon;
grant execute on function public.my_pending_acceptances() to authenticated;

-- The conversation list shows the state of the bid behind each thread, and
-- "ממתין לתשובתך" is now one of the states it can be in.
create or replace function public.my_message_threads()
returns table (
  job_id uuid,
  pro_id uuid,
  counterpart_name text,
  job_description text,
  job_status text,
  bid_status text,
  last_body text,
  last_at timestamptz,
  unread_count int
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    b.job_id,
    b.pro_id,
    case when j.customer_id = (select auth.uid())
         then pro_profile.full_name
         else customer_profile.full_name
    end,
    j.description,
    j.status,
    public.bid_effective_status(b.status, b.expires_at, b.accept_deadline),
    last_message.body,
    last_message.created_at,
    (
      select count(*)::int from public.messages m
       where m.job_id = b.job_id
         and m.pro_id = b.pro_id
         and m.sender_id <> (select auth.uid())
         and m.read_at is null
    )
  from public.bids b
  join public.jobs j on j.id = b.job_id
  join public.profiles customer_profile on customer_profile.id = j.customer_id
  join public.profiles pro_profile on pro_profile.id = b.pro_id
  left join lateral (
    select m.body, m.created_at
      from public.messages m
     where m.job_id = b.job_id and m.pro_id = b.pro_id
     order by m.created_at desc
     limit 1
  ) last_message on true
  where j.customer_id = (select auth.uid())
     or b.pro_id = (select auth.uid())
  order by coalesce(last_message.created_at, b.created_at) desc
  limit 100;
$$;

-- ---------------------------------------------------------------------------
-- 10. Closing a job, now that the money is already on the books
-- ---------------------------------------------------------------------------

/*
 * "סיימתי — עדכן גבייה" is the same button doing less. It no longer computes
 * or creates anything financial: the charge happened two hours or two days
 * ago, when this pro took the job. What closing adds is what only closing
 * knows — what the work finally cost, how the customer paid, and when.
 *
 * `base_price` is deliberately not re-read from the bid here. It was written
 * at acceptance and is the price this pro agreed to, which is a fact about a
 * moment that has passed.
 */
create or replace function public.complete_job(p_job_id uuid, p_payment_method text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
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

  return v_id;
end;
$$;

comment on function public.complete_job(uuid, text) is
  'assigned/in_progress -> completed by the assigned pro. Completes the fee row that accept_job() opened with the final price, the payment method and the time — it charges nothing, because the charge already happened.';

-- ---------------------------------------------------------------------------
-- 11. The readers that used to mean "a row here is a finished job"
-- ---------------------------------------------------------------------------

/*
 * The receipt. Same document, one number replaced: a flat fee instead of a
 * percentage, still shown to the pro and still NULL for the customer, because
 * what Handy charges the pro is between Handy and the pro
 * (docs/architecture.md section 4).
 */
drop function public.job_receipt(uuid);

create function public.job_receipt(p_job_id uuid)
returns table (
  job_id uuid,
  description text,
  address_text text,
  category_name_he text,
  customer_name text,
  pro_id uuid,
  pro_name text,
  payment_method text,
  base_price numeric,
  total_price numeric,
  fee_amount numeric,
  net_amount numeric,
  charged_at timestamptz,
  completed_at timestamptz,
  rating int,
  review_comment text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_is_owner boolean := public.is_job_owner(p_job_id);
  v_is_pro boolean := public.is_assigned_pro(p_job_id);
  v_is_admin boolean := public.is_admin();
  v_sees_fee boolean;
begin
  if not (v_is_owner or v_is_pro or v_is_admin) then
    raise exception 'not a job you are a side of' using errcode = '42501';
  end if;

  v_sees_fee := v_is_pro or v_is_admin;

  return query
    select
      j.id,
      j.description,
      j.address_text,
      c.name_he,
      cust.full_name,
      f.pro_id,
      pro.full_name,
      f.payment_method,
      f.base_price,
      f.total_price,
      case when v_sees_fee then f.fee_amount end,
      case when v_sees_fee then f.total_price - f.fee_amount end,
      f.charged_at,
      f.completed_at,
      r.rating,
      r.comment
    from public.jobs j
    join public.job_fees f on f.job_id = j.id
    join public.categories c on c.id = j.category_id
    join public.profiles cust on cust.id = j.customer_id
    join public.profiles pro on pro.id = f.pro_id
    left join public.reviews r on r.job_id = j.id
    where j.id = p_job_id
      and f.completed_at is not null;
end;
$$;

comment on function public.job_receipt(uuid) is
  'The billing summary of a closed job, to its two sides. The fee and the net are NULL for the customer. A job that is accepted but not finished has no receipt yet, which is why completed_at is in the where clause.';

revoke execute on function public.job_receipt(uuid) from public, anon;
grant execute on function public.job_receipt(uuid) to authenticated;

/*
 * The pro's history and the wallet's table. `completed_at is not null` is the
 * whole of what changed: a fee row now exists from the moment a job is taken,
 * and a job in progress is not history.
 */
drop function public.my_completed_jobs(timestamptz);

create function public.my_completed_jobs(p_since timestamptz default null)
returns table (
  job_id uuid,
  description text,
  address_text text,
  category_name_he text,
  category_slug text,
  customer_name text,
  base_price numeric,
  total_price numeric,
  fee_amount numeric,
  net_amount numeric,
  payment_method text,
  charged_at timestamptz,
  completed_at timestamptz,
  rating int
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    j.id,
    j.description,
    j.address_text,
    c.name_he,
    c.slug,
    cust.full_name,
    f.base_price,
    f.total_price,
    f.fee_amount,
    f.total_price - f.fee_amount,
    f.payment_method,
    f.charged_at,
    f.completed_at,
    r.rating
  from public.job_fees f
  join public.jobs j on j.id = f.job_id
  join public.categories c on c.id = j.category_id
  join public.profiles cust on cust.id = j.customer_id
  left join public.reviews r on r.job_id = j.id
  where f.pro_id = (select auth.uid())
    and f.completed_at is not null
    and (p_since is null or f.completed_at >= p_since)
  order by f.completed_at desc
  limit 200;
$$;

comment on function public.my_completed_jobs(timestamptz) is
  'The calling pro''s closed jobs with what each one earned and what Handy took. Ranged on completed_at, not charged_at: earnings are realised when the work ends, the fee was charged when it began.';

revoke execute on function public.my_completed_jobs(timestamptz) from public, anon;
grant execute on function public.my_completed_jobs(timestamptz) to authenticated;

/*
 * The wallet's header cards, which now have to say something they never had to
 * say before: money already charged for work not yet finished.
 *
 * Under the 12% those were the same event, so one set of totals covered both.
 * They are days apart now, and a wallet that folded a fee for an unfinished
 * job into "הכנסות השבוע" would be reporting a cost as an earning.
 */
drop function public.my_earnings_stats(timestamptz);

create function public.my_earnings_stats(p_since timestamptz default null)
returns table (
  jobs_count int,
  gross numeric,
  fees numeric,
  net numeric,
  open_jobs_count int,
  open_fees numeric,
  lifetime_jobs_count int,
  lifetime_gross numeric,
  lifetime_fees numeric,
  rating_avg numeric,
  rating_count int
)
language sql
stable
security definer
set search_path = ''
as $$
  with mine as (
    select f.job_id, f.total_price, f.fee_amount, f.completed_at
      from public.job_fees f
     where f.pro_id = (select auth.uid())
  ),
  closed as (
    select * from mine where completed_at is not null
  ),
  in_range as (
    select * from closed where p_since is null or completed_at >= p_since
  ),
  rated as (
    select r.rating
      from public.reviews r
      join closed m on m.job_id = r.job_id
  )
  select
    (select count(*)::int from in_range),
    (select coalesce(sum(total_price), 0) from in_range),
    (select coalesce(sum(fee_amount), 0) from in_range),
    (select coalesce(sum(total_price - fee_amount), 0) from in_range),
    -- Taken, charged for, not finished. The fee on these is already spent.
    (select count(*)::int from mine where completed_at is null),
    (select coalesce(sum(fee_amount), 0) from mine where completed_at is null),
    (select count(*)::int from closed),
    (select coalesce(sum(total_price), 0) from closed),
    (select coalesce(sum(fee_amount), 0) from mine),
    (select round(avg(rating), 2) from rated),
    (select count(*)::int from rated);
$$;

comment on function public.my_earnings_stats(timestamptz) is
  'The wallet''s header cards. lifetime_fees counts every fee this pro has been charged, finished or not — a fee is not refunded, so leaving the open ones out would understate what Handy took.';

revoke execute on function public.my_earnings_stats(timestamptz) from public, anon;
grant execute on function public.my_earnings_stats(timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- 12. The console, and the public numbers
-- ---------------------------------------------------------------------------

/*
 * The revenue card on design/screens/admin-7.1-overview.png.
 *
 * Three columns renamed, and one meaning quietly improved: revenue is now
 * counted on `charged_at`, which is the moment a pro took a job. Under the 12%
 * that column meant "when the work finished", so a busy month whose jobs
 * closed in the next one landed in the wrong month. It cannot any more.
 */
drop function public.admin_overview();

create function public.admin_overview()
returns table (
  pending_pros int,
  open_disputes int,
  jobs_24h int,
  jobs_prev_24h int,
  minutes_to_first_bid numeric,
  closed_rate_pct numeric,
  jobs_without_bids int,
  fees_month numeric,
  fees_month_jobs int,
  fees_prev_month numeric,
  unreviewed_docs int,
  pros_with_many_price_updates int
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;

  return query
  with month_start as (
    select date_trunc('month', now()) as this_month,
           date_trunc('month', now()) - interval '1 month' as prev_month
  ),
  first_bids as (
    select b.job_id, min(b.created_at) as first_at
      from public.bids b
     group by b.job_id
  )
  select
    (select count(*)::int from public.pro_profiles pp
      where pp.verification_status = 'pending'),
    (select count(*)::int from public.disputes d
      where d.status in ('open', 'in_review')),
    (select count(*)::int from public.jobs j
      where j.created_at >= now() - interval '24 hours'),
    (select count(*)::int from public.jobs j
      where j.created_at >= now() - interval '48 hours'
        and j.created_at < now() - interval '24 hours'),
    (select round(avg(extract(epoch from (fb.first_at - j.created_at)) / 60)::numeric, 0)
       from first_bids fb
       join public.jobs j on j.id = fb.job_id
      where j.created_at >= now() - interval '7 days'),
    (select case when count(*) = 0 then null
                 else round(100.0 * count(*) filter (where j.status = 'completed') / count(*), 0)
            end
       from public.jobs j
      where j.created_at >= now() - interval '30 days'
        and j.status <> 'draft'),
    -- "קריאות ללא הצעות מעל שעה" — the first line of התראות בקרה. A job
    -- waiting for a pro to answer has offers by definition, so it is not one
    -- of these.
    (select count(*)::int from public.jobs j
      where j.status in ('open', 'bidding')
        and j.created_at < now() - interval '1 hour'
        and not exists (select 1 from public.bids b where b.job_id = j.id)),
    (select coalesce(sum(f.fee_amount), 0) from public.job_fees f, month_start m
      where f.charged_at >= m.this_month),
    (select count(*)::int from public.job_fees f, month_start m
      where f.charged_at >= m.this_month),
    (select coalesce(sum(f.fee_amount), 0) from public.job_fees f, month_start m
      where f.charged_at >= m.prev_month and f.charged_at < m.this_month),
    (select count(*)::int from public.verification_documents vd
      where vd.status = 'pending'),
    -- "בעל מקצוע אחד עם 3 עדכוני מחיר ביום" — the transparency rule's own
    -- smoke alarm: a pro leaning on field updates is what 5.5 exists to catch.
    (select count(*)::int from (
        select pu.pro_id from public.price_updates pu
         where pu.created_at >= now() - interval '24 hours'
         group by pu.pro_id having count(*) >= 3
      ) heavy);
end;
$$;

comment on function public.admin_overview() is
  'Every number on design/screens/admin-7.1-overview.png, in one row and one instant. Revenue is counted when a pro takes a job, which is when Handy charges. Checks is_admin() itself — an aggregate cannot be expressed as a row policy.';

revoke execute on function public.admin_overview() from public, anon;
grant execute on function public.admin_overview() to authenticated;

/*
 * The public cost guide and the category+city pages count closed jobs. A fee
 * row is no longer proof of one, so both of them say so.
 *
 * This is the sharp end of the ledger's new shape: without the filter, the
 * price a stranger reads on /pricing would include jobs whose price is not
 * known yet, as nulls — and percentile_cont over a set with nulls in it is a
 * number that looks fine and means nothing.
 */
create or replace function public.pricing_guide()
returns table (
  category_slug text,
  category_name text,
  jobs_closed int,
  price_low numeric,
  price_typical numeric,
  price_high numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    c.slug,
    c.name_he,
    count(f.id)::int,
    percentile_cont(0.1) within group (order by f.total_price),
    percentile_cont(0.5) within group (order by f.total_price),
    percentile_cont(0.9) within group (order by f.total_price)
  from public.categories c
  left join public.jobs j on j.category_id = c.id
  left join public.job_fees f
    on f.job_id = j.id and f.completed_at is not null
  group by c.slug, c.name_he
  order by count(f.id) desc, c.name_he;
$$;

comment on function public.pricing_guide() is
  'Closed-job price statistics per category, for the public cost guide. A job that was taken but not finished is not a closed job and is not counted.';

grant execute on function public.pricing_guide() to anon, authenticated;

-- The same filter on the category+city pages, for the same reason.
create or replace function public.category_stats(
  p_category_slug text,
  p_lat double precision default null,
  p_lng double precision default null
)
returns table (
  pros_count int,
  avg_first_bid_minutes numeric,
  jobs_closed int,
  price_low numeric,
  price_typical numeric,
  price_high numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  with cat as (
    select id from public.categories where slug = p_category_slug
  ),
  covered as (
    select pp.user_id
      from public.pro_profiles pp
      join public.pro_categories pc on pc.pro_id = pp.user_id
     where pc.category_id = (select id from cat)
       and pp.verification_status = 'verified'
       and (
         p_lat is null or p_lng is null
         or (
           pp.service_point is not null
           and extensions.st_dwithin(
                 pp.service_point,
                 extensions.st_point(p_lng, p_lat)::extensions.geography,
                 pp.radius_km * 1000
               )
         )
       )
  ),
  first_bids as (
    select extract(epoch from (min(b.created_at) - j.created_at)) / 60 as minutes
      from public.jobs j
      join public.bids b on b.job_id = j.id
     where j.category_id = (select id from cat)
     group by j.id, j.created_at
    having min(b.created_at) >= j.created_at
  ),
  closed as (
    select f.total_price
      from public.job_fees f
      join public.jobs j on j.id = f.job_id
     where j.category_id = (select id from cat)
       and f.completed_at is not null
  )
  select
    (select count(*)::int from covered),
    (select round(avg(minutes)::numeric, 0) from first_bids),
    (select count(*)::int from closed),
    (select percentile_cont(0.1) within group (order by total_price) from closed),
    (select percentile_cont(0.5) within group (order by total_price) from closed),
    (select percentile_cont(0.9) within group (order by total_price) from closed);
$$;

-- ---------------------------------------------------------------------------
-- 13. Realtime
--
-- Nothing new is published. The pro's screen learns that they were chosen from
-- the `bids` subscription they already hold (Phase 4, filtered on their own
-- pro_id), and the customer's from the same one on their side. Realtime
-- applies each subscriber's RLS before delivering a row, so this is the
-- notification the product has — for as long as the tab is open, which is
-- exactly the gap CLAUDE.md section 9 is still holding open.
-- ---------------------------------------------------------------------------
