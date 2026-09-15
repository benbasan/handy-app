-- Phase 19 — a public count per city has a sample floor, and is never an address.
--
-- open_calls_by_city() (Phase 17) groups open calls by job_city(), which is the
-- last comma-separated part of address_text. addressToStore() used to keep an
-- address whole when it merely ENDED with the town, so "תנופה 7ב דירה 37 חריש"
-- had no comma, job_city() returned all of it, and the pro landing page — which
-- anyone can open — printed a customer's street and flat number as a "city".
--
-- The app now always stores "<street>, <town>" (lib/maps/geocode.ts). This is
-- the half that does not trust it, because the function is granted to anon and
-- rows written before the fix still exist:
--
--   * a city name never contains a digit, and a street address almost always
--     does;
--   * a figure beside the word "open calls" needs three of them, the same floor
--     as a response time or a price range (CLAUDE.md, section 3). One address
--     is never three separate open calls, and "1 בחריש" recruits nobody.
--
-- `create or replace` keeps the signature and therefore the existing grants.

create or replace function public.open_calls_by_city()
returns table (city text, open_calls int)
language sql
stable
security definer
set search_path = ''
as $$
  select public.job_city(j.address_text), count(*)::int
    from public.jobs j
   where j.status in ('open', 'bidding', 'awaiting_pro')
     and j.created_at > now() - interval '14 days'
     and public.job_city(j.address_text) is not null
     and public.job_city(j.address_text) !~ '[0-9]'
   group by 1
  having count(*) >= 3
   order by 2 desc, 1
   limit 8;
$$;

comment on function public.open_calls_by_city() is
  'Open calls from the last fourteen days, counted per city, for the public pro landing page. Only cities with at least three, and never a value containing a digit — a count and a city name, never a call, an address or a customer.';
