-- ---------------------------------------------------------------------------
-- Phase 14 — אמון ברגע הבחירה, וסגירת לולאת החזרה
--
-- The screen on which a customer decides whom to let into their home showed
-- two grey initials, a star count and a price — while the public profile built
-- in Phase 8 already held a portrait, a gallery, verified reviews and a
-- measured response time. Nothing here is new data. It is the compare screen
-- and the saved-pros list being handed what the product already knows, through
-- definer functions that name every column, exactly as CLAUDE.md section 3
-- requires of anything public about a pro: `pro_profiles` gains no policy.
--
-- And one sweep: a review reminder, because reviews are the fuel for every
-- trust signal above and a finished job nobody rated is a signal lost.
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
    'visit_reminder'
  )
);

-- ---------------------------------------------------------------------------
-- 1. How fast a pro answers — measured, and silent below three offers
--
-- `pro_public_profile()` has averaged (offer − posting) since Phase 8 with no
-- floor, so a pro with one lucky offer reads as "answers in 2 minutes". On the
-- compare screen that number sits beside a price and decides something, so it
-- gets the floor `similar_bid_range` already uses: fewer than three samples is
-- no answer, not a small one.
-- ---------------------------------------------------------------------------

create function public.pro_response_minutes(p_pro_id uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select case when count(*) >= 3
    then round(avg(extract(epoch from (b.created_at - j.created_at)) / 60)::numeric, 0)
  end
  from public.bids b
  join public.jobs j on j.id = b.job_id
  where b.pro_id = p_pro_id
    and b.created_at >= j.created_at;
$$;

comment on function public.pro_response_minutes(uuid) is
  'Average minutes from a call being posted to this pro''s offer on it, over at least three offers; null below that.';

revoke execute on function public.pro_response_minutes(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. The compare screen
-- ---------------------------------------------------------------------------

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
  arrival_window_end timestamptz,
  pro_slug text,
  pro_avatar_path text,
  pro_years_experience smallint,
  pro_reviews_count int,
  pro_response_minutes numeric
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
    b.arrival_window_end,
    -- The slug leads to a public page, which exists only while verified.
    case when pp.verification_status = 'verified' then pp.public_slug end,
    pp.avatar_path,
    pp.years_experience,
    (
      select count(*)::int
        from public.reviews r
        join public.jobs rj on rj.id = r.job_id
        join public.bids rb on rb.id = rj.selected_bid_id
       where rb.pro_id = b.pro_id
    ),
    public.pro_response_minutes(b.pro_id)
  from public.bids b
  join public.pro_profiles pp on pp.user_id = b.pro_id
  join public.profiles pr on pr.id = b.pro_id
  where b.job_id = p_job_id
  order by b.created_at;
end;
$$;

comment on function public.bids_for_job(uuid) is
  'Every bid on one job, with what the compare screen shows of each pro: name, portrait (pro-media, public), rating, reviews, experience and a measured response time. The slug only while the pro is verified. Never a phone, never a document.';

revoke execute on function public.bids_for_job(uuid) from public, anon;
grant execute on function public.bids_for_job(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. The saved-pros list, with the one thing a repeat booking needs
-- ---------------------------------------------------------------------------

drop function public.my_saved_pros();

create function public.my_saved_pros()
returns table (
  pro_id uuid,
  full_name text,
  bio text,
  rating_avg numeric,
  jobs_completed_count int,
  verified boolean,
  saved_at timestamptz,
  public_slug text,
  avatar_path text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    sp.pro_id,
    p.full_name,
    pp.bio,
    pp.rating_avg,
    pp.jobs_completed_count,
    pp.verification_status = 'verified',
    sp.created_at,
    case when pp.verification_status = 'verified' then pp.public_slug end,
    pp.avatar_path
  from public.saved_pros sp
  join public.pro_profiles pp on pp.user_id = sp.pro_id
  join public.profiles p on p.id = sp.pro_id
  where sp.customer_id = (select auth.uid())
  order by sp.created_at desc
  limit 100;
$$;

comment on function public.my_saved_pros() is
  'The calling customer''s saved pros, with the public facts a bid card carries and the slug a repeat booking is addressed to (verified pros only). Never a phone number, never a document.';

revoke execute on function public.my_saved_pros() from public, anon;
grant execute on function public.my_saved_pros() to authenticated;

-- ---------------------------------------------------------------------------
-- 4. The review reminder
--
-- Once, three hours after a job closes and within its first week, to a
-- customer who has not rated it. Housekeeping: a reminder that never fires
-- leaves the customer exactly where they were. The week bounds the first run
-- in production to recent jobs, for the reason warn_quiet_jobs() gives.
-- ---------------------------------------------------------------------------

alter table public.jobs add column review_reminded_at timestamptz;

comment on column public.jobs.review_reminded_at is
  'Stamped by remind_unreviewed_jobs() when the customer was reminded to rate a finished job. No client grant.';

create function public.remind_unreviewed_jobs()
returns integer
language sql
security definer
set search_path = ''
as $$
  with due as (
    update public.jobs j
       set review_reminded_at = now()
      from public.job_fees f
     where f.job_id = j.id
       and j.status = 'completed'
       and j.review_reminded_at is null
       and f.completed_at <= now() - interval '3 hours'
       and f.completed_at > now() - interval '7 days'
       and not exists (select 1 from public.reviews r where r.job_id = j.id)
    returning j.id, j.customer_id, f.pro_id
  ),
  told as (
    insert into public.notifications (user_id, kind, job_id, actor_id)
    select customer_id, 'review_reminder', id, pro_id from due
    returning 1
  )
  select count(*)::int from due;
$$;

comment on function public.remind_unreviewed_jobs() is
  'Reminds a customer once, three hours after a job closes, to rate it. Housekeeping: nothing depends on it having run.';

revoke execute on function public.remind_unreviewed_jobs() from public, anon;
grant execute on function public.remind_unreviewed_jobs() to authenticated;

do $$
begin
  perform cron.schedule(
    'handy-remind-unreviewed-jobs',
    '17 * * * *',
    $cron$ select public.remind_unreviewed_jobs(); $cron$
  );
exception when others then
  raise notice 'pg_cron not available; the review reminder will not sweep (%). Nothing depends on it.', sqlerrm;
end $$;
