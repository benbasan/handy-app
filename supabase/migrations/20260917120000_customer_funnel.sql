-- ---------------------------------------------------------------------------
-- Phase 13.7 — משפך הלקוח
--
-- Four things, and only two of them are about the database. The posting form
-- opening to visitors who have not signed in, and the "what happened?" box,
-- change no table and no policy on purpose: `createJob` still requires a
-- customer, and that is the sentence the phase must not break.
--
-- What does live here:
--
--   1. `job_views` — which verified pros opened a call, so the customer can be
--      told, while nothing has arrived yet, that somebody is looking. A count
--      reaches the customer; an identity never does.
--   2. `add_job_details()` — adding to a call that is still collecting offers.
--      Append-only, because pros have already priced what was written.
--   3. `warn_quiet_jobs()` — one nudge, thirty minutes into a call with no
--      offer, so that (2) has somebody to suggest it to.
--   4. `bids.arrival_window_*` — the hour a pro commits to. Until now a call
--      for "tomorrow" had no agreed time anywhere in the product, and the
--      customer did not know when to be home.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 0. Two new notification kinds.
--
-- `lib/notifications/kinds.ts` mirrors this list and a Vitest assertion reads
-- the newest migration that declares it, so the two cannot drift.
-- ---------------------------------------------------------------------------

alter table public.notifications drop constraint notifications_kind_check;

alter table public.notifications add constraint notifications_kind_check check (
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
    'no_bids_yet',
    -- both
    'message_received',
    'visit_reminder'
  )
);

-- ---------------------------------------------------------------------------
-- 1. job_views
--
-- One row per (job, pro), the first time that pro opened the call. No grant to
-- any client role at all — not even select. The pro has no use for reading it
-- back, and the customer must learn *how many*, never *who*: "יוסי צפה ולא
-- הציע" is information about a person that the pro never chose to give.
-- ---------------------------------------------------------------------------

create table public.job_views (
  job_id uuid not null references public.jobs (id) on delete cascade,
  pro_id uuid not null references public.profiles (id) on delete cascade,
  first_viewed_at timestamptz not null default now(),
  primary key (job_id, pro_id)
);

comment on table public.job_views is
  'Which verified pros opened a call, once each. Written only by record_job_view(); counted only by job_view_count(). No client role holds any grant on it: the customer learns how many looked, never who.';

alter table public.job_views enable row level security;
revoke all on public.job_views from anon, authenticated;

-- The admin reads the record like every other record on a job.
grant select on public.job_views to authenticated;

create policy "job_views: admin reads all"
  on public.job_views for select to authenticated
  using (public.is_admin());

create function public.record_job_view(p_job_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_location extensions.geography;
  v_status text;
begin
  -- Silently nothing, rather than an error, for every caller who does not
  -- count: the quote page calls this on render, and a refusal there would be
  -- a broken page over a statistic.
  if not public.is_verified_pro() then return; end if;

  select location, status into v_location, v_status
    from public.jobs where id = p_job_id;

  if v_status is null or v_status not in ('open', 'bidding') then return; end if;

  -- The same predicate the feed's RLS policy uses, so a view is only ever
  -- recorded for a call this pro could actually have been shown.
  if not public.pro_serves_job(v_location) then return; end if;

  insert into public.job_views (job_id, pro_id)
  values (p_job_id, (select auth.uid()))
  on conflict do nothing;
end;
$$;

comment on function public.record_job_view(uuid) is
  'Records that the calling verified pro opened a call in their radius. Idempotent; a no-op for anybody else.';

revoke execute on function public.record_job_view(uuid) from public, anon;
grant execute on function public.record_job_view(uuid) to authenticated;

create function public.job_view_count(p_job_id uuid)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (public.is_job_owner(p_job_id) or public.is_admin()) then
    raise exception 'not your job' using errcode = '42501';
  end if;

  return (select count(*)::int from public.job_views where job_id = p_job_id);
end;
$$;

comment on function public.job_view_count(uuid) is
  'How many pros opened one call — a number, to its owner and an admin only. The screen shows it only while no offer has arrived.';

revoke execute on function public.job_view_count(uuid) from public, anon;
grant execute on function public.job_view_count(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. add_job_details()
--
-- Phase 1 granted the customer UPDATE on `description` and `photo_urls`
-- directly, and that grant is still there (see the roadmap's note under Phase
-- 13.7). This function is the path the product offers, and it is narrower on
-- the two points that matter to a pro who has already priced the call: it
-- only adds, and only while the call is still collecting offers.
-- ---------------------------------------------------------------------------

alter table public.jobs add column details_added_at timestamptz;

comment on column public.jobs.details_added_at is
  'When the customer last added to the description or photos through add_job_details(). Null if they never did.';

create function public.add_job_details(
  p_job_id uuid,
  p_text text,
  p_photo_paths text[] default '{}'
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_job public.jobs%rowtype;
  v_text text := nullif(trim(coalesce(p_text, '')), '');
  v_photos text[] := coalesce(p_photo_paths, '{}');
  v_path text;
begin
  select * into v_job from public.jobs where id = p_job_id for update;

  if not found or v_job.customer_id is distinct from v_uid then
    raise exception 'not your job' using errcode = '42501';
  end if;

  if v_job.status not in ('open', 'bidding') then
    raise exception 'job is no longer collecting offers' using errcode = '22023';
  end if;

  if v_text is null and cardinality(v_photos) = 0 then
    raise exception 'nothing to add' using errcode = '22023';
  end if;

  if v_text is not null and length(v_text) > 500 then
    raise exception 'added text too long' using errcode = '22023';
  end if;

  if cardinality(v_job.photo_urls) + cardinality(v_photos) > 5 then
    raise exception 'too many photos' using errcode = '22023';
  end if;

  -- The same layout the job-media bucket's own policies enforce: a path under
  -- somebody else's folder is a file this customer did not upload.
  foreach v_path in array v_photos loop
    if v_path not like v_uid::text || '/%' or v_path like '%..%' then
      raise exception 'photo path not yours' using errcode = '42501';
    end if;
  end loop;

  update public.jobs
     set description = case
           when v_text is null then description
           else description || E'\n\n' || v_text
         end,
         photo_urls = photo_urls || v_photos,
         details_added_at = now()
   where id = p_job_id;
end;
$$;

comment on function public.add_job_details(uuid, text, text[]) is
  'Adds text and photos to a call the customer owns, while it is open or bidding. Appends only — pros may already have priced what was written.';

revoke execute on function public.add_job_details(uuid, text, text[]) from public, anon;
grant execute on function public.add_job_details(uuid, text, text[]) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. warn_quiet_jobs()
--
-- Housekeeping in exactly the sense CLAUDE.md section 2 means: if this never
-- runs, the customer is in the state they were in before this phase. The stamp
-- has no client grant, like `bids.lapse_warned_at`.
--
-- The one-day lower bound is not decoration. Without it, the first run after
-- this migration reaches production would tell every customer with an old,
-- unanswered call that "nothing has arrived yet", weeks late.
-- ---------------------------------------------------------------------------

alter table public.jobs add column quiet_warned_at timestamptz;

comment on column public.jobs.quiet_warned_at is
  'Stamped by warn_quiet_jobs() when the customer was told no offer has arrived. No client grant.';

create function public.warn_quiet_jobs()
returns integer
language sql
security definer
set search_path = ''
as $$
  with warned as (
    update public.jobs j
       set quiet_warned_at = now()
     where j.status = 'open'
       and j.quiet_warned_at is null
       and j.created_at <= now() - interval '30 minutes'
       and j.created_at > now() - interval '1 day'
       and not exists (select 1 from public.bids b where b.job_id = j.id)
    returning j.id, j.customer_id
  ),
  told as (
    insert into public.notifications (user_id, kind, job_id)
    select customer_id, 'no_bids_yet', id from warned
    returning 1
  )
  select count(*)::int from warned;
$$;

comment on function public.warn_quiet_jobs() is
  'Tells a customer once, thirty minutes in, that no offer has arrived on their call. Housekeeping: nothing depends on it having run.';

revoke execute on function public.warn_quiet_jobs() from public, anon;
grant execute on function public.warn_quiet_jobs() to authenticated;

-- ---------------------------------------------------------------------------
-- 4. The arrival window.
--
-- Decided with the user on 14.9.2026: required on a call for `today` or
-- `tomorrow`, optional for `this_week` and `flexible`, and absent from `asap`,
-- which keeps `eta_minutes`. The width and ordering are a check; "required for
-- this call" and "not in the past" need the job and the clock, so they are a
-- trigger — the same split `bids` already makes for `expires_at`.
--
-- The two columns join the INSERT grant beside `price`: they are part of the
-- pro's own offer, and a pro choosing their own hours is not a status.
-- ---------------------------------------------------------------------------

alter table public.bids
  add column arrival_window_start timestamptz,
  add column arrival_window_end timestamptz,
  add constraint bids_arrival_window_pair check (
    (arrival_window_start is null) = (arrival_window_end is null)
  ),
  add constraint bids_arrival_window_shape check (
    arrival_window_end is null
    or (
      arrival_window_end > arrival_window_start
      and arrival_window_end - arrival_window_start <= interval '4 hours'
    )
  );

comment on column public.bids.arrival_window_start is
  'The start of the hours the pro commits to arriving within. Required on a call for today or tomorrow; see bids_check_arrival_window().';

revoke insert on public.bids from authenticated;
grant insert (
  job_id, pro_id, price, eta_minutes, note,
  arrival_window_start, arrival_window_end
) on public.bids to authenticated;

grant update (arrival_window_start, arrival_window_end)
  on public.bids to authenticated;

create function public.bids_check_arrival_window()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_when text;
begin
  -- A status transition carries the window it already had. Re-checking "not in
  -- the past" there would stop a customer choosing an offer made yesterday
  -- evening for this morning, which is exactly the offer they want.
  if tg_op = 'UPDATE'
     and new.arrival_window_start is not distinct from old.arrival_window_start
     and new.arrival_window_end is not distinct from old.arrival_window_end then
    return new;
  end if;

  -- Only the pro making their own offer is held to this. Anybody else is about
  -- to be refused by the insert policy, and a BEFORE trigger runs ahead of RLS:
  -- checking them here would answer a customer's forged bid with "arrival
  -- window required" instead of "not allowed", which is both the wrong error
  -- and a rule described to somebody with no business knowing it. The seed and
  -- the definer functions, which carry no JWT, are not a pro making an offer.
  if new.pro_id is distinct from (select auth.uid())
     or not public.is_verified_pro() then
    return new;
  end if;

  select preferred_time into v_when from public.jobs where id = new.job_id;

  if v_when in ('today', 'tomorrow') and new.arrival_window_start is null then
    raise exception 'arrival window required for this call'
      using errcode = '23514', constraint = 'bids_arrival_window_required';
  end if;

  if new.arrival_window_start is not null
     and new.arrival_window_end <= now() then
    raise exception 'arrival window is in the past'
      using errcode = '23514', constraint = 'bids_arrival_window_future';
  end if;

  return new;
end;
$$;

create trigger bids_check_arrival_window
  before insert or update of arrival_window_start, arrival_window_end
  on public.bids
  for each row execute function public.bids_check_arrival_window();

-- The guard learns about the new columns twice: an edited window restarts the
-- 45 minutes like an edited price does, and the lapse-warning branch must not
-- be a way to change a window on a bid that is no longer pending.
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

  if new.lapse_warned_at is distinct from old.lapse_warned_at
     and new.price is not distinct from old.price
     and new.eta_minutes is not distinct from old.eta_minutes
     and new.note is not distinct from old.note
     and new.arrival_window_start is not distinct from old.arrival_window_start
     and new.arrival_window_end is not distinct from old.arrival_window_end then
    return new;
  end if;

  if old.status <> 'pending' or old.expires_at <= now() then
    raise exception 'bid is no longer editable' using errcode = '22023';
  end if;

  if new.price is distinct from old.price
     or new.eta_minutes is distinct from old.eta_minutes
     or new.note is distinct from old.note
     or new.arrival_window_start is distinct from old.arrival_window_start
     or new.arrival_window_end is distinct from old.arrival_window_end
  then
    new.expires_at := now() + interval '45 minutes';
  end if;

  return new;
end;
$$;

-- The compare screen carries the window. A changed return type is a drop and
-- a create, exactly as Phase 10 did it.
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
  unread_count int,
  arrival_window_start timestamptz,
  arrival_window_end timestamptz
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
    ),
    b.arrival_window_start,
    b.arrival_window_end
  from public.bids b
  join public.pro_profiles pp on pp.user_id = b.pro_id
  join public.profiles pr on pr.id = b.pro_id
  where b.job_id = p_job_id
  order by b.created_at;
end;
$$;

comment on function public.bids_for_job(uuid) is
  'Every bid on one job, with just enough of each pro for the compare screen. accept_deadline is set on the one the customer chose and is what the wait counts down; arrival_window_* is the hours the pro committed to.';

revoke execute on function public.bids_for_job(uuid) from public, anon;
grant execute on function public.bids_for_job(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. The morning-of reminder.
--
-- Both sides of a taken job whose agreed window starts today (Israel time),
-- once, from seven in the morning — never in the middle of the night for a
-- window at nine. The stamp is on `jobs` rather than `bids`, because the
-- accepted bid is past `bids_guard_update`'s pending-only rule and a reminder
-- is about the job anyway.
-- ---------------------------------------------------------------------------

alter table public.jobs add column visit_reminded_at timestamptz;

comment on column public.jobs.visit_reminded_at is
  'Stamped by remind_todays_visits() when both sides were reminded of today''s arrival window. No client grant.';

create function public.remind_todays_visits()
returns integer
language sql
security definer
set search_path = ''
as $$
  with due as (
    update public.jobs j
       set visit_reminded_at = now()
      from public.bids b
     where b.id = j.selected_bid_id
       and j.status = 'assigned'
       and j.visit_reminded_at is null
       and b.arrival_window_start is not null
       and b.arrival_window_start > now()
       and (b.arrival_window_start at time zone 'Asia/Jerusalem')::date
           = (now() at time zone 'Asia/Jerusalem')::date
       and extract(hour from now() at time zone 'Asia/Jerusalem') >= 7
    returning j.id, j.customer_id, b.pro_id, b.arrival_window_start, b.arrival_window_end
  ),
  told as (
    insert into public.notifications (user_id, kind, job_id, payload)
    select recipient, 'visit_reminder', id,
           jsonb_build_object(
             'window_start', arrival_window_start,
             'window_end', arrival_window_end
           )
      from due, lateral (values (customer_id), (pro_id)) as r(recipient)
    returning 1
  )
  select count(*)::int from due;
$$;

comment on function public.remind_todays_visits() is
  'Reminds both sides, once, on the morning of an agreed arrival window. Housekeeping: nothing depends on it having run.';

revoke execute on function public.remind_todays_visits() from public, anon;
grant execute on function public.remind_todays_visits() to authenticated;

-- ---------------------------------------------------------------------------
-- Scheduling, guarded as every earlier phase guards its own.
-- ---------------------------------------------------------------------------

do $$
begin
  perform cron.schedule(
    'handy-warn-quiet-jobs',
    '*/5 * * * *',
    $cron$ select public.warn_quiet_jobs(); $cron$
  );
  perform cron.schedule(
    'handy-remind-todays-visits',
    '*/15 * * * *',
    $cron$ select public.remind_todays_visits(); $cron$
  );
exception when others then
  raise notice 'pg_cron not available; the quiet-call nudge and the visit reminder will not sweep (%). Nothing depends on either.', sqlerrm;
end $$;
