-- Phase 1 — Row Level Security regression suite.
--
-- Run with `npm run db:test` (wraps `supabase test db`). This is the automated
-- half of the phase's definition of done: "customer A cannot see customer B's
-- job", proven rather than asserted, and re-proven on every CI run so a policy
-- widened in a later phase cannot pass unnoticed.
--
-- Fixtures come from supabase/seed.sql, so the same rows back the manual
-- browser walkthrough. Everything extra this file inserts is rolled back.
--
-- Impersonation works the way PostgREST does it: set request.jwt.claims (which
-- is what auth.uid() reads) and switch to the `authenticated` role. Switching
-- roles matters — the session role, postgres, carries BYPASSRLS and would sail
-- through every policy in here.

begin;

create extension if not exists pgtap with schema extensions;

-- An explicit count, not no_plan(): if a statement aborts the transaction
-- half way through, a bare "everything I ran passed" would still look green.
select plan(33);

-- Seed identities, restated so the tests read as English rather than as UUIDs.
\set customer_a '''a0000000-0000-4000-8000-000000000001'''
\set customer_b '''a0000000-0000-4000-8000-000000000002'''
\set pro_verified '''a0000000-0000-4000-8000-000000000003'''
\set pro_pending '''a0000000-0000-4000-8000-000000000004'''
\set admin_user '''a0000000-0000-4000-8000-000000000005'''
\set job_a '''d0000000-0000-4000-8000-000000000001'''
\set job_b '''d0000000-0000-4000-8000-000000000002'''

create function pg_temp.act_as(p_user uuid) returns void
language plpgsql as $$
begin
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated')::text,
    true
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Fixtures beyond the seed: one commission charge and one verification
-- document per pro, so "a pro sees only their own" has something to fail on.
-- ---------------------------------------------------------------------------

insert into public.commission_charges
  (job_id, pro_id, base_price, total_price, commission_amount, payment_method)
values
  (:job_a, :pro_verified, 500, 500, 60, 'cash'),
  (:job_b, :pro_pending, 800, 800, 96, 'bit');

insert into public.verification_documents (pro_id, doc_type, file_url) values
  (:pro_verified, 'id_card', 'verification-docs/pro3-id.jpg'),
  (:pro_pending, 'id_card', 'verification-docs/pro4-id.jpg');

-- ===========================================================================
-- 1. Job isolation between customers — the headline requirement
-- ===========================================================================

select pg_temp.act_as(:customer_a);
set local role authenticated;

select is(
  (select count(*) from public.jobs where id = :job_a),
  1::bigint,
  'customer A sees their own job'
);

select is(
  (select count(*) from public.jobs where id = :job_b),
  0::bigint,
  'customer A cannot see customer B''s job'
);

select is(
  (select count(*) from public.jobs),
  1::bigint,
  'customer A sees exactly one job in total — no leakage through an unfiltered select'
);

-- An UPDATE that matches no visible row silently affects nothing, which is the
-- correct RLS behaviour; what matters is that B's row is untouched.
with attempted as (
  update public.jobs set description = 'נחטף' where id = :job_b returning 1
)
select is((select count(*) from attempted), 0::bigint,
  'customer A''s update of customer B''s job changes no rows');

select throws_ok(
  $$ delete from public.jobs where id = 'd0000000-0000-4000-8000-000000000002' $$,
  '42501',
  null,
  'no client role holds DELETE on jobs at all'
);

-- ===========================================================================
-- 2. Privilege escalation through self-service columns
-- ===========================================================================

select throws_ok(
  $$ update public.profiles set role = 'admin' where id = 'a0000000-0000-4000-8000-000000000001' $$,
  '42501',
  null,
  'a customer cannot promote themselves to admin — the column grant blocks it'
);

select lives_ok(
  $$ update public.profiles set full_name = 'דנה לוי-כהן' where id = 'a0000000-0000-4000-8000-000000000001' $$,
  'a customer can still edit their own display name'
);

select is(
  (select count(*) from public.profiles),
  1::bigint,
  'a customer sees only their own profile row'
);

reset role;

-- ===========================================================================
-- 3. The pro job feed: verification gate, then radius
-- ===========================================================================

select pg_temp.act_as(:pro_pending);
set local role authenticated;

select is(
  (select count(*) from public.jobs),
  0::bigint,
  'an unverified pro sees no open jobs, however close they are'
);

reset role;
select pg_temp.act_as(:pro_verified);
set local role authenticated;

select is(
  (select count(*) from public.jobs),
  2::bigint,
  'a verified pro sees both open Tel Aviv jobs inside their 10km radius'
);

reset role;

-- Move the same pro to Eilat, ~300km away, and nothing else about them.
update public.pro_profiles
   set service_point = extensions.st_point(34.9482, 29.5577)::extensions.geography
 where user_id = :pro_verified;

select pg_temp.act_as(:pro_verified);
set local role authenticated;

select is(
  (select count(*) from public.jobs),
  0::bigint,
  'the same verified pro, relocated out of radius, sees nothing — the ST_DWithin predicate is real'
);

reset role;

update public.pro_profiles
   set service_point = extensions.st_point(34.7818, 32.0853)::extensions.geography
 where user_id = :pro_verified;

-- Switching off availability has to close the feed too.
update public.pro_profiles set accepting_jobs = false where user_id = :pro_verified;

select pg_temp.act_as(:pro_verified);
set local role authenticated;

select is(
  (select count(*) from public.jobs),
  0::bigint,
  'a pro who has switched off accepting_jobs sees no feed'
);

reset role;
update public.pro_profiles set accepting_jobs = true where user_id = :pro_verified;

-- ===========================================================================
-- 4. A pro cannot verify themselves or rewrite their own reputation
-- ===========================================================================

select pg_temp.act_as(:pro_pending);
set local role authenticated;

select throws_ok(
  $$ update public.pro_profiles set verification_status = 'verified'
      where user_id = 'a0000000-0000-4000-8000-000000000004' $$,
  '42501',
  null,
  'a pro cannot mark themselves verified'
);

select throws_ok(
  $$ update public.pro_profiles set rating_avg = 5.0
      where user_id = 'a0000000-0000-4000-8000-000000000004' $$,
  '42501',
  null,
  'a pro cannot edit their own rating'
);

select lives_ok(
  $$ update public.pro_profiles set bio = 'עודכן', radius_km = 12
      where user_id = 'a0000000-0000-4000-8000-000000000004' $$,
  'a pro can still edit their own bio and service radius'
);

select throws_ok(
  $$ update public.verification_documents set status = 'approved'
      where pro_id = 'a0000000-0000-4000-8000-000000000004' $$,
  '42501',
  null,
  'a pro cannot approve their own verification document'
);

reset role;

-- ===========================================================================
-- 5. Earnings and identity documents stay private
-- ===========================================================================

select pg_temp.act_as(:pro_verified);
set local role authenticated;

select is(
  (select count(*) from public.commission_charges),
  1::bigint,
  'a pro sees exactly their own commission charges'
);

select is(
  (select count(*) from public.commission_charges where pro_id = :pro_pending),
  0::bigint,
  'a pro cannot see another pro''s earnings'
);

select is(
  (select count(*) from public.verification_documents),
  1::bigint,
  'a pro sees only their own verification documents'
);

reset role;
select pg_temp.act_as(:customer_a);
set local role authenticated;

select is(
  (select count(*) from public.commission_charges),
  0::bigint,
  'a customer sees no commission charges whatsoever — the 12% is not their business'
);

select is(
  (select count(*) from public.verification_documents),
  0::bigint,
  'a customer can never read a verification document, only the derived badge'
);

select is(
  (select count(*) from public.pro_profiles),
  0::bigint,
  'a customer has no direct read on pro_profiles in Phase 1'
);

-- ===========================================================================
-- 6. Writing outside your role
-- ===========================================================================

select throws_ok(
  $$ insert into public.bids (job_id, pro_id, price, eta_minutes)
     values ('d0000000-0000-4000-8000-000000000001',
             'a0000000-0000-4000-8000-000000000001', 100, 30) $$,
  '42501',
  null,
  'a customer cannot submit a bid'
);

select throws_ok(
  $$ insert into public.jobs (customer_id, category_id, description, location, address_text)
     values ('a0000000-0000-4000-8000-000000000002',
             'c0000000-0000-4000-8000-000000000001', 'לא שלי',
             extensions.st_point(34.78, 32.08)::extensions.geography, 'כתובת') $$,
  '42501',
  null,
  'a customer cannot post a job on another customer''s behalf'
);

reset role;
select pg_temp.act_as(:pro_pending);
set local role authenticated;

select throws_ok(
  $$ insert into public.bids (job_id, pro_id, price, eta_minutes)
     values ('d0000000-0000-4000-8000-000000000001',
             'a0000000-0000-4000-8000-000000000004', 100, 30) $$,
  '42501',
  null,
  'an unverified pro cannot submit a bid'
);

reset role;

-- ===========================================================================
-- 7. Anonymous visitors
-- ===========================================================================

select set_config('request.jwt.claims', '', true);
set local role anon;

select ok(
  (select count(*) from public.categories) = 10,
  'anonymous visitors can read the category list — the SEO pages need it'
);

select throws_ok(
  $$ select count(*) from public.jobs $$,
  '42501',
  null,
  'anonymous visitors hold no privilege on jobs at all'
);

select throws_ok(
  $$ select count(*) from public.profiles $$,
  '42501',
  null,
  'anonymous visitors hold no privilege on profiles'
);

reset role;

-- ===========================================================================
-- 8. Structural guarantees
-- ===========================================================================

select is(
  (select count(*)
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity),
  0::bigint,
  'every table in the public schema has RLS enabled — catches a future table added without it'
);

select is(
  (select count(*)
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
      and not exists (select 1 from pg_policy p where p.polrelid = c.oid)),
  0::bigint,
  'every table in the public schema has at least one policy — RLS with no policy is a silent black hole'
);

select hasnt_column(
  'public', 'jobs', 'price',
  'jobs has no price column: the price is derived from the selected bid plus approved price_updates, so there is no row to UPDATE directly'
);

select col_not_null(
  'public', 'price_updates', 'photo_url',
  'a price update cannot exist without a photo of the fault'
);

-- ===========================================================================
-- 9. The sign-up role whitelist
--
-- raw_user_meta_data is whatever the browser sent. Asking for admin must not
-- get you admin.
-- ===========================================================================

insert into auth.users (
  instance_id, id, aud, role, phone, phone_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000000',
  'a0000000-0000-4000-8000-0000000000ff', 'authenticated', 'authenticated',
  '972500000255', now(),
  '{"provider":"phone","providers":["phone"]}',
  '{"role":"admin","full_name":"תוקף"}',
  now(), now()
);

select is(
  (select role from public.profiles where id = 'a0000000-0000-4000-8000-0000000000ff'),
  'customer',
  'a sign-up asking for role=admin is downgraded to customer'
);

select * from finish();

rollback;
