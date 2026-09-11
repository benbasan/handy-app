-- ---------------------------------------------------------------------------
-- The customer stops choosing a broadcast radius.
--
-- Decided with the user, 11.9.2026. Until now a job reached a pro only inside
-- BOTH radii — `least(pro_profiles.radius_km, jobs.search_radius_km)` — and the
-- customer picked their half on the posting form.
--
-- That half is gone. A customer posts a call; it reaches every verified,
-- accepting pro whose *own* service radius covers the address, and each of them
-- decides whether to quote. The reasoning is that the radius was never the
-- customer's question to answer: they do not know how far a plumber is willing
-- to drive, they have no way to find out, and a number they guessed was
-- silently narrowing their own market. A pro who has set 30 km has already
-- answered it, for themselves, with information the customer does not have.
--
-- So CLAUDE.md section 3's "a job reaches a pro only inside BOTH radii" becomes
-- one radius, and it stays where it was: in the RLS policy on `jobs`, not in
-- the feed query, so it holds for anything that ever reads the table.
--
-- The column goes rather than lingering as a nullable nobody reads. It carried
-- no meaning the product still recognises, and a dead column is something
-- somebody reads in a year and believes.
--
-- Six objects move, and the order matters: the one-argument helper has to exist
-- before the policy and the two `can_*` functions can be pointed at it, and the
-- two-argument one cannot be dropped until nothing references it.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. The predicate itself
-- ---------------------------------------------------------------------------

create function public.pro_serves_job(p_point extensions.geography)
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

comment on function public.pro_serves_job(extensions.geography) is
  'Is this job inside the calling pro''s own radius_km? The customer no longer has a radius of their own (11.9.2026), so this is the whole of the reachability rule. Indexed ST_DWithin against the caller''s service_point.';

revoke execute on function public.pro_serves_job(extensions.geography) from public, anon;
grant execute on function public.pro_serves_job(extensions.geography) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Everything that asked the two-argument question
-- ---------------------------------------------------------------------------

drop policy "jobs: verified pro reads open jobs in radius" on public.jobs;

create policy "jobs: verified pro reads open jobs in radius"
  on public.jobs for select to authenticated
  using (
    status in ('open', 'bidding', 'awaiting_pro')
    and public.pro_serves_job(location)
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
      and public.pro_serves_job(j.location)
  );
$$;

comment on function public.can_bid_on_job(uuid) is
  'Is this job still taking bids AND inside the calling pro''s radius? Includes awaiting_pro: an unanswered offer commits nobody, and selected_bid_id is what says the job is taken.';

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
          and public.pro_serves_job(j.location)
        )
        or public.is_bidding_pro(j.id)
        or public.is_assigned_pro(j.id)
      )
  );
$$;

drop function public.pro_serves_job(extensions.geography, int);

-- ---------------------------------------------------------------------------
-- 3. The three counts, which have to agree with the policy above
--
-- A number on a screen that counts anything other than what the feed does is a
-- promise the feed then breaks.
-- ---------------------------------------------------------------------------

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

  select count(*)::int into v_count
    from public.pro_profiles p
   where p.verification_status = 'verified'
     and p.accepting_jobs
     and p.service_point is not null
     and extensions.st_dwithin(p.service_point, v_job.location, p.radius_km * 1000);

  return v_count;
end;
$$;

comment on function public.pros_in_range(uuid) is
  'How many verified, accepting pros cover this job''s address with their own radius. Refuses a job the caller is not the customer of.';

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
   where p.verification_status = 'verified'
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

comment on function public.pros_serving_job(uuid) is
  'Which verified, accepting pros would receive this job — the inverse of pro_serves_job(), for the fan-out. Mirrors open_jobs_for_pro()''s predicate so the notification and the feed agree.';

revoke execute on function public.pros_serving_job(uuid) from public, anon, authenticated;

-- The live count under the address field, asked before the job exists. It loses
-- its radius argument for the same reason the form loses its chips.
drop function public.pros_near_point(double precision, double precision, int);

create function public.pros_near_point(
  p_lat double precision,
  p_lng double precision
)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::int
    from public.pro_profiles p
   where p.verification_status = 'verified'
     and p.accepting_jobs
     and p.service_point is not null
     and extensions.st_dwithin(
           p.service_point,
           extensions.st_setsrid(
             extensions.st_makepoint(p_lng, p_lat), 4326
           )::extensions.geography,
           p.radius_km * 1000
         );
$$;

comment on function public.pros_near_point(double precision, double precision) is
  'How many verified, accepting pros would receive a job posted at this point — each one judged by their own radius_km, which is the whole rule since 11.9.2026. Asked before the job exists. Returns a count, never rows.';

revoke execute on function public.pros_near_point(double precision, double precision)
  from public, anon;
grant execute on function public.pros_near_point(double precision, double precision)
  to authenticated;

-- ---------------------------------------------------------------------------
-- 4. The feed stops returning a column that no longer exists
-- ---------------------------------------------------------------------------

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
    -- `p_max_km` is the pro's own narrowing of their own radius, from the feed
    -- filter chips. It was never the customer's number and is untouched here.
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
-- 5. The column
--
-- Last, because everything above had to stop reading it first. Dropping it also
-- drops the column-scoped INSERT grant the customer held on it, so there is no
-- separate revoke to remember.
-- ---------------------------------------------------------------------------

alter table public.jobs drop column search_radius_km;
