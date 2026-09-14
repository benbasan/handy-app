-- ---------------------------------------------------------------------------
-- Phase 13.8 — חזרה וצמיחה
--
-- Two features, and the decisions behind them were made by the user on
-- 14.9.2026 before a line of this was written (docs/roadmap.md, Phase 13.8):
--
--   1. A call directed at one pro — `jobs.requested_pro_id` — reached through
--      that pro's personal link. It is theirs **until they pass**, or until the
--      customer opens it to everyone. It reaches them **even outside their
--      radius**, because the customer named them: the radius decides what the
--      feed brings, never who a customer may ask for. And the first job of a
--      **new** customer brought that way is not charged the 35 ₪.
--   2. The home record — every finished job, grouped by the customer's own
--      saved addresses.
--
-- The reachability rule in CLAUDE.md section 3 changes with (1), and moves as
-- one function, `pro_reaches_job()`, into every place `pro_serves_job()` was
-- asked about a job: the RLS policy on `jobs`, `can_bid_on_job()`,
-- `can_read_job_media()`, `record_job_view()`, and the feed.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 0. Two notification kinds
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
    -- both
    'message_received',
    'visit_reminder'
  )
);

-- ---------------------------------------------------------------------------
-- 1. The columns
--
-- `requested_pro_id` is insertable and never updatable: it is the customer's
-- own choice, made once, and a call cannot be quietly re-pointed at somebody
-- else after pros have been told about it. `opened_to_all_at` has no client
-- grant — it is written only by `release_directed_job()`.
-- ---------------------------------------------------------------------------

alter table public.jobs
  add column requested_pro_id uuid references public.profiles (id) on delete set null,
  add column opened_to_all_at timestamptz;

comment on column public.jobs.requested_pro_id is
  'The pro the customer asked for by name, through that pro''s personal link. The call is theirs alone until opened_to_all_at is set.';
comment on column public.jobs.opened_to_all_at is
  'When a directed call was opened to every pro in radius — because the requested pro passed, or the customer chose to. Null on a call that was never directed.';

create index jobs_requested_pro_idx
  on public.jobs (requested_pro_id) where requested_pro_id is not null;

grant insert (requested_pro_id) on public.jobs to authenticated;

create function public.jobs_check_requested_pro()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.requested_pro_id is null then return new; end if;

  -- Step aside for a caller the insert policy is about to refuse, for the
  -- reason bids_check_arrival_window gives (CLAUDE.md section 3).
  if new.customer_id is distinct from (select auth.uid()) then
    return new;
  end if;

  if not exists (
    select 1 from public.pro_profiles p
     where p.user_id = new.requested_pro_id
       and p.verification_status = 'verified'
  ) then
    raise exception 'the requested pro is not a verified pro'
      using errcode = '23514', constraint = 'jobs_requested_pro_verified';
  end if;

  new.opened_to_all_at := null;
  return new;
end;
$$;

create trigger jobs_check_requested_pro
  before insert on public.jobs
  for each row execute function public.jobs_check_requested_pro();

-- `/new-request?pro=<slug>` names a pro by the address they chose for
-- themselves. The server turns it into an id here. A slug is public; the id of
-- a verified pro already reaches every customer they bid for.
create function public.verified_pro_id_by_slug(p_slug text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.user_id
    from public.pro_profiles p
   where p.public_slug = lower(trim(p_slug))
     and p.verification_status = 'verified';
$$;

comment on function public.verified_pro_id_by_slug(text) is
  'The id behind a verified pro''s public slug, for a call directed at them. Null for an unknown or unverified slug.';

revoke execute on function public.verified_pro_id_by_slug(text) from public, anon;
grant execute on function public.verified_pro_id_by_slug(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. The reachability rule, as one function
-- ---------------------------------------------------------------------------

create function public.pro_reaches_job(
  p_point extensions.geography,
  p_requested_pro_id uuid,
  p_opened_to_all_at timestamptz
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    -- The pro the customer named reaches it wherever they are, for as long as
    -- they are verified — before it is opened and after.
    when p_requested_pro_id is not null
         and p_requested_pro_id = (select auth.uid())
      then public.is_verified_pro()
    -- Directed at somebody else and not yet opened: nobody else.
    when p_requested_pro_id is not null and p_opened_to_all_at is null
      then false
    -- Everything else: the pro's own radius, exactly as before.
    else public.pro_serves_job(p_point)
  end;
$$;

comment on function public.pro_reaches_job(extensions.geography, uuid, timestamptz) is
  'Does this job reach the calling pro? The requested pro always (while verified); nobody else while a directed call is unopened; otherwise pro_serves_job(). The whole of CLAUDE.md section 3''s reachability rule.';

revoke execute on function public.pro_reaches_job(extensions.geography, uuid, timestamptz) from public, anon;
grant execute on function public.pro_reaches_job(extensions.geography, uuid, timestamptz) to authenticated;

drop policy "jobs: verified pro reads open jobs in radius" on public.jobs;

create policy "jobs: verified pro reads open jobs in radius"
  on public.jobs for select to authenticated
  using (
    status in ('open', 'bidding', 'awaiting_pro')
    and public.pro_reaches_job(location, requested_pro_id, opened_to_all_at)
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
      and public.pro_reaches_job(j.location, j.requested_pro_id, j.opened_to_all_at)
  );
$$;

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
          and public.pro_reaches_job(j.location, j.requested_pro_id, j.opened_to_all_at)
        )
        or public.is_bidding_pro(j.id)
        or public.is_assigned_pro(j.id)
      )
  );
$$;

create or replace function public.record_job_view(p_job_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.jobs%rowtype;
begin
  if not public.is_verified_pro() then return; end if;

  select * into v_job from public.jobs where id = p_job_id;

  if not found or v_job.status not in ('open', 'bidding') then return; end if;

  if not public.pro_reaches_job(v_job.location, v_job.requested_pro_id, v_job.opened_to_all_at) then
    return;
  end if;

  insert into public.job_views (job_id, pro_id)
  values (p_job_id, (select auth.uid()))
  on conflict do nothing;
end;
$$;

-- The feed. Invoker, so the policy above already hides a call directed at
-- somebody else; what changes here is that the requested pro's own call is
-- listed even outside their radius and outside their trades, and says so.
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
  status text,
  created_at timestamptz,
  photo_urls text[],
  latitude double precision,
  longitude double precision,
  distance_km double precision,
  bids_count int,
  awaiting_answer boolean,
  requested_for_me boolean
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
    j.status,
    j.created_at,
    j.photo_urls,
    j.latitude,
    j.longitude,
    round((extensions.st_distance(j.location, me.service_point) / 1000.0)::numeric, 1)::double precision,
    public.job_bid_count(j.id),
    j.status = 'awaiting_pro',
    j.requested_pro_id is not distinct from (select auth.uid())
  from public.jobs j
  cross join me
  join public.categories c on c.id = j.category_id
  where j.status in ('open', 'bidding', 'awaiting_pro')
    and (
      j.requested_pro_id is not distinct from (select auth.uid())
      or extensions.st_dwithin(
           j.location,
           me.service_point,
           least(me.radius_km, coalesce(p_max_km, me.radius_km)) * 1000
         )
    )
    and not exists (
      select 1 from public.job_dismissals d
       where d.job_id = j.id and d.pro_id = (select auth.uid())
    )
    and (
      j.requested_pro_id is not distinct from (select auth.uid())
      or not exists (select 1 from public.pro_categories pc where pc.pro_id = (select auth.uid()))
      or exists (
        select 1 from public.pro_categories pc
         where pc.pro_id = (select auth.uid()) and pc.category_id = j.category_id
      )
    )
  order by (j.requested_pro_id is not distinct from (select auth.uid())) desc, j.created_at desc
  limit 100;
$$;

comment on function public.open_jobs_for_pro(int) is
  'The pro feed, under the caller''s own RLS. A call a customer directed at this pro is listed first, and even outside their radius and trades. awaiting_answer marks a job already offered to somebody who has not answered yet.';

revoke execute on function public.open_jobs_for_pro(int) from public, anon;
grant execute on function public.open_jobs_for_pro(int) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Who is told, and the count the customer sees
-- ---------------------------------------------------------------------------

create or replace function public.pros_serving_job(p_job_id uuid)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.user_id
    from public.pro_profiles p
    join public.jobs j on j.id = p_job_id
   where (j.requested_pro_id is null or j.opened_to_all_at is not null)
     and p.user_id is distinct from j.requested_pro_id
     and p.verification_status = 'verified'
     and p.accepting_jobs
     and p.service_point is not null
     and extensions.st_dwithin(p.service_point, j.location, p.radius_km * 1000)
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

create or replace function public.pros_in_range(p_job_id uuid)
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
  select * into v_job from public.jobs where id = p_job_id;

  if v_job is null then
    return 0;
  end if;

  if not (v_job.customer_id = (select auth.uid()) or public.is_admin()) then
    raise exception 'not your job' using errcode = '42501';
  end if;

  -- A directed call that has not been opened reaches one person.
  if v_job.requested_pro_id is not null and v_job.opened_to_all_at is null then
    return (
      select count(*)::int from public.pro_profiles p
       where p.user_id = v_job.requested_pro_id
         and p.verification_status = 'verified'
    );
  end if;

  select count(*)::int into v_count
    from public.pro_profiles p
   where p.verification_status = 'verified'
     and p.accepting_jobs
     and p.service_point is not null
     and extensions.st_dwithin(p.service_point, v_job.location, p.radius_km * 1000);

  return v_count;
end;
$$;

create or replace function public.notify_pros_in_radius()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- A directed call tells the pro who was asked for, and nobody else yet.
  if new.requested_pro_id is not null then
    perform public.notify_user(
      new.requested_pro_id, 'job_requested', new.id, new.customer_id,
      jsonb_build_object('category_id', new.category_id)
    );
    return null;
  end if;

  insert into public.notifications (user_id, kind, job_id, actor_id, payload)
  select pro_id, 'job_in_radius', new.id, new.customer_id,
         jsonb_build_object('category_id', new.category_id)
    from public.pros_serving_job(new.id) as pro_id;

  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Opening a directed call to everyone
--
-- One internal function, three doors: the customer's button, the requested
-- pro's "לא מתאים לי", and that pro declining an offer they were chosen for.
-- The fan-out happens here and not in a sweep, for the reason the insert
-- trigger gives: a sweep would need a watermark.
-- ---------------------------------------------------------------------------

create function public.release_directed_job(p_job_id uuid, p_tell_customer boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.jobs%rowtype;
begin
  update public.jobs
     set opened_to_all_at = now()
   where id = p_job_id
     and requested_pro_id is not null
     and opened_to_all_at is null
     and status in ('open', 'bidding', 'awaiting_pro')
  returning * into v_job;

  if not found then return false; end if;

  insert into public.notifications (user_id, kind, job_id, actor_id, payload)
  select pro_id, 'job_in_radius', v_job.id, v_job.customer_id,
         jsonb_build_object('category_id', v_job.category_id)
    from public.pros_serving_job(v_job.id) as pro_id;

  if p_tell_customer then
    perform public.notify_user(
      v_job.customer_id, 'requested_pro_passed', v_job.id, v_job.requested_pro_id
    );
  end if;

  return true;
end;
$$;

comment on function public.release_directed_job(uuid, boolean) is
  'Opens a directed call to every pro in radius and tells them. Internal: reached through open_job_to_all() and the two triggers below.';

revoke execute on function public.release_directed_job(uuid, boolean) from public, anon, authenticated;

create function public.open_job_to_all(p_job_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_job_owner(p_job_id) then
    raise exception 'not your job' using errcode = '42501';
  end if;

  if not public.release_directed_job(p_job_id, false) then
    raise exception 'this call is not waiting on one pro' using errcode = '22023';
  end if;
end;
$$;

comment on function public.open_job_to_all(uuid) is
  'The customer opens a call they directed at one pro to every pro in radius.';

revoke execute on function public.open_job_to_all(uuid) from public, anon;
grant execute on function public.open_job_to_all(uuid) to authenticated;

create function public.release_on_requested_pro_dismissal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.jobs j
     where j.id = new.job_id and j.requested_pro_id = new.pro_id
  ) then
    perform public.release_directed_job(new.job_id, true);
  end if;
  return null;
end;
$$;

create trigger job_dismissals_release_directed
  after insert on public.job_dismissals
  for each row execute function public.release_on_requested_pro_dismissal();

create function public.release_on_requested_pro_decline()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'declined' and old.status is distinct from 'declined'
     and exists (
       select 1 from public.jobs j
        where j.id = new.job_id and j.requested_pro_id = new.pro_id
     ) then
    -- decline_job() has already told the customer the pro passed.
    perform public.release_directed_job(new.job_id, false);
  end if;
  return null;
end;
$$;

create trigger bids_release_directed_on_decline
  after update of status on public.bids
  for each row execute function public.release_on_requested_pro_decline();

-- The customer's screen names who the call is waiting on. `profiles` is closed
-- to customers, so this is a definer that returns two columns to the owner.
create function public.requested_pro_for_job(p_job_id uuid)
returns table (full_name text, public_slug text)
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
  select pr.full_name, pp.public_slug
    from public.jobs j
    join public.profiles pr on pr.id = j.requested_pro_id
    left join public.pro_profiles pp on pp.user_id = j.requested_pro_id
   where j.id = p_job_id;
end;
$$;

revoke execute on function public.requested_pro_for_job(uuid) from public, anon;
grant execute on function public.requested_pro_for_job(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. The fee waiver
--
-- Decided with the user on 14.9.2026: a new customer, their first job, taken
-- by the pro whose link they came through. "New" is read from the ledger — no
-- earlier job of this customer's was ever accepted by anybody — which is also
-- what makes it ungameable: a customer a pro met through the feed stopped being
-- new the day that pro took their job.
-- ---------------------------------------------------------------------------

create function public.job_acceptance_fee_for(p_job_id uuid, p_pro_id uuid)
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

comment on function public.job_acceptance_fee_for(uuid, uuid) is
  'What accepting this job would charge this pro: 0 on the first job of a new customer who came through the pro''s own link, job_acceptance_fee() otherwise.';

revoke execute on function public.job_acceptance_fee_for(uuid, uuid) from public, anon, authenticated;

-- The same number, for the calling pro, so the bid form can show it. Only the
-- requested pro can ever get anything but the flat fee back.
create function public.my_fee_for_job(p_job_id uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select public.job_acceptance_fee_for(p_job_id, (select auth.uid()));
$$;

revoke execute on function public.my_fee_for_job(uuid) from public, anon;
grant execute on function public.my_fee_for_job(uuid) to authenticated;

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

  -- The fee is read from the function, never from the caller. Since Phase 13.8
  -- it is asked about this job and this pro: a new customer a pro brought
  -- through their own link is not charged for. base_price is
  -- the price this pro is taking the job at; what it ends up being at closing
  -- time is complete_job()'s business, and does not change what is charged.
  insert into public.job_fees (job_id, pro_id, base_price, fee_amount)
  values (v_bid.job_id, v_bid.pro_id, v_bid.price, public.job_acceptance_fee_for(v_bid.job_id, v_bid.pro_id))
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

create or replace function public.my_pending_acceptances()
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
    public.job_acceptance_fee_for(j.id, b.pro_id),
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

-- ---------------------------------------------------------------------------
-- 6. The home record
--
-- The roadmap sketched this as `security invoker`. It cannot be: the pro's name
-- and public slug live in `profiles` and `pro_profiles`, which are closed to
-- customers on purpose. So it is a definer in the `my_saved_pros()` family —
-- scoped to `auth.uid()` in its own WHERE, and naming every column it returns.
-- ---------------------------------------------------------------------------

create function public.my_home_record()
returns table (
  job_id uuid,
  place_id uuid,
  place_label text,
  address_text text,
  category_name_he text,
  category_slug text,
  description text,
  completed_at timestamptz,
  total_price numeric,
  pro_name text,
  pro_slug text,
  photo_urls text[]
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    j.id,
    place.id,
    place.label,
    j.address_text,
    c.name_he,
    c.slug,
    j.description,
    f.completed_at,
    f.total_price,
    pr.full_name,
    pp.public_slug,
    j.photo_urls
  from public.jobs j
  join public.job_fees f on f.job_id = j.id and f.completed_at is not null
  join public.categories c on c.id = j.category_id
  join public.profiles pr on pr.id = f.pro_id
  left join public.pro_profiles pp
    on pp.user_id = f.pro_id and pp.verification_status = 'verified'
  left join lateral (
    select sp.id, sp.label
      from public.saved_places sp
     where sp.customer_id = j.customer_id
       and extensions.st_dwithin(sp.location, j.location, 150)
     order by extensions.st_distance(sp.location, j.location)
     limit 1
  ) place on true
  where j.customer_id = (select auth.uid())
    and j.status = 'completed'
  order by f.completed_at desc
  limit 200;
$$;

comment on function public.my_home_record() is
  'The calling customer''s finished jobs, each matched to the nearest of their saved addresses within 150 m. The pro''s slug only while they are verified.';

revoke execute on function public.my_home_record() from public, anon;
grant execute on function public.my_home_record() to authenticated;
