-- ---------------------------------------------------------------------------
-- Phase 12 — how many pros are actually out there, and letting the customer
-- widen the broadcast when the answer is none.
--
-- The screen that told a customer "הקריאה נשלחה ל-0 בעלי מקצוע מאומתים בסביבה,
-- אין צורך לרענן" was, on launch day in most towns, the default experience:
-- an accurate number, a dead end, and nothing to do about it. Two things are
-- missing to fix that, and both are here.
--
--  1. The count has to be askable BEFORE the job exists. `pros_in_range()`
--     (Phase 4) takes a job id and checks ownership, which is right for the
--     offers screen and useless on the posting form — where the number would
--     actually change the radius somebody picks.
--
--  2. The customer has to be able to widen `search_radius_km` afterwards. It
--     was insertable and never updatable, so the one number they could have
--     changed to rescue a call with no offers was frozen at posting time.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. pros_near_point() — the same question pros_in_range() answers, asked of a
--    point rather than of a row.
--
-- Definer, and it returns an int rather than rows, which is what keeps it
-- inside the rule in CLAUDE.md section 3: `pro_profiles` carries a payout
-- account, a phone and a service point beside the bio, and it gains no read
-- policy here — the same stance `category_stats()` takes on the public pages.
--
-- Granted to `authenticated` only, NOT to `anon`. The posting form sits behind
-- a session, and "how many pros cover this point" asked freely of every point
-- in the country is a map of the supply side that nobody outside needs.
--
-- The radius is `least(p.radius_km, p_radius_km)` because that is what the RLS
-- policy on `jobs` does. A number here that counted anything else would be a
-- promise the feed then breaks. It also means the parameter needs no clamp: a
-- caller asking about 10,000 km is bounded by each pro's own radius, exactly
-- as a posted job would be.
-- ---------------------------------------------------------------------------

create function public.pros_near_point(
  p_lat double precision,
  p_lng double precision,
  p_radius_km int
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
           least(p.radius_km, p_radius_km) * 1000
         );
$$;

comment on function public.pros_near_point(double precision, double precision, int) is
  'How many verified, accepting pros would receive a job posted at this point with this search radius. The same least(radius_km, search_radius_km) the jobs RLS policy uses, asked before the job exists. Returns a count, never rows.';

revoke execute on function public.pros_near_point(double precision, double precision, int)
  from public, anon;
grant execute on function public.pros_near_point(double precision, double precision, int)
  to authenticated;

-- ---------------------------------------------------------------------------
-- 2. search_radius_km becomes updatable by the customer who posted the job.
--
-- A column grant rather than a `security definer` function, and the distinction
-- matters: CLAUDE.md section 3 reserves functions for a value a user must not
-- set themselves. How far to broadcast their own call is not that — it is the
-- same family as `description` and `preferred_time`, which they have been able
-- to edit since Phase 1. The check constraint still bounds it to 1..50, the
-- "customer updates own" policy still bounds it to their own row, and widening
-- a job that already has an assigned pro is inert rather than dangerous: the
-- feed policy requires `selected_bid_id is null` before the radius is even
-- consulted.
-- ---------------------------------------------------------------------------

grant update (search_radius_km) on public.jobs to authenticated;
