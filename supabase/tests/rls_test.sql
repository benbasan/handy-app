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
select plan(282);

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

-- Three, and every one of them theirs: the job this section is about, plus
-- the two Phase 6 added to the seed so the summary and receipt screens have
-- finished work to render. The number is not the point — "no row that is not
-- mine" is, which is why customer B's single job is asserted separately above.
select is(
  (select count(*) from public.jobs),
  3::bigint,
  'and nothing else — every job an unfiltered select returns to customer A is customer A''s'
);

select is(
  (select count(*) from public.jobs where customer_id <> :customer_a),
  0::bigint,
  'stated directly: not one row belonging to anybody else'
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

-- Three open calls inside the radius — the two Tel Aviv ones and the Ramat Gan
-- call Phase 7 seeded so the admin overview has a job nobody has bid on —
-- plus the three Phase 6 seeded as finished work of their own: a pro keeps
-- reading a job they won through every later status (the "assigned pro reads
-- own job" policy from Phase 4). The trade the job is in does not narrow this:
-- the policy gates on verified + accepting + both radii, and the category is a
-- filter inside open_jobs_for_pro(), not a secret.
select is(
  (select count(*) from public.jobs where status in ('open', 'bidding')),
  3::bigint,
  'a verified pro sees every open job inside their 10km radius'
);

select is(
  (select count(*) from public.jobs where status not in ('open', 'bidding')),
  3::bigint,
  'and, beyond the feed, only the jobs they were actually assigned'
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

-- The fixture above plus the three closed jobs Phase 6 added to the seed. As
-- with jobs, the count is incidental; the assertion under it is the one that
-- matters.
select is(
  (select count(*) from public.commission_charges),
  4::bigint,
  'a pro sees their own commission charges'
);

select is(
  (select count(*) from public.commission_charges where pro_id <> :pro_verified),
  0::bigint,
  'and not one row belonging to another pro'
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
  (select count(*) from public.bids where job_id = :job_a),
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
  5::bigint,
  'ההצעות שלי lists exactly the caller''s own bids — the two in this section plus the three closed jobs in the seed'
);

select is(
  (select count(*) from public.my_bids() where status = 'selected'),
  3::bigint,
  'and none belonging to anyone else, at any status'
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

-- ===========================================================================
-- 12. Phase 5 — the transparency rule, live tracking, and the price that is
-- not a column
--
-- Section 11 left job A assigned to the verified pro at 390 ₪ (it repriced its
-- own bid on the way past), so everything below runs against a real job that
-- is actually under way.
--
-- The roadmap's definition of done for this phase is two sentences, and both
-- are proven here: changing a price without an approved `price_updates` row
-- fails *in the database*, and a customer who refuses one leaves the job at
-- the original price.
-- ===========================================================================

reset role;

\set job_c '''d0000000-0000-4000-8000-000000000003'''

-- The photo objects the two requests below will name. The bucket is private
-- and these rows are what the storage policies at the end of the section get
-- to decide about.
insert into storage.objects (bucket_id, name, owner, metadata) values
  ('price-update-photos',
   'a0000000-0000-4000-8000-000000000003/d0000000-0000-4000-8000-000000000001/fault-1.jpg',
   :pro_verified, '{}'),
  ('price-update-photos',
   'a0000000-0000-4000-8000-000000000003/d0000000-0000-4000-8000-000000000001/fault-2.jpg',
   :pro_verified, '{}'),
  ('price-update-photos',
   'a0000000-0000-4000-8000-000000000006/d0000000-0000-4000-8000-000000000001/not-mine.jpg',
   :pro_second, '{}');

select is(
  public.job_effective_price(:job_a),
  390::numeric,
  'the live price of an assigned job is the bid the customer chose — there is no price column anywhere'
);

-- ---------------------------------------------------------------------------
-- Nobody writes the table by hand any more
-- ---------------------------------------------------------------------------

select pg_temp.act_as(:pro_verified);
set local role authenticated;

select throws_ok(
  $$ insert into public.price_updates
       (job_id, pro_id, original_price, new_price, photo_url)
     values ('d0000000-0000-4000-8000-000000000001',
             'a0000000-0000-4000-8000-000000000003', 100, 900, 'x/y/z.jpg') $$,
  '42501',
  null,
  'a pro cannot insert a price update directly — original_price is a money field and would be theirs to assert'
);

reset role;
select pg_temp.act_as(:pro_second);
set local role authenticated;

select throws_ok(
  $$ select public.request_price_update(
       'd0000000-0000-4000-8000-000000000001', 500,
       'a0000000-0000-4000-8000-000000000006/d0000000-0000-4000-8000-000000000001/not-mine.jpg') $$,
  '42501',
  null,
  'a pro who merely bid on the job cannot ask to change its price — only the one who won it'
);

reset role;
select pg_temp.act_as(:pro_verified);
set local role authenticated;

select throws_ok(
  $$ select public.request_price_update(
       'd0000000-0000-4000-8000-000000000001', 500,
       'a0000000-0000-4000-8000-000000000006/d0000000-0000-4000-8000-000000000001/not-mine.jpg') $$,
  '22023',
  null,
  'nor point the request at a photo sitting in another pro''s folder'
);

select throws_ok(
  $$ select public.request_price_update(
       'd0000000-0000-4000-8000-000000000001', 500,
       'a0000000-0000-4000-8000-000000000003/d0000000-0000-4000-8000-000000000002/fault-1.jpg') $$,
  '22023',
  null,
  'nor re-use a photo uploaded against a different job as evidence for this one'
);

select ok(
  public.request_price_update(
    :job_a, 520,
    'a0000000-0000-4000-8000-000000000003/d0000000-0000-4000-8000-000000000001/fault-1.jpg',
    'צינור סדוק בקיר') is not null,
  'the assigned pro does send a request, with a photo from the field'
);

select set_config(
  'handy.test_price_update',
  (select id::text from public.price_updates
    where job_id = :job_a and status = 'pending'),
  true
);

select is(
  (select original_price from public.price_updates
    where id = current_setting('handy.test_price_update')::uuid),
  390::numeric,
  'and its original_price is read from the agreed price, never accepted from the caller'
);

select is(
  public.job_effective_price(:job_a),
  390::numeric,
  'a request that is merely pending moves nothing — the price is still the one that was agreed'
);

select throws_ok(
  $$ select public.request_price_update(
       'd0000000-0000-4000-8000-000000000001', 600,
       'a0000000-0000-4000-8000-000000000003/d0000000-0000-4000-8000-000000000001/fault-2.jpg') $$,
  '22023',
  null,
  'and a second request cannot queue behind it — the customer''s screen has two buttons, not a backlog'
);

select throws_ok(
  $$ select public.decide_price_update(
       current_setting('handy.test_price_update')::uuid, true) $$,
  '42501',
  null,
  'the pro cannot approve their own price change'
);

reset role;
select pg_temp.act_as(:customer_b);
set local role authenticated;

select throws_ok(
  $$ select public.decide_price_update(
       current_setting('handy.test_price_update')::uuid, true) $$,
  '42501',
  null,
  'and neither can a customer who has nothing to do with the job'
);

select is(
  (select count(*) from public.price_updates
    where job_id = 'd0000000-0000-4000-8000-000000000001'),
  0::bigint,
  'who cannot even read the request — price_updates is scoped to the two sides of the job'
);

reset role;
select pg_temp.act_as(:customer_a);
set local role authenticated;

select throws_ok(
  $$ update public.price_updates set status = 'approved'
      where id = current_setting('handy.test_price_update')::uuid $$,
  '42501',
  null,
  'the customer holds no UPDATE grant on price_updates either — approving is a checked function, not a column'
);

-- ---------------------------------------------------------------------------
-- The rule itself: refusing leaves the job at the price that was agreed
-- ---------------------------------------------------------------------------

select is(
  public.decide_price_update(
    current_setting('handy.test_price_update')::uuid, false),
  'rejected',
  'the customer refuses the change'
);

select is(
  public.job_effective_price(:job_a),
  390::numeric,
  'and the job carries on at the original price — product-spec.md 3.5, proven rather than promised'
);

select throws_ok(
  $$ select public.decide_price_update(
       current_setting('handy.test_price_update')::uuid, true) $$,
  '22023',
  null,
  'a decision is final: a refused request cannot be approved afterwards'
);

reset role;

-- No role at all, not even the one running this suite, can edit a settled row:
-- the guard is a trigger, so it holds below RLS as well as above it.
select throws_ok(
  $$ update public.price_updates set new_price = 900
      where id = current_setting('handy.test_price_update')::uuid $$,
  '22023',
  null,
  'and the amounts on a decided request are frozen even for a caller that bypasses RLS entirely'
);

-- ---------------------------------------------------------------------------
-- An approved one, which is the only thing that may move the price
-- ---------------------------------------------------------------------------

select pg_temp.act_as(:pro_verified);
set local role authenticated;

select ok(
  public.request_price_update(
    :job_a, 520,
    'a0000000-0000-4000-8000-000000000003/d0000000-0000-4000-8000-000000000001/fault-2.jpg') is not null,
  'the pro asks again, with the second photo'
);

select set_config(
  'handy.test_price_update',
  (select id::text from public.price_updates
    where job_id = :job_a and status = 'pending'),
  true
);

reset role;
select pg_temp.act_as(:customer_a);
set local role authenticated;

select is(
  public.decide_price_update(
    current_setting('handy.test_price_update')::uuid, true),
  'approved',
  'this time the customer approves'
);

select is(
  public.job_effective_price(:job_a),
  520::numeric,
  'and only now does the price of the job move'
);

-- ---------------------------------------------------------------------------
-- Live location
-- ---------------------------------------------------------------------------

select throws_ok(
  $$ insert into public.job_locations (job_id, pro_id, location)
     values ('d0000000-0000-4000-8000-000000000001',
             'a0000000-0000-4000-8000-000000000003',
             extensions.st_point(34.78, 32.08)::extensions.geography) $$,
  '42501',
  null,
  'no client role can write job_locations directly — a position a customer could type is not a position'
);

reset role;
select pg_temp.act_as(:pro_second);
set local role authenticated;

select throws_ok(
  $$ select public.report_job_location(
       'd0000000-0000-4000-8000-000000000001', 32.08, 34.78) $$,
  '42501',
  null,
  'a pro cannot report themselves as being on their way to somebody else''s job'
);

reset role;
select pg_temp.act_as(:pro_verified);
set local role authenticated;

select throws_ok(
  $$ select public.report_job_location(
       'd0000000-0000-4000-8000-000000000001', 51.5, -0.12) $$,
  '22023',
  null,
  'and a coordinate outside the service area is refused rather than drawn on the map'
);

select ok(
  public.report_job_location(:job_a, 32.0790, 34.7830, 20, 9) is not null,
  'the assigned pro reports where they are'
);

reset role;
select pg_temp.act_as(:customer_a);
set local role authenticated;

select is(
  (select count(*) from public.job_locations where job_id = :job_a),
  1::bigint,
  'the customer whose job it is watches the pro arrive'
);

select is(
  (select eta_minutes from public.job_locations where job_id = :job_a),
  9,
  'including the ETA the pro''s own device reported'
);

select throws_ok(
  $$ update public.job_locations set eta_minutes = 1
      where job_id = 'd0000000-0000-4000-8000-000000000001' $$,
  '42501',
  null,
  'but cannot edit it — job_locations has no UPDATE grant for anyone'
);

reset role;
select pg_temp.act_as(:customer_b);
set local role authenticated;

select is(
  (select count(*) from public.job_locations),
  1::bigint,
  'another customer sees only the pro coming to their own job, never anyone else''s'
);

select is(
  (select count(*) from public.job_locations where job_id = :job_a),
  0::bigint,
  'and specifically not the live position on customer A''s job'
);

reset role;
select pg_temp.act_as(:pro_second);
set local role authenticated;

select is(
  (select count(*) from public.job_locations where job_id = :job_a),
  0::bigint,
  'nor can a rival pro who bid on the same job follow the one who won it'
);

-- ---------------------------------------------------------------------------
-- The one status transition this phase owns
-- ---------------------------------------------------------------------------

reset role;
select pg_temp.act_as(:customer_a);
set local role authenticated;

select throws_ok(
  $$ select public.mark_job_in_progress('d0000000-0000-4000-8000-000000000001') $$,
  '42501',
  null,
  'a customer cannot declare that the work has started'
);

reset role;
select pg_temp.act_as(:pro_verified);
set local role authenticated;

select is(
  public.mark_job_in_progress(:job_a),
  'in_progress',
  '"הגעתי ללקוח" moves the job, and only the assigned pro may press it'
);

select is(
  (select status from public.jobs where id = :job_a),
  'in_progress',
  'which actually lands on the row'
);

select is(
  public.mark_job_in_progress(:job_a),
  'in_progress',
  'and pressing it twice is not an error — a retried request must not be one'
);

select is(
  (select current_price from public.my_active_jobs() where job_id = :job_a),
  520::numeric,
  'העבודות שלי lists the job at its live price, approved update included'
);

select is(
  (select agreed_price from public.my_active_jobs() where job_id = :job_a),
  390::numeric,
  'beside the price that was originally agreed'
);

-- ---------------------------------------------------------------------------
-- The phone numbers behind the two "חיוג" buttons
-- ---------------------------------------------------------------------------

select is(
  (select counterpart_phone from public.job_contact(:job_a)),
  '972500000001',
  'the pro on the way can call the customer'
);

reset role;
select pg_temp.act_as(:customer_a);
set local role authenticated;

select is(
  (select counterpart_phone from public.job_contact(:job_a)),
  '972500000003',
  'and the customer can call the pro — a phone number profiles itself would never hand over'
);

select is(
  (select count(*) from public.profiles),
  1::bigint,
  'without opening profiles: the customer still reads exactly one row there, their own'
);

reset role;
select pg_temp.act_as(:customer_b);
set local role authenticated;

select throws_ok(
  $$ select * from public.job_contact('d0000000-0000-4000-8000-000000000001') $$,
  '42501',
  null,
  'and a stranger to the job is told nothing about either side of it'
);

-- ---------------------------------------------------------------------------
-- The price-update photo, which is the evidence the whole rule rests on
-- ---------------------------------------------------------------------------

reset role;
select pg_temp.act_as(:pro_verified);
set local role authenticated;

select is(
  (select count(*) from storage.objects
    where bucket_id = 'price-update-photos'
      and name like 'a0000000-0000-4000-8000-000000000003/%'),
  2::bigint,
  'a pro reads the photos in their own folder'
);

select is(
  (select count(*) from storage.objects
    where bucket_id = 'price-update-photos'
      and name like 'a0000000-0000-4000-8000-000000000006/%'),
  0::bigint,
  'and none of another pro''s'
);

reset role;
select pg_temp.act_as(:customer_a);
set local role authenticated;

select is(
  (select count(*) from storage.objects where bucket_id = 'price-update-photos'),
  2::bigint,
  'the customer sees exactly the photos attached to a price update on their own job'
);

select throws_ok(
  $$ delete from storage.objects
      where bucket_id = 'price-update-photos'
        and name = 'a0000000-0000-4000-8000-000000000003/d0000000-0000-4000-8000-000000000001/fault-2.jpg' $$,
  '42501',
  null,
  'and nobody can delete one: an approval whose photo can vanish afterwards is not evidence'
);

reset role;
select pg_temp.act_as(:customer_b);
set local role authenticated;

select is(
  (select count(*) from storage.objects where bucket_id = 'price-update-photos'),
  0::bigint,
  'a customer with no price update of their own sees nothing in the bucket at all'
);

reset role;

-- ===========================================================================
-- 13. Phase 6 — closing a job: the commission, the receipt and the rating
--
-- The roadmap's definition of done for this phase asks for the commission to
-- be right "גם עם ובלי price_updates מאושרים", so both cases are here: job A
-- closes at 520 (390 agreed, +130 the customer approved in section 12) and
-- job C closes at the 320 that was agreed, with a request the customer never
-- answered settled on the way out.
-- ===========================================================================

reset role;

-- The fixture at the top of this file stands in for a charge that already
-- exists, and section 5 has had everything it needs from it. This section is
-- about the row complete_job() writes, and job_id is unique.
delete from public.commission_charges where job_id = :job_a;

select pg_temp.act_as(:customer_a);
set local role authenticated;

select throws_ok(
  $$ select public.complete_job('d0000000-0000-4000-8000-000000000001', 'cash') $$,
  '42501',
  null,
  'a customer cannot close the job themselves — the commission is charged to the pro who did the work'
);

reset role;
select pg_temp.act_as(:pro_second);
set local role authenticated;

select throws_ok(
  $$ select public.complete_job('d0000000-0000-4000-8000-000000000001', 'cash') $$,
  '42501',
  null,
  'and neither can a pro who bid on the job and lost it'
);

reset role;
select pg_temp.act_as(:pro_verified);
set local role authenticated;

select throws_ok(
  $$ select public.complete_job('d0000000-0000-4000-8000-000000000001', 'crypto') $$,
  '22023',
  null,
  'the payment method is a closed vocabulary — Handy records how the pro was paid, it does not invent methods'
);

select ok(
  public.complete_job(:job_a, 'cash') is not null,
  '"סיימתי — עדכן גבייה": the assigned pro closes the job'
);

select is(
  (select status from public.jobs where id = :job_a),
  'completed',
  'which moves the job to completed'
);

select is(
  (select base_price from public.commission_charges where job_id = :job_a),
  390::numeric,
  'the commission row records the bid that was agreed as the base'
);

select is(
  (select total_price from public.commission_charges where job_id = :job_a),
  520::numeric,
  'the price that actually held — job_effective_price(), approved update included — as the total'
);

select is(
  (select commission_amount from public.commission_charges where job_id = :job_a),
  62.40::numeric,
  'and 12% of that total as Handy''s cut, computed in the database and never sent by the client'
);

select is(
  public.complete_job(:job_a, 'cash'),
  (select id from public.commission_charges where job_id = :job_a),
  'pressing it twice returns the same charge rather than raising — this is the last thing a pro does, often on a phone'
);

select is(
  (select count(*) from public.commission_charges where job_id = :job_a),
  1::bigint,
  'and there is still exactly one commission row for the job'
);

select throws_ok(
  $$ insert into public.commission_charges
       (job_id, pro_id, base_price, total_price, commission_amount, payment_method)
     values ('d0000000-0000-4000-8000-000000000002',
             'a0000000-0000-4000-8000-000000000003', 900, 900, 1, 'cash') $$,
  '42501',
  null,
  'a pro cannot write their own commission row — the table has never had an INSERT grant'
);

select throws_ok(
  $$ update public.commission_charges set commission_amount = 0
      where job_id = 'd0000000-0000-4000-8000-000000000001' $$,
  '42501',
  null,
  'nor lower the one that was written for them'
);

select is(
  (select commission_amount from public.job_receipt(:job_a)),
  62.40::numeric,
  'the pro''s receipt shows what Handy took'
);

select is(
  (select net_amount from public.job_receipt(:job_a)),
  457.60::numeric,
  'and what is left after it'
);

reset role;
select pg_temp.act_as(:customer_a);
set local role authenticated;

select is(
  (select count(*) from public.commission_charges),
  0::bigint,
  'the customer cannot see the commission row at all — the 12% is between Handy and the pro'
);

select is(
  (select total_price from public.job_receipt(:job_a)),
  520::numeric,
  'their receipt still carries the amount they were charged'
);

select is(
  (select commission_amount from public.job_receipt(:job_a)),
  null::numeric,
  'without the commission, which is none of their business'
);

reset role;
select pg_temp.act_as(:customer_b);
set local role authenticated;

select throws_ok(
  $$ select * from public.job_receipt('d0000000-0000-4000-8000-000000000001') $$,
  '42501',
  null,
  'and a stranger to the job gets no receipt for it'
);

-- ---------------------------------------------------------------------------
-- The rating, which is the pro's public reputation
-- ---------------------------------------------------------------------------

select throws_ok(
  $$ select public.submit_job_review('d0000000-0000-4000-8000-000000000001', 5) $$,
  '42501',
  null,
  'a customer cannot rate a job that is not theirs'
);

reset role;
select pg_temp.act_as(:pro_verified);
set local role authenticated;

select throws_ok(
  $$ select public.submit_job_review('d0000000-0000-4000-8000-000000000001', 5) $$,
  '42501',
  null,
  'and a pro cannot rate themselves'
);

select throws_ok(
  $$ insert into public.reviews (job_id, rating)
     values ('d0000000-0000-4000-8000-000000000001', 5) $$,
  '42501',
  null,
  'nobody writes reviews directly any more: Phase 1''s INSERT grant let a customer rate a pro before the work was done'
);

reset role;
select pg_temp.act_as(:customer_a);
set local role authenticated;

select throws_ok(
  $$ select public.submit_job_review('d0000000-0000-4000-8000-000000000001', 6) $$,
  '22023',
  null,
  'a rating is one to five stars'
);

select ok(
  public.submit_job_review(:job_a, 5, 'הסביר כל שקל לפני שעשה אותו.') is not null,
  'the customer rates the finished job'
);

select is(
  (select rating from public.job_receipt(:job_a)),
  5,
  'and it lands on the summary screen beside the receipt'
);

select ok(
  public.submit_job_review(:job_a, 4) is not null,
  'changing their mind while still on the page replaces the answer rather than failing on a duplicate key'
);

select is(
  (select count(*) from public.reviews where job_id = :job_a),
  1::bigint,
  'leaving exactly one review on the job'
);

reset role;

select is(
  (select rating_avg from public.pro_profiles where user_id = :pro_verified),
  4.7::numeric,
  'and the pro''s rating_avg — a column no client has ever been able to write — is recomputed from the reviews themselves'
);

select pg_temp.act_as(:customer_b);
set local role authenticated;

select throws_ok(
  $$ select public.submit_job_review('d0000000-0000-4000-8000-000000000003', 5) $$,
  '22023',
  null,
  'a job that is still under way cannot be rated'
);

-- ---------------------------------------------------------------------------
-- Closing with nothing approved, and a request still waiting
-- ---------------------------------------------------------------------------

reset role;
select pg_temp.act_as(:pro_second);
set local role authenticated;

select is(
  public.job_effective_price(:job_c),
  320::numeric,
  'job C carries a price update the customer never answered, and its price is still the one that was agreed'
);

select ok(
  public.complete_job(:job_c, 'bit') is not null,
  'the pro closes it anyway — waiting for an answer that may never come is not a state a job can be stuck in'
);

select is(
  (select status from public.price_updates where job_id = :job_c),
  'rejected',
  'which settles the unanswered request rather than leaving it asking'
);

select is(
  public.job_effective_price(:job_c),
  320::numeric,
  'and the job closes at the price that was agreed — product-spec.md 3.5, at the last moment it can still be broken'
);

select is(
  (select total_price from public.commission_charges where job_id = :job_c),
  320::numeric,
  'the commission row is written against that price'
);

select is(
  (select commission_amount from public.commission_charges where job_id = :job_c),
  38.40::numeric,
  'and 12% of it, with no approved update anywhere in the sum'
);

select is(
  (select count(*) from public.my_completed_jobs()),
  1::bigint,
  'העבודות שלי · היסטוריה shows this pro exactly the one job they closed'
);

select is(
  (select count(*) from public.my_completed_jobs()
    where job_id = 'd0000000-0000-4000-8000-000000000001'),
  0::bigint,
  'and never another pro''s — the earnings screen is scoped inside the function, not in the query behind it'
);

select is(
  (select gross from public.my_earnings_stats()),
  320::numeric,
  'the wallet totals only what this pro earned'
);

reset role;
select pg_temp.act_as(:pro_verified);
set local role authenticated;

select is(
  (select count(*) from public.my_completed_jobs()),
  4::bigint,
  'while the other pro sees their own four'
);

select is(
  (select gross from public.my_earnings_stats()),
  1620::numeric,
  'and their own total'
);

select is(
  (select rating_count from public.my_earnings_stats()),
  3,
  'over the ratings their own customers left'
);

-- ---------------------------------------------------------------------------
-- "שמור לפעם הבאה"
-- ---------------------------------------------------------------------------

reset role;
select pg_temp.act_as(:customer_a);
set local role authenticated;

select lives_ok(
  $$ insert into public.saved_pros (customer_id, pro_id)
     values ('a0000000-0000-4000-8000-000000000001',
             'a0000000-0000-4000-8000-000000000003') $$,
  'the customer saves the pro for next time'
);

select is(
  (select full_name from public.my_saved_pros()),
  'דוד מזרחי',
  'and the list can name them, which two ids alone could not'
);

reset role;
select pg_temp.act_as(:customer_b);
set local role authenticated;

select is(
  (select count(*) from public.my_saved_pros()),
  0::bigint,
  'somebody else''s saved list is not theirs to read'
);


-- ===========================================================================
-- 14. Phase 7 — the admin dashboard, and the enforcement behind it
--
-- Two different shapes of protection meet in this phase, and the tests are
-- split along the seam:
--
--  * The dossier an admin reads to judge a dispute is **rows** — jobs, bids,
--    price_updates, messages — and every one of those tables has carried an
--    "admin reads all" policy since the phase that created it. Sections 1, 5
--    and 11 already prove nobody else reads them.
--  * The dashboard's *numbers* are **aggregates**, and an aggregate cannot be
--    expressed as a row policy: "how many jobs today" is not a row anyone
--    owns. Each one is therefore a security definer function that asks
--    is_admin() at its own front door, and this section is what proves the
--    door is shut for everybody else.
--
-- Then the enforcement of product-spec.md 5.4, which is the half that can
-- actually hurt someone: none of it is a hidden button.
-- ===========================================================================

reset role;

\set dispute_from_customer '''e0000000-0000-4000-8000-000000000001'''
\set dispute_from_pro '''e0000000-0000-4000-8000-000000000002'''
\set dispute_decided '''e0000000-0000-4000-8000-000000000003'''

select pg_temp.act_as(:customer_a);
set local role authenticated;

select throws_ok(
  $$ select * from public.admin_overview() $$,
  '42501',
  null,
  'a customer cannot read the overview — its figures are aggregates over everybody'
);

select throws_ok(
  $$ select * from public.admin_jobs() $$,
  '42501',
  null,
  'nor the table of every call in the system'
);

select throws_ok(
  $$ select * from public.admin_disputes() $$,
  '42501',
  null,
  'nor the dispute queue'
);

select throws_ok(
  $$ select * from public.admin_trust_metrics() $$,
  '42501',
  null,
  'nor the trust metrics computed from it'
);

select throws_ok(
  $$ select * from public.admin_jobs_by_day() $$,
  '42501',
  null,
  'nor the calls-per-day chart'
);

select throws_ok(
  $$ select * from public.admin_category_mix() $$,
  '42501',
  null,
  'nor the trade mix under it'
);

select throws_ok(
  $$ select * from public.admin_job_cities() $$,
  '42501',
  null,
  'nor even the list of cities the filter chip offers'
);

reset role;
select pg_temp.act_as(:pro_verified);
set local role authenticated;

select throws_ok(
  $$ select * from public.admin_jobs() $$,
  '42501',
  null,
  'and a verified pro is not an admin either — the gate is the role, not the badge'
);

-- ---------------------------------------------------------------------------
-- What the admin actually gets
-- ---------------------------------------------------------------------------

reset role;
select pg_temp.act_as(:admin_user);
set local role authenticated;

select is(
  (select count(*) from public.admin_jobs(null, null, null, null, null)),
  (select count(*) from public.jobs),
  'the admin sees every call in the system, across both customers'
);

select is(
  (select count(*) from public.admin_job_cities()),
  2::bigint,
  'the city filter offers the cities that actually have calls, derived from the address'
);

select is(
  (select count(*) from public.admin_jobs(null, null, null, 'רמת גן', null)),
  1::bigint,
  'and filtering by one of them narrows to it'
);

select is(
  (select count(*) from public.admin_jobs(null, null, 'hvac', null, null)),
  1::bigint,
  'as does filtering by trade'
);

-- Counted rather than compared to a single row: the H-00001 reference is
-- derived from the uuid's last five digits (lib/validation/jobs.ts), so two
-- different calls can wear the same one. The search has to find the call, not
-- pretend the reference is a key.
select is(
  (select count(*) from public.admin_jobs('H-00001', null, null, null, null)
    where job_id = 'd0000000-0000-4000-8000-000000000001'),
  1::bigint,
  'searching the H-00001 reference from the design finds that call'
);

select is(
  (select count(*) from public.admin_jobs(null, 'completed', null, null, null)),
  (select count(*) from public.jobs where status = 'completed'),
  'and the status filter agrees with the table underneath it'
);

select is(
  (select open_disputes from public.admin_overview()),
  2,
  'the overview counts the cases still waiting for a human'
);

select is(
  (select jobs_without_bids from public.admin_overview()),
  1,
  'and the "קריאות ללא הצעות מעל שעה" alert counts a real call, not a placeholder'
);

select is(
  (select count(*) from public.admin_jobs_by_day(7)),
  7::bigint,
  'the chart returns a bar per day including the quiet ones'
);

select is(
  (select category_slug from public.admin_category_mix(30) limit 1),
  'plumbing',
  'and the legend under it is ordered by how much work each trade actually saw'
);

select is(
  (select disputes_count from public.admin_trust_metrics()),
  3,
  'מדדי אמון counts every case opened in the window'
);

select is(
  (select price_updates_approved_pct from public.admin_trust_metrics()),
  50::numeric,
  'and the share of field price updates a customer agreed to — the number that separates a real fault from an inflated bill'
);

-- ---------------------------------------------------------------------------
-- A dispute belongs to the person who opened it, and to nobody else's pen
-- ---------------------------------------------------------------------------

reset role;
select pg_temp.act_as(:customer_a);
set local role authenticated;

select is(
  (select count(*) from public.disputes),
  2::bigint,
  'a customer sees the cases on their own calls'
);

select is(
  (select count(*) from public.disputes
    where id = 'e0000000-0000-4000-8000-000000000003'),
  0::bigint,
  'and not the one opened on somebody else''s'
);

select throws_ok(
  $$ update public.disputes set status = 'resolved'
      where id = 'e0000000-0000-4000-8000-000000000001' $$,
  '42501',
  null,
  'the complainant cannot close their own case — disputes has no UPDATE grant for any client role'
);

select throws_ok(
  $$ select public.resolve_dispute('e0000000-0000-4000-8000-000000000001', 'resolved', null, 500) $$,
  '42501',
  null,
  'and cannot reach the function that would, however they call it'
);

select throws_ok(
  $$ select public.set_pro_enforcement('a0000000-0000-4000-8000-000000000003', 'require_documents') $$,
  '42501',
  null,
  'nor punish the pro they are complaining about'
);

reset role;
select pg_temp.act_as(:customer_b);
set local role authenticated;

select throws_ok(
  $$ insert into public.disputes (job_id, opened_by, reason, status, credit_amount)
     values ('d0000000-0000-4000-8000-000000000002',
             'a0000000-0000-4000-8000-000000000002', 'רוצה זיכוי', 'resolved', 5000) $$,
  '42501',
  null,
  'and cannot open one already decided in their own favour: Phase 1''s table-wide INSERT grant let them write status and credit_amount, and this phase narrowed it to three columns'
);

select lives_ok(
  $$ insert into public.disputes (job_id, opened_by, reason)
     values ('d0000000-0000-4000-8000-000000000002',
             'a0000000-0000-4000-8000-000000000002',
             'בעל המקצוע לא הגיע במועד שנקבע.') $$,
  'what they can do is state the complaint on their own call'
);

select is(
  (select status from public.disputes
    where job_id = 'd0000000-0000-4000-8000-000000000002'),
  'open',
  'which arrives open, at the default, waiting for somebody at Handy'
);

select throws_ok(
  $$ insert into public.disputes (job_id, opened_by, reason)
     values ('d0000000-0000-4000-8000-000000000002',
             'a0000000-0000-4000-8000-000000000002', 'ושוב') $$,
  '23505',
  null,
  'a second live case on the same call is the same case — one row, or two answers to one question'
);

reset role;
select pg_temp.act_as(:customer_a);
set local role authenticated;

select throws_ok(
  $$ insert into public.disputes (job_id, opened_by, reason)
     values ('d0000000-0000-4000-8000-000000000002',
             'a0000000-0000-4000-8000-000000000001', 'לא העבודה שלי') $$,
  '42501',
  null,
  'and a stranger to the call cannot open one on it at all'
);

-- ---------------------------------------------------------------------------
-- "הכרעה וזיכוי"
-- ---------------------------------------------------------------------------

reset role;
select pg_temp.act_as(:admin_user);
set local role authenticated;

select is(
  public.resolve_dispute(
    'e0000000-0000-4000-8000-000000000001', 'resolved',
    'נבדק מול תיעוד הקריאה: התמונה אינה של התקלה בכתובת הזו.', 140),
  'resolved',
  'the admin decides the case against the full documentation of the call'
);

select is(
  (select credit_amount from public.disputes
    where id = 'e0000000-0000-4000-8000-000000000001'),
  140::numeric,
  'and the credit to the customer is written by the same statement that closes it'
);

select ok(
  (select resolved_at is not null and resolved_by = 'a0000000-0000-4000-8000-000000000005'
     from public.disputes where id = 'e0000000-0000-4000-8000-000000000001'),
  'stamped with when, and by whom — which is what "זמן הכרעה ממוצע" is measured from'
);

select throws_ok(
  $$ select public.resolve_dispute('e0000000-0000-4000-8000-000000000001', 'rejected') $$,
  '22023',
  null,
  'a decided case cannot be decided again'
);

select throws_ok(
  $$ select public.resolve_dispute('e0000000-0000-4000-8000-000000000002', 'rejected', null, 90) $$,
  '22023',
  null,
  'and a credit cannot ride along with a case that was refused'
);

select throws_ok(
  $$ select public.resolve_dispute('e0000000-0000-4000-8000-000000000002', 'ignored') $$,
  '22023',
  null,
  'the outcomes are a closed vocabulary'
);

-- ---------------------------------------------------------------------------
-- כלי אכיפה — product-spec.md 5.4, enforced where the thing happens
-- ---------------------------------------------------------------------------

reset role;

-- Section 13 closed job C. The block under test is checked inside
-- request_price_update(), which needs a call still under way, so the fixture
-- goes back to where Phase 5 left it.
update public.jobs set status = 'in_progress'
 where id = 'd0000000-0000-4000-8000-000000000003';

select pg_temp.act_as(:admin_user);
set local role authenticated;

select is(
  public.set_pro_enforcement('a0000000-0000-4000-8000-000000000006', 'block_price_updates'),
  'block_price_updates',
  'the admin blocks field price updates for one pro'
);

reset role;
select pg_temp.act_as(:pro_second);
set local role authenticated;

select throws_ok(
  $$ select public.request_price_update(
       'd0000000-0000-4000-8000-000000000003', 900,
       'a0000000-0000-4000-8000-000000000006/d0000000-0000-4000-8000-000000000003/fault2.jpg') $$,
  '42501',
  null,
  'and the block bites inside the only function that can write the table, not on a hidden button'
);

select throws_ok(
  $$ update public.pro_profiles set price_updates_blocked = false
      where user_id = 'a0000000-0000-4000-8000-000000000006' $$,
  '42501',
  null,
  'the pro cannot lift it themselves — the column has no grant, exactly like verification_status'
);

reset role;
select pg_temp.act_as(:admin_user);
set local role authenticated;

select is(
  public.set_pro_enforcement('a0000000-0000-4000-8000-000000000006', 'unblock_price_updates'),
  'unblock_price_updates',
  'the same tool lifts it again'
);

reset role;
select pg_temp.act_as(:pro_second);
set local role authenticated;

select lives_ok(
  $$ select public.request_price_update(
       'd0000000-0000-4000-8000-000000000003', 900,
       'a0000000-0000-4000-8000-000000000006/d0000000-0000-4000-8000-000000000003/fault2.jpg') $$,
  'and the identical request then goes through — so it was the block that refused it, not anything else'
);

reset role;
select pg_temp.act_as(:admin_user);
set local role authenticated;

select is(
  public.set_pro_enforcement('a0000000-0000-4000-8000-000000000003', 'require_documents'),
  'require_documents',
  'דרישת מסמכים מחודשת moves the pro back into the queue'
);

select is(
  (select verification_status from public.pro_profiles
    where user_id = 'a0000000-0000-4000-8000-000000000003'),
  'pending',
  'which is not a label: pending is what is_verified_pro() answers false to'
);

select ok(
  (select documents_required_at is not null from public.pro_profiles
    where user_id = 'a0000000-0000-4000-8000-000000000003'),
  'and the demand is stamped, so the pro can be told why'
);

reset role;
select pg_temp.act_as(:pro_verified);
set local role authenticated;

select throws_ok(
  $$ insert into public.bids (job_id, pro_id, price, eta_minutes)
     values ('d0000000-0000-4000-8000-000000000002',
             'a0000000-0000-4000-8000-000000000003', 400, 30) $$,
  '42501',
  null,
  'so the pro cannot take new work until somebody has looked at the documents again'
);

reset role;
select pg_temp.act_as(:admin_user);
set local role authenticated;

select throws_ok(
  $$ select public.set_pro_enforcement('a0000000-0000-4000-8000-000000000003', 'ban') $$,
  '22023',
  null,
  'the enforcement actions are a closed vocabulary too'
);

select is(
  public.set_pro_verification('a0000000-0000-4000-8000-000000000003', 'verified'),
  'verified',
  'and the admin can put them back'
);

reset role;
select pg_temp.act_as(:pro_verified);
set local role authenticated;

select lives_ok(
  $$ insert into public.bids (job_id, pro_id, price, eta_minutes)
     values ('d0000000-0000-4000-8000-000000000002',
             'a0000000-0000-4000-8000-000000000003', 400, 30) $$,
  'after which the same offer they were refused a moment ago is accepted'
);

reset role;

-- ===========================================================================
-- 15. Phase 8 — the public half: content pages, category+city, pro profiles
--
-- This is the first phase whose audience is `anon`, and the first table an
-- anonymous visitor may write to. Both are here.
-- ===========================================================================

\set pro_third '''a0000000-0000-4000-8000-000000000007'''
\set review_a '''f0000000-0000-4000-8000-000000000001'''

reset role;

-- ---------------------------------------------------------------------------
-- The public read functions, called by somebody with no account at all
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims', '', true);
set local role anon;

select is(
  (select count(*)::int from public.pro_public_profile('david-mizrahi')),
  1,
  'an anonymous visitor can read the public profile of a verified pro'
);

select throws_ok(
  $$ select count(*) from public.pro_profiles $$,
  '42501',
  null,
  'while the table itself stays exactly as shut as it was: the profile is a function, not a widened policy'
);

select ok(
  pg_get_function_result('public.pro_public_profile(text)'::regprocedure) not like '%payout%'
    and pg_get_function_result('public.pro_public_profile(text)'::regprocedure) not like '%phone%'
    and pg_get_function_result('public.pro_public_profile(text)'::regprocedure) not like '%service_point%',
  'and the columns it does name carry no payout account, no phone and no service point'
);

-- Three, not the seed's two: section 13 closes another of this pro's jobs and
-- rates it. The number is the point — every review here hangs off a job this
-- pro actually finished, so it moves when the marketplace does.
select is(
  (select count(*)::int from public.pro_public_reviews('david-mizrahi')),
  3,
  'the reviews on that page are the ones attached to jobs this pro actually closed'
);

select is(
  (select reviewer_name from public.pro_public_reviews('david-mizrahi') limit 1),
  'דנה ל.',
  'and a reviewer is a given name and an initial — the page is indexed by search engines'
);

select is(
  (select count(*)::int from public.category_pros('plumbing', 32.0853, 34.7818)),
  3,
  'the category+city page lists the verified pros whose own radius covers that city'
);

select is(
  (select pros_count from public.category_stats('plumbing', 32.0853, 34.7818)),
  3,
  'and its headline figure is counted from the same rows, not written into the page'
);

select is(
  (select count(*)::int from public.category_pros('plumbing', 31.2518, 34.7913)),
  0,
  'a city nobody covers gets an honest empty list rather than the nearest pro'
);

select is(
  (select count(*)::int from public.pricing_guide()),
  10,
  'the cost guide has a row per category, including the ones with nothing closed yet'
);

select is(
  (select jobs_closed from public.pricing_guide() where category_slug = 'plumbing'),
  4,
  'and its numbers come from commission_charges — real closed jobs, including the ones this file closed'
);

select is(
  (select count(*)::int from public.public_pro_slugs()),
  4,
  'the sitemap can enumerate exactly the pros who have a public page'
);

-- A public page belongs to `verified` and to nothing else. Proven by taking it
-- away and putting it back, rather than by finding a pro who happens to be in
-- another state — earlier sections in this file move pros between states.
select is(
  (select count(*)::int from public.pro_public_profile('musa-hadad')),
  1,
  'a second verified pro has a page too'
);

reset role;
select pg_temp.act_as(:admin_user);
set local role authenticated;

select is(
  public.set_pro_verification(:pro_second, 'suspended'),
  'suspended',
  'an admin suspends them'
);

reset role;
set local role anon;

select is(
  (select count(*)::int from public.pro_public_profile('musa-hadad')),
  0,
  'and the public page is simply gone — a suspension is not a badge on a page that stays up'
);

reset role;
select pg_temp.act_as(:admin_user);
set local role authenticated;

select is(
  public.set_pro_verification(:pro_second, 'verified'),
  'verified',
  'and comes back when the suspension is lifted'
);

reset role;
set local role anon;

-- ---------------------------------------------------------------------------
-- support_tickets — the contact form, which has no login on it
-- ---------------------------------------------------------------------------

select lives_ok(
  $$ insert into public.support_tickets (full_name, phone, topic, body)
     values ('אורח', '0500000000', 'other', 'שאלה כללית על השירות שלכם.') $$,
  'an anonymous visitor can open a support ticket — the page works before anyone has an account'
);

select throws_ok(
  $$ insert into public.support_tickets (created_by, full_name, phone, topic, body)
     values ('a0000000-0000-4000-8000-000000000001', 'מתחזה', '0500000000',
             'other', 'פנייה בשם מישהו אחר.') $$,
  '42501',
  null,
  'but cannot sign one with somebody else''s name'
);

select throws_ok(
  $$ select count(*) from public.support_tickets $$,
  '42501',
  null,
  'and holds no privilege to read any of them back'
);

reset role;
select pg_temp.act_as(:customer_a);
set local role authenticated;

select lives_ok(
  $$ insert into public.support_tickets (created_by, full_name, phone, topic, body)
     values ('a0000000-0000-4000-8000-000000000001', 'דנה לוי', '0500000001',
             'active_job', 'הקריאה שלי עדיין ללא הצעות אחרי שעתיים.') $$,
  'a signed-in visitor opens one as themselves'
);

select throws_ok(
  $$ insert into public.support_tickets (created_by, full_name, phone, topic, body)
     values ('a0000000-0000-4000-8000-000000000002', 'דנה לוי', '0500000001',
             'other', 'פנייה בשם לקוח אחר.') $$,
  '42501',
  null,
  'and cannot open one in another customer''s name either'
);

select is(
  (select count(*)::int from public.support_tickets),
  1,
  'customer A sees their own ticket and nothing else — not the anonymous one, not anyone else''s'
);

select throws_ok(
  $$ update public.support_tickets set status = 'closed' $$,
  '42501',
  null,
  'and cannot close their own case: the status is the support team''s answer to it'
);

reset role;
select pg_temp.act_as(:customer_b);
set local role authenticated;

select is(
  (select count(*)::int from public.support_tickets),
  0,
  'customer B cannot read customer A''s support ticket'
);

reset role;
select pg_temp.act_as(:admin_user);
set local role authenticated;

select is(
  (select count(*)::int from public.support_tickets),
  2,
  'the admin reads both — the attributed one and the anonymous one'
);

-- ---------------------------------------------------------------------------
-- The public slug: a pro's own description of themselves, shape-checked
-- ---------------------------------------------------------------------------

reset role;
select pg_temp.act_as(:pro_verified);
set local role authenticated;

select lives_ok(
  $$ update public.pro_profiles set public_slug = 'david-the-plumber'
      where user_id = 'a0000000-0000-4000-8000-000000000003' $$,
  'a pro may choose their own public URL, the way they choose their own bio'
);

select throws_ok(
  $$ update public.pro_profiles set public_slug = 'help'
      where user_id = 'a0000000-0000-4000-8000-000000000003' $$,
  '23514',
  null,
  'but not one of the app''s own /pro/... paths — a check constraint, so it holds through any client'
);

select throws_ok(
  $$ update public.pro_profiles set public_slug = 'musa-hadad'
      where user_id = 'a0000000-0000-4000-8000-000000000003' $$,
  '23505',
  null,
  'and not one somebody else is already using'
);

select lives_ok(
  $$ update public.pro_profiles set public_slug = 'stolen-address'
      where user_id = 'a0000000-0000-4000-8000-000000000006' $$,
  'an update aimed at another pro''s row matches nothing rather than erroring'
);

reset role;

select is(
  (select public_slug from public.pro_profiles
    where user_id = 'a0000000-0000-4000-8000-000000000006'),
  'musa-hadad',
  'and that pro''s address is untouched — the row policy never let it through'
);

-- ---------------------------------------------------------------------------
-- מענה לביקורות — product-spec.md 4.8
-- ---------------------------------------------------------------------------

select pg_temp.act_as(:pro_verified);
set local role authenticated;

select is(
  public.reply_to_review(:review_a, 'תודה! כל טוב.'),
  :review_a::uuid,
  'the pro who did the job answers the review of it'
);

select throws_ok(
  $$ update public.reviews set pro_reply = 'כתיבה ישירה'
      where job_id = 'd0000000-0000-4000-8000-000000000004' $$,
  '42501',
  null,
  'and cannot write the column directly — a review is a public reputation, so there is no grant on either half of it'
);

reset role;
select pg_temp.act_as(:pro_third);
set local role authenticated;

select throws_ok(
  $$ select public.reply_to_review(
       'f0000000-0000-4000-8000-000000000001',
       'זו לא העבודה שלי אבל אענה בכל זאת.') $$,
  '42501',
  null,
  'a different pro cannot answer a review of somebody else''s work'
);

reset role;
select pg_temp.act_as(:customer_a);
set local role authenticated;

select throws_ok(
  $$ select public.reply_to_review(
       'f0000000-0000-4000-8000-000000000001',
       'אני אענה לעצמי.') $$,
  '42501',
  null,
  'and neither can the customer who wrote it'
);

-- ---------------------------------------------------------------------------
-- pro-media — the project's first public bucket
-- ---------------------------------------------------------------------------

reset role;
select pg_temp.act_as(:pro_verified);
set local role authenticated;

select lives_ok(
  $$ insert into storage.objects (bucket_id, name, owner, metadata)
     values ('pro-media',
             'a0000000-0000-4000-8000-000000000003/avatar.jpg',
             'a0000000-0000-4000-8000-000000000003', '{}') $$,
  'a pro publishes a portrait into their own folder'
);

select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner, metadata)
     values ('pro-media',
             'a0000000-0000-4000-8000-000000000006/avatar.jpg',
             'a0000000-0000-4000-8000-000000000003', '{}') $$,
  '42501',
  null,
  'and cannot publish into another pro''s'
);

reset role;
select pg_temp.act_as(:customer_a);
set local role authenticated;

select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner, metadata)
     values ('pro-media',
             'a0000000-0000-4000-8000-000000000001/avatar.jpg',
             'a0000000-0000-4000-8000-000000000001', '{}') $$,
  '42501',
  null,
  'a customer cannot upload to pro-media at all — that bucket belongs to pros'
);

reset role;
set local role anon;

select is(
  (select count(*)::int from storage.objects where bucket_id = 'pro-media'),
  1,
  'and an anonymous visitor can read it, which is the whole reason this bucket is public'
);

select is(
  (select count(*)::int from storage.objects where bucket_id = 'verification-docs'),
  0,
  'while the identity documents beside it stay invisible — a public bucket was added, not opened'
);

reset role;

select * from finish();

rollback;
