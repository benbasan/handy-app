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
select plan(104);

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

-- Phase 2: the storage rows behind the two seeded jobs' photo_urls, plus one
-- file customer A uploaded and has not attached to any job yet — the draft
-- case, which only the folder-prefix policy can cover.
insert into storage.objects (bucket_id, name, owner, metadata) values
  ('job-media', 'a0000000-0000-4000-8000-000000000001/seed-job-a/leak.jpg', :customer_a, '{}'),
  ('job-media', 'a0000000-0000-4000-8000-000000000002/seed-job-b/socket.jpg', :customer_b, '{}'),
  ('job-media', 'a0000000-0000-4000-8000-000000000001/draft/unattached.jpg', :customer_a, '{}');

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

-- Counted against job B specifically. Since Phase 4 this pro also holds a bid
-- on job A, and a pro keeps reading a job they bid on however far they move —
-- otherwise "ההצעות שלי" would list offers against blank rows. Job B is the
-- one they never bid on, so it is the one the radius predicate alone decides.
select is(
  (select count(*) from public.jobs where id = :job_b),
  0::bigint,
  'the same verified pro, relocated out of radius, loses a job they never bid on — the ST_DWithin predicate is real'
);

select is(
  (select count(*) from public.jobs where id = :job_a),
  1::bigint,
  'but keeps reading the job they did bid on, wherever they are'
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
  (select count(*) from public.jobs where id = :job_b),
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

-- Counted rather than compared to a literal: seed.sql gives this pro an id
-- card and a licence, and the fixture above adds a third. What matters is that
-- every row they can see is theirs.
select is(
  (select count(*) from public.verification_documents where pro_id <> :pro_verified),
  0::bigint,
  'a pro sees no other pro''s verification documents'
);

select cmp_ok(
  (select count(*) from public.verification_documents where pro_id = :pro_verified),
  '>', 0::bigint,
  'a pro does see their own verification documents'
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
-- 7b. Job media in Storage (Phase 2)
--
-- The bucket is private, so every read is a signed URL the API only mints for
-- a caller whose SELECT policy lets them see the row. These are those policies.
-- ===========================================================================

select pg_temp.act_as(:customer_a);
set local role authenticated;

select is(
  (select count(*) from storage.objects where bucket_id = 'job-media'),
  2::bigint,
  'customer A sees their own two job-media files and nothing else'
);

select is(
  (select count(*) from storage.objects
    where name = 'a0000000-0000-4000-8000-000000000002/seed-job-b/socket.jpg'),
  0::bigint,
  'customer A cannot read the photo attached to customer B''s job'
);

select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner, metadata)
     values ('job-media',
             'a0000000-0000-4000-8000-000000000002/smuggled/x.jpg',
             'a0000000-0000-4000-8000-000000000001', '{}') $$,
  '42501',
  null,
  'a customer cannot upload into another customer''s job-media folder'
);

select lives_ok(
  $$ insert into storage.objects (bucket_id, name, owner, metadata)
     values ('job-media',
             'a0000000-0000-4000-8000-000000000001/draft/second.jpg',
             'a0000000-0000-4000-8000-000000000001', '{}') $$,
  'a customer can upload into their own folder'
);

-- Left in place rather than cleaned up: storage.objects carries a trigger that
-- refuses direct DELETE, and the whole file rolls back anyway.
reset role;

-- A verified pro in radius sees the open job, and therefore its photo — but
-- only the photo the job actually references.
select pg_temp.act_as(:pro_verified);
set local role authenticated;

select is(
  (select count(*) from storage.objects
    where name = 'a0000000-0000-4000-8000-000000000001/seed-job-a/leak.jpg'),
  1::bigint,
  'a verified pro in radius reads the photo of a job they can see'
);

select is(
  (select count(*) from storage.objects
    where name = 'a0000000-0000-4000-8000-000000000001/draft/unattached.jpg'),
  0::bigint,
  'the same pro cannot read a file the customer has not attached to any job'
);

select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner, metadata)
     values ('job-media',
             'a0000000-0000-4000-8000-000000000003/mine/x.jpg',
             'a0000000-0000-4000-8000-000000000003', '{}') $$,
  '42501',
  null,
  'a pro cannot upload to job-media at all — that bucket belongs to customers'
);

reset role;

select pg_temp.act_as(:pro_pending);
set local role authenticated;

select is(
  (select count(*) from storage.objects where bucket_id = 'job-media'),
  0::bigint,
  'an unverified pro sees no job media, exactly as they see no jobs'
);

reset role;

set local role anon;

select is(
  (select count(*) from storage.objects where bucket_id = 'job-media'),
  0::bigint,
  'an anonymous visitor sees no job media — the bucket is private'
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

select col_not_null(
  'public', 'jobs', 'search_radius_km',
  'every job carries the radius the customer asked to broadcast it within'
);

select throws_ok(
  $$ update public.jobs set preferred_time = 'whenever'
      where id = 'd0000000-0000-4000-8000-000000000001' $$,
  '23514',
  null,
  'preferred_time is a fixed vocabulary, not free text the UI has to echo blindly'
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

-- ===========================================================================
-- 10. Phase 3 — the pro's side
--
-- Two new tables (pro_categories, job_dismissals), one new private bucket
-- (verification-docs), the two status transitions that are functions rather
-- than column grants, and the rule this phase decided: a job is visible to a
-- pro only inside BOTH radii.
-- ===========================================================================

reset role;

-- Two jobs the same distance from the verified pro's service point (~6 km
-- north of it, well inside his 10 km radius) that differ only in the radius
-- their customer asked for. Everything else about them is identical, so the
-- pair isolates exactly one variable.
insert into public.jobs (
  id, customer_id, category_id, description, location, address_text,
  preferred_time, search_radius_km, status
) values
  (
    'd0000000-0000-4000-8000-0000000000f1',
    :customer_a, 'c0000000-0000-4000-8000-000000000001',
    'ברז דולף — קריאה שהלקוח ביקש לשדר עד 3 ק״מ בלבד.',
    extensions.st_point(34.7818, 32.1393)::extensions.geography,
    'רחוב רחוק 1, תל אביב', 'flexible', 3, 'open'
  ),
  (
    'd0000000-0000-4000-8000-0000000000f2',
    :customer_a, 'c0000000-0000-4000-8000-000000000001',
    'אותה קריאה בדיוק, אבל הלקוח ביקש לשדר עד 10 ק״מ.',
    extensions.st_point(34.7818, 32.1393)::extensions.geography,
    'רחוב רחוק 2, תל אביב', 'flexible', 10, 'open'
  );

insert into storage.objects (bucket_id, name, owner, metadata) values
  ('verification-docs', 'a0000000-0000-4000-8000-000000000003/id-card.jpg', :pro_verified, '{}'),
  ('verification-docs', 'a0000000-0000-4000-8000-000000000004/id-card.jpg', :pro_pending, '{}');

select pg_temp.act_as(:pro_verified);
set local role authenticated;

select cmp_ok(
  (select count(*) from public.pro_categories),
  '>', 0::bigint,
  'a pro reads their own תחומי התמחות'
);

select is(
  (select count(*) from public.pro_categories where pro_id <> :pro_verified),
  0::bigint,
  'a pro cannot see another pro''s תחומי התמחות'
);

select throws_ok(
  $$ insert into public.pro_categories (pro_id, category_id)
     values ('a0000000-0000-4000-8000-000000000004',
             'c0000000-0000-4000-8000-000000000003') $$,
  '42501',
  null,
  'a pro cannot add a specialisation to another pro''s profile'
);

select throws_ok(
  $$ update public.pro_profiles set verification_status = 'verified'
      where user_id = 'a0000000-0000-4000-8000-000000000003' $$,
  '42501',
  null,
  'a pro cannot verify themselves — there is no column grant on verification_status'
);

select throws_ok(
  $$ select public.set_pro_verification(
       'a0000000-0000-4000-8000-000000000003', 'verified') $$,
  '42501',
  null,
  'and cannot reach the same column through the admin function either'
);

select throws_ok(
  $$ select public.submit_pro_for_approval() $$,
  '22023',
  null,
  'an already-verified pro cannot re-submit themselves into the approval queue'
);

-- The both-radii rule, which is the decision this phase had to make.
select is(
  (select count(*) from public.jobs where id = 'd0000000-0000-4000-8000-0000000000f1'),
  0::bigint,
  'a job 6 km away is invisible to a pro with a 10 km radius when its customer asked for 3 km'
);

select is(
  (select count(*) from public.jobs where id = 'd0000000-0000-4000-8000-0000000000f2'),
  1::bigint,
  'the identical job is visible once its customer asks for 10 km — only search_radius_km differed'
);

-- The feed function, which runs as the caller and therefore inherits all of
-- the above rather than re-deciding it.
select is(
  (select count(*) from public.open_jobs_for_pro() where id = :job_a),
  1::bigint,
  'the feed shows an open job in radius and in one of the pro''s trades'
);

select is(
  (select count(*) from public.open_jobs_for_pro() where id = :job_b),
  0::bigint,
  'the feed hides an in-radius job in a trade the pro did not pick'
);

select lives_ok(
  $$ insert into public.job_dismissals (pro_id, job_id)
     values ('a0000000-0000-4000-8000-000000000003',
             'd0000000-0000-4000-8000-000000000001') $$,
  'a pro can dismiss a job from their own feed'
);

select is(
  (select count(*) from public.open_jobs_for_pro() where id = :job_a),
  0::bigint,
  'a dismissed job leaves that pro''s feed'
);

select throws_ok(
  $$ insert into public.job_dismissals (pro_id, job_id)
     values ('a0000000-0000-4000-8000-000000000004',
             'd0000000-0000-4000-8000-000000000002') $$,
  '42501',
  null,
  'a pro cannot dismiss a job on another pro''s behalf'
);

select is(
  (select count(*) from storage.objects
    where name = 'a0000000-0000-4000-8000-000000000003/id-card.jpg'),
  1::bigint,
  'a pro reads their own verification document out of the private bucket'
);

select is(
  (select count(*) from storage.objects
    where name = 'a0000000-0000-4000-8000-000000000004/id-card.jpg'),
  0::bigint,
  'and cannot read another pro''s — unlike job-media there is no shared-visibility path here at all'
);

reset role;

select pg_temp.act_as(:pro_pending);
set local role authenticated;

select is(
  (select count(*) from public.open_jobs_for_pro()),
  0::bigint,
  'a pro still waiting for approval has an empty feed — the verified gate is in the policy, not the query'
);

select is(
  (select count(*) from public.job_dismissals),
  0::bigint,
  'a pro cannot see which jobs another pro dismissed'
);

reset role;

select pg_temp.act_as(:customer_a);
set local role authenticated;

select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner, metadata)
     values ('verification-docs',
             'a0000000-0000-4000-8000-000000000001/id.jpg',
             'a0000000-0000-4000-8000-000000000001', '{}') $$,
  '42501',
  null,
  'a customer cannot upload to verification-docs at all — that bucket belongs to pros'
);

reset role;

select pg_temp.act_as(:admin_user);
set local role authenticated;

select cmp_ok(
  (select count(*) from storage.objects where bucket_id = 'verification-docs'),
  '>=', 2::bigint,
  'an admin reads every verification document — that is the whole point of the approvals queue'
);

select is(
  public.set_pro_verification('a0000000-0000-4000-8000-000000000004', 'verified'),
  'verified',
  'an admin approves a pending pro'
);

select is(
  (select verification_status from public.pro_profiles
    where user_id = 'a0000000-0000-4000-8000-000000000004'),
  'verified',
  'and the change actually landed on the row'
);

select is(
  (select count(*) from public.verification_documents
    where pro_id = 'a0000000-0000-4000-8000-000000000004' and status = 'pending'),
  0::bigint,
  'approving the pro clears their documents out of the unreviewed queue'
);

reset role;

-- ===========================================================================
-- 11. Phase 4 — bidding, choosing, and the chat thread
--
-- The bit that carries money. A bid decides the price of a job, so every way
-- of writing one is narrowed to what its author is actually entitled to say,
-- and the one transition that fixes the price — choosing a bid — is a checked
-- function rather than a column a client can write.
-- ===========================================================================

reset role;

\set pro_second '''a0000000-0000-4000-8000-000000000006'''
\set bid_one '''b0000000-0000-4000-8000-000000000001'''
\set bid_two '''b0000000-0000-4000-8000-000000000002'''
\set bid_three '''b0000000-0000-4000-8000-000000000003'''
\set bid_four '''b0000000-0000-4000-8000-000000000004'''
\set job_far_wide '''d0000000-0000-4000-8000-0000000000f2'''

-- The seeded bids carry a wall-clock deadline, so a suite run more than half
-- an hour after `db reset` would silently be testing lapsed rows. Pin them.
-- The guard trigger refuses to touch a settled bid on purpose, which is the
-- behaviour under test further down, so it steps aside for the fixture rather
-- than being worked around.
alter table public.bids disable trigger bids_guard_update;
update public.bids
   set status = 'pending', expires_at = now() + interval '40 minutes'
 where id in (:bid_one, :bid_two, :bid_three);
alter table public.bids enable trigger bids_guard_update;

select pg_temp.act_as(:customer_a);
set local role authenticated;

select is(
  (select count(*) from public.bids),
  3::bigint,
  'the customer reads every bid on their own job'
);

select is(
  (select count(*) from public.bids where job_id = :job_b),
  0::bigint,
  'and not one bid from another customer''s job'
);

select is(
  (select count(*) from public.bids_for_job(:job_a)),
  3::bigint,
  'bids_for_job hands the compare screen the three offers with each pro''s name and rating'
);

select throws_ok(
  $$ select * from public.bids_for_job('d0000000-0000-4000-8000-000000000002') $$,
  '42501',
  null,
  'and refuses a job the caller does not own, definer function or not'
);

select cmp_ok(
  public.pros_in_range(:job_a),
  '>=', 3,
  'the banner''s "N בעלי מקצוע ברדיוס X ק״מ" is a real PostGIS count, not a decoration'
);

-- The money path. jobs.selected_bid_id decides the agreed price, so it is not
-- something the browser gets to write.
select throws_ok(
  $$ update public.jobs
        set selected_bid_id = 'b0000000-0000-4000-8000-000000000001'
      where id = 'd0000000-0000-4000-8000-000000000001' $$,
  '42501',
  null,
  'a customer cannot write selected_bid_id directly — choosing a bid fixes the price'
);

select throws_ok(
  $$ update public.jobs set status = 'assigned'
      where id = 'd0000000-0000-4000-8000-000000000001' $$,
  '42501',
  null,
  'nor move the job status by hand'
);

reset role;
select pg_temp.act_as(:pro_verified);
set local role authenticated;

select is(
  (select count(*) from public.bids where pro_id <> :pro_verified),
  0::bigint,
  'a pro sees only their own bids — never what a competitor quoted'
);

select throws_ok(
  $$ update public.bids set status = 'selected'
      where id = 'b0000000-0000-4000-8000-000000000001' $$,
  '42501',
  null,
  'a pro cannot select their own bid — status has no column grant at all'
);

select throws_ok(
  $$ insert into public.bids (job_id, pro_id, price, eta_minutes, expires_at)
     values ('d0000000-0000-4000-8000-0000000000f2',
             'a0000000-0000-4000-8000-000000000003', 250, 30,
             now() + interval '1 year') $$,
  '42501',
  null,
  'nor mint a bid that never lapses — expires_at is not in the INSERT grant'
);

select throws_ok(
  $$ insert into public.bids (job_id, pro_id, price, eta_minutes)
     values ('d0000000-0000-4000-8000-0000000000f1',
             'a0000000-0000-4000-8000-000000000003', 250, 30) $$,
  '42501',
  null,
  'and cannot bid on a job the customer asked to broadcast no further than 3 km'
);

select lives_ok(
  $$ insert into public.bids (job_id, pro_id, price, eta_minutes)
     values ('d0000000-0000-4000-8000-0000000000f2',
             'a0000000-0000-4000-8000-000000000003', 250, 30) $$,
  'the identical job, broadcast to 10 km, does take their bid'
);

select is(
  (select status from public.jobs where id = :job_far_wide),
  'bidding',
  'the first bid moves the job from open to bidding, by trigger — the pro holds no update on jobs'
);

select is(
  (select count(*) from public.my_bids()),
  2::bigint,
  'ההצעות שלי lists exactly the caller''s own bids'
);

select lives_ok(
  $$ update public.bids set price = 390
      where id = 'b0000000-0000-4000-8000-000000000001' $$,
  'a pro can reprice a bid that is still live'
);

select cmp_ok(
  (select expires_at from public.bids where id = :bid_one),
  '>', now() + interval '44 minutes',
  'and repricing restarts the 45 minutes, because that is a new offer'
);

reset role;
select pg_temp.act_as(:pro_second);
set local role authenticated;

select throws_ok(
  $$ update public.bids set price = 400
      where id = 'b0000000-0000-4000-8000-000000000004' $$,
  '22023',
  null,
  'a bid that has already lapsed is not editable — that would rewrite history'
);

-- The reason messages.pro_id exists: this pro bid on job A too.
select is(
  (select count(*) from public.messages),
  0::bigint,
  'a pro who bid on the job still cannot read another pro''s conversation with the customer'
);

select throws_ok(
  $$ insert into public.messages (job_id, pro_id, sender_id, body)
     values ('d0000000-0000-4000-8000-000000000001',
             'a0000000-0000-4000-8000-000000000003',
             'a0000000-0000-4000-8000-000000000006', 'מי כתב את זה?') $$,
  '42501',
  null,
  'nor write into it'
);

select lives_ok(
  $$ insert into public.messages (job_id, pro_id, sender_id, body)
     values ('d0000000-0000-4000-8000-000000000001',
             'a0000000-0000-4000-8000-000000000006',
             'a0000000-0000-4000-8000-000000000006', 'שלום, אפשר גם הערב.') $$,
  'but does have their own thread with the customer on the same job'
);

reset role;
select pg_temp.act_as(:pro_verified);
set local role authenticated;

select is(
  (select count(*) from public.messages),
  2::bigint,
  'and the first pro''s view of the same job is still only their own two messages'
);

select throws_ok(
  $$ select * from public.thread_messages(
       'd0000000-0000-4000-8000-000000000001',
       'a0000000-0000-4000-8000-000000000006') $$,
  '42501',
  null,
  'the thread reader refuses a thread the caller is not a side of'
);

reset role;
select pg_temp.act_as(:customer_a);
set local role authenticated;

select is(
  (select count(*) from public.messages),
  3::bigint,
  'the customer reads every thread on their own job — both pros, kept apart from each other'
);

select throws_ok(
  $$ insert into public.messages (job_id, pro_id, sender_id, body)
     values ('d0000000-0000-4000-8000-000000000001',
             'a0000000-0000-4000-8000-000000000004',
             'a0000000-0000-4000-8000-000000000001', 'הלו?') $$,
  '42501',
  null,
  'a customer cannot open a thread with a pro who never made them an offer'
);

select lives_ok(
  $$ insert into public.messages (job_id, pro_id, sender_id, body)
     values ('d0000000-0000-4000-8000-000000000001',
             'a0000000-0000-4000-8000-000000000003',
             'a0000000-0000-4000-8000-000000000001', 'מעולה, נתראה.') $$,
  'and can answer a pro who did'
);

with attempted as (
  update public.messages set read_at = now()
   where sender_id = :customer_a returning 1
)
select is((select count(*) from attempted), 0::bigint,
  'marking your own message as read changes nothing — read_at belongs to the recipient');

-- ---------------------------------------------------------------------------
-- Expiry, then the choice itself
-- ---------------------------------------------------------------------------

reset role;

-- One bid pushed past its deadline, with no sweep run afterwards. Everything
-- below has to be true of it anyway.
update public.bids set expires_at = now() - interval '1 minute' where id = :bid_three;

select pg_temp.act_as(:customer_a);
set local role authenticated;

select throws_ok(
  $$ select public.select_bid('b0000000-0000-4000-8000-000000000003') $$,
  '22023',
  null,
  'a lapsed bid cannot be chosen even while its row still says pending — select_bid re-reads the clock'
);

select cmp_ok(
  public.expire_stale_bids(),
  '>=', 1,
  'and the sweep does settle it, for the screens that read the column'
);

select is(
  (select status from public.bids_for_job(:job_a) where id = :bid_three),
  'expired',
  'after which the compare screen reports it as expired'
);

reset role;
select pg_temp.act_as(:customer_b);
set local role authenticated;

select throws_ok(
  $$ select public.select_bid('b0000000-0000-4000-8000-000000000001') $$,
  '42501',
  null,
  'only the customer who posted the job may choose a bid on it'
);

reset role;
select pg_temp.act_as(:customer_a);
set local role authenticated;

select is(
  public.select_bid(:bid_one),
  :bid_one::uuid,
  'the customer chooses a bid'
);

select is(
  (select status from public.jobs where id = :job_a),
  'assigned',
  'which moves the job to assigned'
);

select is(
  (select selected_bid_id from public.jobs where id = :job_a),
  :bid_one::uuid,
  'and records which offer fixed the price'
);

select is(
  (select count(*) from public.bids where job_id = :job_a and status = 'rejected'),
  1::bigint,
  'choosing one bid locks every rival that was still pending, in the same statement'
);

select throws_ok(
  $$ select public.select_bid('b0000000-0000-4000-8000-000000000002') $$,
  '22023',
  null,
  'and a second choice on the same job is refused'
);

reset role;
select pg_temp.act_as(:pro_second);
set local role authenticated;

select is(
  (select winning_price from public.my_bids() where id = :bid_two),
  390::numeric,
  'a pro who lost is told the price that won, and never who offered it'
);

reset role;

select * from finish();

rollback;
