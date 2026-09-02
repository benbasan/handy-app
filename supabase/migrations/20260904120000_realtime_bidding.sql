-- Phase 4 — הצעות מחיר בזמן אמת: the bidding core of the product.
--
-- Four things happen here, and every one of them exists because the UI must
-- not be the thing enforcing it.
--
--  1. **Writing a bid is narrowed to what a pro is actually allowed to say.**
--     Phase 1 granted INSERT on the whole `bids` row and UPDATE on `status`.
--     That let a pro mint their own `expires_at` (a bid that never lapses) and
--     set their own `status = 'selected'`. Both are now impossible: INSERT is
--     column-scoped to the four fields a pro writes, `status` loses its update
--     grant entirely, and the 45-minute clock is a default plus a trigger.
--
--  2. **Choosing a bid is `select_bid()`, a security definer function.** The
--     customer held `update (status, selected_bid_id)` on `jobs`, which is a
--     money path: the price of a job is the selected bid's price, so a client
--     that can write `selected_bid_id` can choose an expired bid, a bid on
--     someone else's job, or re-choose after the fact. Both columns lose their
--     grant; the one legal transition is the function, which checks the caller
--     and the bid, marks every other bid rejected, and moves the job to
--     `assigned` — all in one statement (CLAUDE.md section 3: "a status a user
--     must not set themselves is a security definer function").
--
--  3. **Expiry is true whether or not a sweep has run.** `expire_stale_bids()`
--     flips lapsed rows for display, but nothing depends on it having run:
--     `select_bid()` re-checks `expires_at` itself, and the read functions
--     report a pending-but-lapsed bid as expired. The sweep is scheduled on
--     pg_cron where the extension exists and is also called opportunistically
--     from the read paths, so a stack with no scheduler still converges.
--
--  4. **A chat thread is (job, pro), not (job).** `messages` carried only
--     `job_id`, and the read policy admitted any pro who had bid — so on a job
--     with three bids, each pro could read the other two conversations.
--     `messages.pro_id` names the pro side of the thread and the policies
--     follow it. `read_at` gives the unread badges in the design real data.
--
-- Screens: design/screens/customer-2.2-compare-bids.png,
-- pro-2.3-submit-bid.png, pro-2.4-my-bids.png, pro-5.3-messages.png.

-- ---------------------------------------------------------------------------
-- 0. The chat thread key
--
-- Up front, because the read functions further down count unread messages per
-- (job, pro) thread. Adding a NOT NULL column is safe here: nothing has ever
-- written a message, since this is the phase that builds the chat.
-- ---------------------------------------------------------------------------

alter table public.messages
  add column pro_id uuid not null
    references public.pro_profiles (user_id) on delete cascade,
  add column read_at timestamptz;

comment on column public.messages.pro_id is
  'The pro side of the thread. Without it, "job participants" admitted every pro who had bid — so on a job with three bids each pro could read the other two conversations.';

create index messages_thread_idx
  on public.messages (job_id, pro_id, created_at);

-- ---------------------------------------------------------------------------
-- 1. Bid writes, narrowed
-- ---------------------------------------------------------------------------

-- Column-scoped INSERT. Everything left out has a default that is the whole
-- point of the column: `status` starts 'pending', `expires_at` is now + 45
-- minutes (business rule 6), `created_at` is now.
revoke insert on public.bids from authenticated;
grant insert (job_id, pro_id, price, eta_minutes, note)
  on public.bids to authenticated;

-- `status` leaves the update grant. The three transitions out of 'pending'
-- are expire_stale_bids() and select_bid(), both below, both definer.
revoke update (status) on public.bids from authenticated;

create index bids_pending_expiry_idx
  on public.bids (expires_at) where status = 'pending';

/*
 * Editing a bid ("עדכן הצעה" in design/screens/pro-2.4-my-bids.png).
 *
 * Two rules the grant cannot express. A settled bid — selected, rejected,
 * lapsed — is not editable at all: re-pricing a bid the customer already acted
 * on would rewrite history. And re-pricing a live bid restarts the 45 minutes,
 * because business rule 6 measures validity from when the offer was made and
 * this is a new offer.
 *
 * A status change reaches this trigger only from the definer functions below;
 * no client role holds a grant on that column, so it returns early rather than
 * guarding a path clients cannot take.
 */
create function public.bids_guard_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
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

create trigger bids_guard_update
  before update on public.bids
  for each row execute function public.bids_guard_update();

/*
 * Can the calling pro bid on this job at all?
 *
 * The Phase 1 insert policy asked only "are you a verified pro writing your
 * own pro_id" — which admitted a bid on any job id at all, including one
 * outside the pro's radius or one already assigned. This asks the same
 * question the SELECT policy on `jobs` asks, so a pro can only bid on a job
 * they can actually see.
 */
create function public.can_bid_on_job(p_job_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.jobs j
    where j.id = p_job_id
      and j.status in ('open', 'bidding')
      and j.selected_bid_id is null
      and public.pro_serves_job(j.location, j.search_radius_km)
  );
$$;

comment on function public.can_bid_on_job(uuid) is
  'Is this job still taking bids AND inside both radii for the calling pro? The insert policy on bids uses it, so bidding cannot reach further than the feed does.';

drop policy "bids: verified pro inserts own" on public.bids;

create policy "bids: verified pro inserts own on a job they can see"
  on public.bids for insert to authenticated
  with check (
    pro_id = (select auth.uid())
    and public.is_verified_pro()
    and public.can_bid_on_job(job_id)
  );

/*
 * `open` → `bidding` on the first bid.
 *
 * A trigger rather than an update from the pro's session: the pro holds no
 * update policy on `jobs` and must not, and the customer is not present at the
 * moment a bid arrives. Runs as the table owner, so RLS does not apply.
 */
create function public.jobs_mark_bidding()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.jobs
     set status = 'bidding'
   where id = new.job_id and status = 'open';
  return null;
end;
$$;

create trigger bids_mark_job_bidding
  after insert on public.bids
  for each row execute function public.jobs_mark_bidding();

-- ---------------------------------------------------------------------------
-- 2. Expiry (business rule 6 — הצעה תקפה 45 דקות)
-- ---------------------------------------------------------------------------

create function public.expire_stale_bids()
returns int
language sql
security definer
set search_path = ''
as $$
  with expired as (
    update public.bids
       set status = 'expired'
     where status = 'pending'
       and expires_at <= now()
    returning 1
  )
  select count(*)::int from expired;
$$;

comment on function public.expire_stale_bids() is
  'Housekeeping: flips lapsed pending bids to expired so screens read correctly. Advances only rows the clock has already settled, which is why any authenticated caller may run it — and why nothing depends on it having run.';

revoke execute on function public.expire_stale_bids() from public, anon;
grant execute on function public.expire_stale_bids() to authenticated;

/*
 * The scheduled half. docs/architecture.md section 3 names a cron for this;
 * pg_cron is the version of that which needs no deploy target, and it is
 * present in the local stack and available on Supabase Cloud.
 *
 * Guarded, because correctness does not depend on it: on a Postgres without
 * pg_cron in shared_preload_libraries the migration must still apply, and the
 * opportunistic call from the read paths keeps the data honest regardless.
 */
do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule(
    'handy-expire-stale-bids',
    '* * * * *',
    $cron$ select public.expire_stale_bids(); $cron$
  );
exception
  when others then
    raise notice
      'pg_cron not scheduled (%). Bid expiry still holds: it is re-checked on every read and inside select_bid().',
      sqlerrm;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Choosing a bid
-- ---------------------------------------------------------------------------

-- The money path. A job's agreed price is the selected bid's price, so a
-- client that can write these two columns can set the price. Neither is
-- self-service any more; the phases that add further transitions
-- (in_progress, completed, cancelled) get their own checked functions.
revoke update (status, selected_bid_id) on public.jobs from authenticated;

create function public.select_bid(p_bid_id uuid)
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

  -- Idempotence is not the same as re-choosing: once a job is assigned, the
  -- agreed price is fixed and only a price_update (Phase 5) may move it.
  if v_job.selected_bid_id is not null or v_job.status not in ('open', 'bidding') then
    raise exception 'a bid has already been chosen on this job' using errcode = '22023';
  end if;

  -- Re-checked here rather than trusted from the sweep: a bid that lapsed one
  -- second ago is not selectable even if no sweep has run since.
  if v_bid.status <> 'pending' or v_bid.expires_at <= now() then
    raise exception 'this bid is no longer valid' using errcode = '22023';
  end if;

  update public.bids set status = 'selected' where id = p_bid_id;

  -- "בחירת הצעה נועלת את שאר ההצעות" — every rival closes in the same
  -- statement, so there is no window in which two bids are live.
  update public.bids
     set status = 'rejected'
   where job_id = v_bid.job_id
     and id <> p_bid_id
     and status = 'pending';

  update public.jobs
     set selected_bid_id = p_bid_id,
         status = 'assigned'
   where id = v_bid.job_id;

  return p_bid_id;
end;
$$;

comment on function public.select_bid(uuid) is
  'The customer picks one bid. Checks ownership, that the job is still open, and that the bid has not lapsed; then locks every rival bid and assigns the job. No client role can write jobs.selected_bid_id directly.';

revoke execute on function public.select_bid(uuid) from public, anon;
grant execute on function public.select_bid(uuid) to authenticated;

-- Once a job is assigned it leaves the "open/bidding in radius" policy, so
-- every pro who bid on it — including the winner before Phase 5's flows — must
-- keep reading it, or "ההצעות שלי" would list bids against blank rows.
create policy "jobs: bidding pro reads a job they bid on"
  on public.jobs for select to authenticated
  using (public.is_bidding_pro(id));

-- ---------------------------------------------------------------------------
-- 4. Reading bids
-- ---------------------------------------------------------------------------

/*
 * design/screens/customer-2.2-compare-bids.png.
 *
 * The customer needs the pro's name, rating, completed-job count and verified
 * badge beside each price. `profiles` and `pro_profiles` deliberately have no
 * customer-facing SELECT policy (docs/architecture.md section 4), and the
 * right answer to "the compare screen needs four columns" is a function that
 * returns exactly those four — not a policy that opens the tables.
 *
 * `effective_status` rather than `status`: a bid whose 45 minutes ran out is
 * expired on screen the moment it lapses, whether or not a sweep has run.
 */
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
    case when b.status = 'pending' and b.expires_at <= now()
         then 'expired' else b.status end,
    b.expires_at,
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
  'Every bid on one job, with just enough of each pro for the compare screen (name, rating, jobs done, verified). Checks the caller owns the job; pro_profiles stays closed to customers.';

revoke execute on function public.bids_for_job(uuid) from public, anon;
grant execute on function public.bids_for_job(uuid) to authenticated;

/*
 * "נמצאו 4 בעלי מקצוע ברדיוס 3 ק״מ" in the banner of the same screen.
 *
 * A count and nothing else — no names, no locations — for the same reason
 * job_bid_count() returns only a number to a pro.
 */
create function public.pros_in_range(p_job_id uuid)
returns int
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_job public.jobs;
  v_count int;
begin
  select * into v_job from public.jobs j where j.id = p_job_id;
  if v_job is null then
    return 0;
  end if;

  if not (v_job.customer_id = (select auth.uid()) or public.is_admin()) then
    raise exception 'not your job' using errcode = '42501';
  end if;

  select count(*)::int into v_count
    from public.pro_profiles p
   where p.verification_status = 'verified'
     and p.accepting_jobs
     and p.service_point is not null
     and extensions.st_dwithin(
           p.service_point,
           v_job.location,
           least(p.radius_km, v_job.search_radius_km) * 1000
         );

  return v_count;
end;
$$;

revoke execute on function public.pros_in_range(uuid) from public, anon;
grant execute on function public.pros_in_range(uuid) to authenticated;

/*
 * design/screens/pro-2.4-my-bids.png — ההצעות שלי.
 *
 * A plain query cannot answer this: the design's third row says
 * "הלקוח בחר אחר (280 ₪)", and the SELECT policy on `bids` shows a pro only
 * their own rows. `winning_price` closes exactly that gap — the number, never
 * the identity behind it, which is the same trade job_bid_count() makes.
 */
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
    case when b.status = 'pending' and b.expires_at <= now()
         then 'expired' else b.status end,
    b.expires_at,
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
  'The calling pro''s own bids with the job behind each one. winning_price is filled only on a rejected bid: the price the customer chose, never who offered it.';

revoke execute on function public.my_bids() from public, anon;
grant execute on function public.my_bids() to authenticated;

/*
 * "שיעור קבלה 72% · זמן תגובה ממוצע 9 דקות" — the subtitle of the same
 * screen, computed rather than invented. Response time is measured from when
 * the customer posted, which is the number the 10-minute product tip in
 * product-spec.md 4.3 is about.
 */
create function public.my_bid_stats()
returns table (
  total int,
  pending int,
  selected int,
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
      case when b.status = 'pending' and b.expires_at <= now()
           then 'expired' else b.status end as status,
      extract(epoch from (b.created_at - j.created_at)) / 60.0 as response_minutes
    from public.bids b
    join public.jobs j on j.id = b.job_id
    where b.pro_id = (select auth.uid())
  ),
  decided as (
    select count(*) as n from mine where status in ('selected', 'rejected')
  )
  select
    (select count(*)::int from mine),
    (select count(*)::int from mine where status = 'pending'),
    (select count(*)::int from mine where status = 'selected'),
    -- Out of the bids the customer actually decided on. Counting lapsed bids
    -- as losses would report an acceptance rate for offers nobody read.
    case when (select n from decided) = 0 then null
         else round(
           100.0 * (select count(*) from mine where status = 'selected')
                 / (select n from decided)
         )::int
    end,
    (select round(avg(response_minutes))::int from mine);
$$;

revoke execute on function public.my_bid_stats() from public, anon;
grant execute on function public.my_bid_stats() to authenticated;

/*
 * "טווח מחירים לקריאות דומות באזור" — the pricing hint on
 * design/screens/pro-2.3-submit-bid.png.
 *
 * Real bids on real jobs in the same trade within 15 km, over the last 90
 * days. It returns the sample size alongside the range so the screen can stay
 * silent rather than quote a "range" derived from one bid — the same reason
 * the landing pages in Phase 2 and 3 dropped the prototype's invented metrics.
 */
create function public.similar_bid_range(p_job_id uuid)
returns table (
  min_price numeric,
  max_price numeric,
  sample_count int
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_job public.jobs;
begin
  select * into v_job from public.jobs j where j.id = p_job_id;

  if v_job is null
     or not (public.can_bid_on_job(p_job_id) or public.is_bidding_pro(p_job_id))
  then
    raise exception 'not a job you can bid on' using errcode = '42501';
  end if;

  return query
  select
    min(b.price),
    max(b.price),
    count(*)::int
  from public.bids b
  join public.jobs j on j.id = b.job_id
  where j.category_id = v_job.category_id
    and b.created_at > now() - interval '90 days'
    and extensions.st_dwithin(j.location, v_job.location, 15000);
end;
$$;

revoke execute on function public.similar_bid_range(uuid) from public, anon;
grant execute on function public.similar_bid_range(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Chat — a thread is (job, pro)
-- ---------------------------------------------------------------------------

create function public.pro_has_bid(p_job_id uuid, p_pro_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.bids b
    where b.job_id = p_job_id and b.pro_id = p_pro_id
  );
$$;

comment on function public.pro_has_bid(uuid, uuid) is
  'Does this pro have a bid on this job? The customer may only open a thread with a pro who actually made them an offer (product-spec.md 3.3).';

drop policy "messages: job participants read" on public.messages;
drop policy "messages: job participants send as themselves" on public.messages;

create policy "messages: job owner reads every thread on their job"
  on public.messages for select to authenticated
  using (public.is_job_owner(job_id));

create policy "messages: pro reads only their own thread"
  on public.messages for select to authenticated
  using (pro_id = (select auth.uid()));

create policy "messages: job owner writes to a pro who bid"
  on public.messages for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and public.is_job_owner(job_id)
    and public.pro_has_bid(job_id, pro_id)
  );

create policy "messages: pro writes in their own thread"
  on public.messages for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and pro_id = (select auth.uid())
    and public.is_bidding_pro(job_id)
  );

-- read_at is the only writable column, and only by the side that did not send
-- the message: marking your own message read would be meaningless, and marking
-- someone else's thread read would hide it from them.
grant update (read_at) on public.messages to authenticated;

create policy "messages: recipient marks read"
  on public.messages for update to authenticated
  using (
    sender_id <> (select auth.uid())
    and (public.is_job_owner(job_id) or pro_id = (select auth.uid()))
  )
  with check (
    sender_id <> (select auth.uid())
    and (public.is_job_owner(job_id) or pro_id = (select auth.uid()))
  );

/*
 * design/screens/pro-5.3-messages.png — the conversation list beside the open
 * thread. Definer for the same reason bids_for_job is: the list shows the
 * customer's name, and `profiles` has no cross-user read policy.
 */
create function public.my_message_threads()
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
  -- A thread exists as soon as a bid does: the design lets either side open
  -- the conversation before a word has been said.
  select
    b.job_id,
    b.pro_id,
    case when j.customer_id = (select auth.uid())
         then pro_profile.full_name
         else customer_profile.full_name
    end,
    j.description,
    j.status,
    case when b.status = 'pending' and b.expires_at <= now()
         then 'expired' else b.status end,
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

comment on function public.my_message_threads() is
  'Every conversation the caller is a side of, newest first. One row per (job, pro) — the same key the messages policies use.';

revoke execute on function public.my_message_threads() from public, anon;
grant execute on function public.my_message_threads() to authenticated;

/*
 * The messages in one thread, plus who said each one. `sender_id` alone is not
 * renderable — the customer cannot read the pro's `profiles` row and vice
 * versa — so the sender's side is resolved here.
 */
create function public.thread_messages(p_job_id uuid, p_pro_id uuid)
returns table (
  id uuid,
  body text,
  created_at timestamptz,
  read_at timestamptz,
  mine boolean,
  sender_name text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (
    public.is_job_owner(p_job_id)
    or (p_pro_id = (select auth.uid()) and public.is_bidding_pro(p_job_id))
    or public.is_admin()
  ) then
    raise exception 'not your thread' using errcode = '42501';
  end if;

  return query
  select
    m.id,
    m.body,
    m.created_at,
    m.read_at,
    m.sender_id = (select auth.uid()),
    p.full_name
  from public.messages m
  join public.profiles p on p.id = m.sender_id
  where m.job_id = p_job_id and m.pro_id = p_pro_id
  order by m.created_at
  limit 500;
end;
$$;

revoke execute on function public.thread_messages(uuid, uuid) from public, anon;
grant execute on function public.thread_messages(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Realtime — docs/architecture.md section 5
--
-- Postgres Changes over the three tables that section names. Realtime applies
-- each subscriber's own RLS before delivering a row, so publishing a table
-- here widens nothing: a pro subscribed to `bids` still receives only their
-- own, and a customer only the bids on their own jobs.
-- ---------------------------------------------------------------------------

alter publication supabase_realtime add table public.bids;
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.jobs;
