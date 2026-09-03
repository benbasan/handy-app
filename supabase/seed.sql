-- Local development seed data, applied by `supabase db reset`.
--
-- Everything here uses fixed UUIDs so that migrations, pgTAP tests and manual
-- browser checks can all refer to the same rows across a reset.
--
-- The demo users' phone numbers are mirrored in supabase/config.toml under
-- [auth.sms.test_otp], which is what makes signing in locally possible with no
-- SMS provider attached. Keep the two lists in step.

-- ---------------------------------------------------------------------------
-- Categories (תחומים)
-- ---------------------------------------------------------------------------

insert into public.categories (id, name_he, slug) values
  ('c0000000-0000-4000-8000-000000000001', 'אינסטלציה',      'plumbing'),
  ('c0000000-0000-4000-8000-000000000002', 'חשמל',           'electrical'),
  ('c0000000-0000-4000-8000-000000000003', 'מיזוג אוויר',    'hvac'),
  ('c0000000-0000-4000-8000-000000000004', 'נגרות',          'carpentry'),
  ('c0000000-0000-4000-8000-000000000005', 'צבע',            'painting'),
  ('c0000000-0000-4000-8000-000000000006', 'מנעולן',         'locksmith'),
  ('c0000000-0000-4000-8000-000000000007', 'גינון',          'gardening'),
  ('c0000000-0000-4000-8000-000000000008', 'ניקיון',         'cleaning'),
  ('c0000000-0000-4000-8000-000000000009', 'הרכבת רהיטים',   'furniture-assembly'),
  ('c0000000-0000-4000-8000-00000000000a', 'איטום',          'waterproofing');

-- ---------------------------------------------------------------------------
-- Demo users
--
-- Inserting straight into auth.users is the standard local-dev shortcut: it
-- fires the on_auth_user_created trigger, so the public.profiles (and, for
-- pros, public.pro_profiles) rows are produced by the same code path a real
-- sign-up takes, rather than being faked alongside it.
--
-- auth.users.phone is stored without the leading '+', which is how Supabase
-- normalises E.164.
-- ---------------------------------------------------------------------------

-- The last user asks for role 'customer' rather than 'admin' on purpose:
-- handle_new_user would ignore 'admin' anyway, and the grant happens by direct
-- SQL further down.
insert into auth.users (
  instance_id, id, aud, role, phone, phone_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  -- GoTrue scans these four into non-nullable Go strings, and unlike the other
  -- token columns on auth.users they carry no DEFAULT ''. Leave them NULL and
  -- every /otp and /verify request dies with "Database error finding user".
  confirmation_token, recovery_token, email_change_token_new, email_change
)
select
  '00000000-0000-0000-0000-000000000000',
  u.id,
  'authenticated',
  'authenticated',
  u.phone,
  now(),
  '{"provider":"phone","providers":["phone"]}'::jsonb,
  jsonb_build_object('role', u.signup_role, 'full_name', u.full_name),
  now(),
  now(),
  '', '', '', ''
from (
  values
    ('a0000000-0000-4000-8000-000000000001'::uuid, '972500000001', 'customer', 'דנה לוי'),
    ('a0000000-0000-4000-8000-000000000002'::uuid, '972500000002', 'customer', 'יוסי כהן'),
    ('a0000000-0000-4000-8000-000000000003'::uuid, '972500000003', 'pro',      'דוד מזרחי'),
    ('a0000000-0000-4000-8000-000000000004'::uuid, '972500000004', 'pro',      'אבי פרץ'),
    ('a0000000-0000-4000-8000-000000000005'::uuid, '972500000005', 'customer', 'מנהלת Handy')
) as u (id, phone, signup_role, full_name);

-- Phone sign-in needs a matching identity row, or verifyOtp has nothing to
-- attach the session to.
insert into auth.identities (
  id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at
)
select
  gen_random_uuid(), u.id, u.id::text, 'phone',
  jsonb_build_object('sub', u.id::text, 'phone', u.phone),
  now(), now(), now()
from auth.users u
where u.phone is not null;

-- The admin. Not reachable through sign-up by design — see handle_new_user.
update public.profiles
   set role = 'admin'
 where id = 'a0000000-0000-4000-8000-000000000005';

-- One verified pro who covers central Tel Aviv, one still pending. The pending
-- one is what proves the verification gate on the job feed actually bites.
update public.pro_profiles
   set verification_status = 'verified',
       bio = 'אינסטלטור מוסמך, 12 שנות ניסיון. שירות מהיר באזור תל אביב.',
       radius_km = 10,
       service_point = extensions.st_point(34.7818, 32.0853)::extensions.geography,
       rating_avg = 4.8,
       jobs_completed_count = 137,
       profile_strength_pct = 90
 where user_id = 'a0000000-0000-4000-8000-000000000003';

update public.pro_profiles
   set bio = 'חשמלאי, בתהליך אימות.',
       radius_km = 8,
       service_point = extensions.st_point(34.7900, 32.0900)::extensions.geography,
       profile_strength_pct = 40
 where user_id = 'a0000000-0000-4000-8000-000000000004';

-- ---------------------------------------------------------------------------
-- Demo jobs
--
-- Beyond the roadmap's literal "a few categories and demo users", but the
-- phase's own definition of done is "customer A cannot see customer B's job" —
-- which is unverifiable against an empty table, in the browser or in pgTAP.
-- One job per customer, both real Tel Aviv coordinates.
-- ---------------------------------------------------------------------------

insert into public.jobs (
  id, customer_id, category_id, description, photo_urls, location, address_text,
  preferred_time, search_radius_km, status, created_at
) values
  (
    'd0000000-0000-4000-8000-000000000001',
    'a0000000-0000-4000-8000-000000000001',
    'c0000000-0000-4000-8000-000000000001',
    'נזילה מתחת לכיור במטבח, המים מטפטפים כל הזמן.',
    -- An object path inside the private job-media bucket, not a public URL:
    -- every view goes through a signed URL minted server-side. The matching
    -- storage.objects row is created by the pgTAP suite, the only reader.
    array['a0000000-0000-4000-8000-000000000001/seed-job-a/leak.jpg'],
    extensions.st_point(34.7806, 32.0809)::extensions.geography,
    'רחוב דיזנגוף 100, תל אביב',
    'today',
    5,
    'open',
    -- Older than the bids below it. Obvious, and worth writing down: the
    -- admin overview's "זמן להצעה ראשונה" averages (first bid − posting), and
    -- a job seeded at now() with a bid backdated ten minutes makes it negative.
    now() - interval '35 minutes'
  ),
  (
    'd0000000-0000-4000-8000-000000000002',
    'a0000000-0000-4000-8000-000000000002',
    'c0000000-0000-4000-8000-000000000002',
    'שקע בסלון הפסיק לעבוד, המפסק קופץ בכל פעם שמחברים מכשיר.',
    array['a0000000-0000-4000-8000-000000000002/seed-job-b/socket.jpg'],
    extensions.st_point(34.7749, 32.0714)::extensions.geography,
    'רחוב אלנבי 40, תל אביב',
    'tomorrow',
    5,
    'open',
    now() - interval '4 hours'
  );

-- ---------------------------------------------------------------------------
-- Phase 3 — the pro side
--
-- Three pro states, so every screen this phase adds has something real to
-- render: one verified and working, one submitted and waiting in the admin
-- queue, and (through the sign-up flow itself) a fresh 'draft'.
-- ---------------------------------------------------------------------------

update public.pro_profiles
   set service_address_text = 'רחוב ברודצקי 18, תל אביב',
       work_days = array[0, 1, 2, 3, 4]::smallint[],
       work_start_time = '07:00',
       work_end_time = '19:00',
       onboarding_step = 5,
       submitted_at = now() - interval '30 days',
       payment_methods = array['cash', 'bit', 'bank_transfer'],
       payout_bank_name = 'בנק לאומי',
       payout_bank_branch = '800',
       payout_account_last4 = '4417'
 where user_id = 'a0000000-0000-4000-8000-000000000003';

-- The pending pro has submitted and is waiting on the admin queue, which is
-- what /admin/pros exists to clear.
update public.pro_profiles
   set verification_status = 'pending',
       service_address_text = 'רחוב אלנבי 12, תל אביב',
       work_days = array[0, 1, 2, 3, 4, 5]::smallint[],
       onboarding_step = 5,
       submitted_at = now() - interval '9 hours',
       payment_methods = array['cash', 'paybox'],
       payout_bank_name = 'בנק הפועלים',
       payout_bank_branch = '612',
       payout_account_last4 = '9930'
 where user_id = 'a0000000-0000-4000-8000-000000000004';

insert into public.pro_categories (pro_id, category_id) values
  -- אינסטלציה + איטום for the verified pro: job A (plumbing) reaches his feed,
  -- job B (electrical) does not, which is the category filter doing its job.
  ('a0000000-0000-4000-8000-000000000003', 'c0000000-0000-4000-8000-000000000001'),
  ('a0000000-0000-4000-8000-000000000003', 'c0000000-0000-4000-8000-00000000000a'),
  ('a0000000-0000-4000-8000-000000000004', 'c0000000-0000-4000-8000-000000000002');

-- Object paths inside the private verification-docs bucket, never public URLs
-- — the same rule job media follows.
insert into public.verification_documents (pro_id, doc_type, file_url, status, reviewed_at) values
  ('a0000000-0000-4000-8000-000000000003', 'id_card',
   'a0000000-0000-4000-8000-000000000003/id-card.jpg', 'approved', now() - interval '29 days'),
  ('a0000000-0000-4000-8000-000000000003', 'license',
   'a0000000-0000-4000-8000-000000000003/license.pdf', 'approved', now() - interval '29 days'),
  ('a0000000-0000-4000-8000-000000000004', 'id_card',
   'a0000000-0000-4000-8000-000000000004/id-card.jpg', 'pending', null);

-- ---------------------------------------------------------------------------
-- Phase 4 — bids and a conversation
--
-- design/screens/customer-2.2-compare-bids.png shows three offers side by
-- side, which needs three verified pros who actually cover the same address.
-- Two more join the seed for that, both real coordinates a few hundred metres
-- from job A. Their names are the ones on the design's own cards.
--
-- The fourth bid is deliberately already lapsed: it is what gives the
-- "נדחו / פגו" tab on design/screens/pro-2.4-my-bids.png something real, and
-- what proves business rule 6 has a visible effect without waiting 45 minutes.
-- ---------------------------------------------------------------------------

insert into auth.users (
  instance_id, id, aud, role, phone, phone_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
select
  '00000000-0000-0000-0000-000000000000',
  u.id, 'authenticated', 'authenticated', u.phone, now(),
  '{"provider":"phone","providers":["phone"]}'::jsonb,
  jsonb_build_object('role', 'pro', 'full_name', u.full_name),
  now(), now(), '', '', '', ''
from (
  values
    ('a0000000-0000-4000-8000-000000000006'::uuid, '972500000006', 'מוסא חדד'),
    ('a0000000-0000-4000-8000-000000000007'::uuid, '972500000007', 'אלכס פרידמן')
) as u (id, phone, full_name);

insert into auth.identities (
  id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at
)
select
  gen_random_uuid(), u.id, u.id::text, 'phone',
  jsonb_build_object('sub', u.id::text, 'phone', u.phone),
  now(), now(), now()
from auth.users u
where u.id in (
  'a0000000-0000-4000-8000-000000000006',
  'a0000000-0000-4000-8000-000000000007'
);

update public.pro_profiles
   set verification_status = 'verified',
       bio = 'אינסטלטור, שירות גם בשעות הערב.',
       radius_km = 8,
       service_point = extensions.st_point(34.7830, 32.0790)::extensions.geography,
       service_address_text = 'רחוב שינקין 20, תל אביב',
       rating_avg = 4.7,
       jobs_completed_count = 98,
       profile_strength_pct = 80,
       onboarding_step = 5,
       submitted_at = now() - interval '60 days',
       payment_methods = array['cash', 'bit'],
       payout_bank_name = 'בנק דיסקונט',
       payout_bank_branch = '060',
       payout_account_last4 = '1122'
 where user_id = 'a0000000-0000-4000-8000-000000000006';

update public.pro_profiles
   set verification_status = 'verified',
       bio = 'אינסטלציה וניקוז, 9 שנות ניסיון.',
       radius_km = 6,
       service_point = extensions.st_point(34.7770, 32.0830)::extensions.geography,
       service_address_text = 'רחוב בוגרשוב 5, תל אביב',
       rating_avg = 4.6,
       jobs_completed_count = 156,
       profile_strength_pct = 75,
       onboarding_step = 5,
       submitted_at = now() - interval '45 days',
       payment_methods = array['cash', 'paybox', 'bank_transfer'],
       payout_bank_name = 'בנק מזרחי',
       payout_bank_branch = '415',
       payout_account_last4 = '8801'
 where user_id = 'a0000000-0000-4000-8000-000000000007';

insert into public.pro_categories (pro_id, category_id) values
  ('a0000000-0000-4000-8000-000000000006', 'c0000000-0000-4000-8000-000000000001'),
  ('a0000000-0000-4000-8000-000000000006', 'c0000000-0000-4000-8000-000000000002'),
  ('a0000000-0000-4000-8000-000000000007', 'c0000000-0000-4000-8000-000000000001');

insert into public.verification_documents (pro_id, doc_type, file_url, status, reviewed_at) values
  ('a0000000-0000-4000-8000-000000000006', 'id_card',
   'a0000000-0000-4000-8000-000000000006/id-card.jpg', 'approved', now() - interval '59 days'),
  ('a0000000-0000-4000-8000-000000000007', 'id_card',
   'a0000000-0000-4000-8000-000000000007/id-card.jpg', 'approved', now() - interval '44 days');

-- expires_at is written explicitly here only because the seed is not a client:
-- through PostgREST the column has no INSERT grant at all, so a real bid can
-- only ever take the 45-minute default.
insert into public.bids (
  id, job_id, pro_id, price, eta_minutes, note, status, expires_at, created_at
) values
  (
    'b0000000-0000-4000-8000-000000000001',
    'd0000000-0000-4000-8000-000000000001',
    'a0000000-0000-4000-8000-000000000003',
    380, 25, 'אחריות שנה על העבודה. מביא חלקים מקוריים.',
    'pending', now() + interval '40 minutes', now() - interval '5 minutes'
  ),
  (
    'b0000000-0000-4000-8000-000000000002',
    'd0000000-0000-4000-8000-000000000001',
    'a0000000-0000-4000-8000-000000000006',
    340, 40, 'זמין גם בשעות הערב, ללא תוספת מחיר.',
    'pending', now() + interval '35 minutes', now() - interval '10 minutes'
  ),
  (
    'b0000000-0000-4000-8000-000000000003',
    'd0000000-0000-4000-8000-000000000001',
    'a0000000-0000-4000-8000-000000000007',
    300, 55, 'מגיע מחר בבוקר עם כל הציוד.',
    'pending', now() + interval '25 minutes', now() - interval '20 minutes'
  ),
  (
    'b0000000-0000-4000-8000-000000000004',
    'd0000000-0000-4000-8000-000000000002',
    'a0000000-0000-4000-8000-000000000006',
    420, 60, 'אפשר גם היום אחרי 17:00.',
    'expired', now() - interval '2 hours', now() - interval '3 hours'
  );

-- One conversation, so the chat screens have something other than an empty
-- state on a fresh reset. A thread is (job, pro): this one is customer A with
-- the pro who bid 380, and no other pro on the job can read a word of it.
insert into public.messages (job_id, pro_id, sender_id, body, created_at, read_at) values
  (
    'd0000000-0000-4000-8000-000000000001',
    'a0000000-0000-4000-8000-000000000003',
    'a0000000-0000-4000-8000-000000000003',
    'שלום דנה, ראיתי את התמונה. המחיר כולל את הביקור ואת החלקים.',
    now() - interval '4 minutes',
    now() - interval '3 minutes'
  ),
  (
    'd0000000-0000-4000-8000-000000000001',
    'a0000000-0000-4000-8000-000000000003',
    'a0000000-0000-4000-8000-000000000001',
    'מעולה, אני בבית עד 18:00.',
    now() - interval '3 minutes',
    null
  );

-- ---------------------------------------------------------------------------
-- Phase 5 — one job that is already under way
--
-- The tracking screens (design/screens/customer-3.1-tracking-chat.png and
-- pro-3.1-manage-job-price-update.png) only exist once a bid has been chosen,
-- and a fresh reset otherwise has no assigned job at all. This is customer B's
-- call, taken by the pro who bid 340 on job A — deliberately a different pair
-- from the fixtures the pgTAP suite counts, so the seed can grow without
-- rewriting Phase 1–4's assertions.
--
-- It ships with a live position and one price update waiting for a decision,
-- which is exactly the state both designs are captured in.
-- ---------------------------------------------------------------------------

insert into public.jobs (
  id, customer_id, category_id, description, photo_urls, location, address_text,
  preferred_time, search_radius_km, status, created_at
) values (
  'd0000000-0000-4000-8000-000000000003',
  'a0000000-0000-4000-8000-000000000002',
  'c0000000-0000-4000-8000-000000000001',
  'דוד השמש מטפטף על הגג ויש כתם רטיבות בתקרת חדר השינה.',
  '{}',
  extensions.st_point(34.7745, 32.0700)::extensions.geography,
  'רחוב אלנבי 40, תל אביב',
  'asap',
  5,
  'open',
  now() - interval '2 hours'
);

-- Inserted already 'selected': the seed is not a client, and status has no
-- INSERT grant through PostgREST. A real bid can only reach this state through
-- select_bid().
insert into public.bids (
  id, job_id, pro_id, price, eta_minutes, note, status, expires_at, created_at
) values (
  'b0000000-0000-4000-8000-000000000005',
  'd0000000-0000-4000-8000-000000000003',
  'a0000000-0000-4000-8000-000000000006',
  320, 25, 'מגיע עם צנרת חלופית. אחריות שנה.',
  'selected', now() + interval '40 minutes', now() - interval '90 minutes'
);

update public.jobs
   set status = 'assigned',
       selected_bid_id = 'b0000000-0000-4000-8000-000000000005'
 where id = 'd0000000-0000-4000-8000-000000000003';

-- Roughly a kilometre out, moving in. `updated_at` is recent on purpose: the
-- customer's screen calls a position older than a few minutes stale rather
-- than drawing a pin somebody may have left an hour ago.
insert into public.job_locations
  (job_id, pro_id, location, accuracy_m, eta_minutes, updated_at)
values (
  'd0000000-0000-4000-8000-000000000003',
  'a0000000-0000-4000-8000-000000000006',
  extensions.st_point(34.7790, 32.0755)::extensions.geography,
  22, 12, now() - interval '20 seconds'
);

-- The field price update, waiting for the customer. original_price is the
-- agreed 320 — through the app it is never accepted from the pro at all, it is
-- read by request_price_update() from job_effective_price().
insert into public.price_updates
  (job_id, pro_id, original_price, new_price, photo_url, note)
values (
  'd0000000-0000-4000-8000-000000000003',
  'a0000000-0000-4000-8000-000000000006',
  320, 440,
  'a0000000-0000-4000-8000-000000000006/d0000000-0000-4000-8000-000000000003/fault.jpg',
  'צינור סדוק בקיר מאחורי הדוד — נדרשת החלפת קטע צינור ואיטום מחדש.'
);

-- ---------------------------------------------------------------------------
-- Phase 6 — three jobs that are already closed
--
-- The summary screen (design/screens/customer-4.1-summary-receipt-rating.png),
-- the היסטוריה tab of pro-3.2-my-jobs.png and the whole of
-- pro-4.1-earnings-wallet.png only exist once work has been *finished*, and a
-- fresh reset otherwise has none. These three belong to the verified pro
-- (דוד מזרחי) and are spread across the wallet's three ranges — one from
-- yesterday, one from four days ago, one from twelve — so the היום/השבוע/החודש
-- toggle has something to actually distinguish.
--
-- The first is the design's own numbers: 380 base, an approved field update of
-- +140, 520 total, 62.40 commission.
-- ---------------------------------------------------------------------------

insert into public.jobs (
  id, customer_id, category_id, description, photo_urls, location, address_text,
  preferred_time, search_radius_km, status, created_at
) values
  (
    'd0000000-0000-4000-8000-000000000004',
    'a0000000-0000-4000-8000-000000000001',
    'c0000000-0000-4000-8000-000000000001',
    'הדוד מטפטף ויש רטיבות בקיר הממ״ד.',
    '{}',
    extensions.st_point(34.7806, 32.0809)::extensions.geography,
    'רחוב ברודצקי 18, תל אביב',
    'asap', 5, 'open', now() - interval '1 day' - interval '3 hours'
  ),
  (
    'd0000000-0000-4000-8000-000000000005',
    'a0000000-0000-4000-8000-000000000002',
    'c0000000-0000-4000-8000-00000000000a',
    'איטום מחדש של מרפסת אחרי חורף.',
    '{}',
    extensions.st_point(34.7749, 32.0714)::extensions.geography,
    'רחוב דיזנגוף 210, תל אביב',
    'this_week', 5, 'open', now() - interval '4 days' - interval '5 hours'
  ),
  (
    'd0000000-0000-4000-8000-000000000006',
    'a0000000-0000-4000-8000-000000000001',
    'c0000000-0000-4000-8000-000000000001',
    'החלפת ברז מטבח וסיפון.',
    '{}',
    extensions.st_point(34.7770, 32.0830)::extensions.geography,
    'רחוב יהודה המכבי 7, תל אביב',
    'flexible', 5, 'open', now() - interval '12 days' - interval '2 hours'
  );

-- 'selected' straight away, for the reason the Phase 5 block gives: the seed is
-- not a client, and through PostgREST a bid can only reach this state through
-- select_bid().
insert into public.bids (
  id, job_id, pro_id, price, eta_minutes, note, status, expires_at, created_at
) values
  ('b0000000-0000-4000-8000-000000000006', 'd0000000-0000-4000-8000-000000000004',
   'a0000000-0000-4000-8000-000000000003', 380, 25, 'כולל חלקים ואחריות שנה.',
   'selected', now() - interval '1 day', now() - interval '1 day' - interval '2 hours'),
  ('b0000000-0000-4000-8000-000000000007', 'd0000000-0000-4000-8000-000000000005',
   'a0000000-0000-4000-8000-000000000003', 260, 60, 'איטום פוליאוריטן, שתי שכבות.',
   'selected', now() - interval '4 days', now() - interval '4 days' - interval '4 hours'),
  ('b0000000-0000-4000-8000-000000000008', 'd0000000-0000-4000-8000-000000000006',
   'a0000000-0000-4000-8000-000000000003', 320, 40, 'מגיע עם ברז חלופי.',
   'selected', now() - interval '12 days', now() - interval '12 days' - interval '1 hour');

update public.jobs set status = 'completed',
       selected_bid_id = 'b0000000-0000-4000-8000-000000000006'
 where id = 'd0000000-0000-4000-8000-000000000004';
update public.jobs set status = 'completed',
       selected_bid_id = 'b0000000-0000-4000-8000-000000000007'
 where id = 'd0000000-0000-4000-8000-000000000005';
update public.jobs set status = 'completed',
       selected_bid_id = 'b0000000-0000-4000-8000-000000000008'
 where id = 'd0000000-0000-4000-8000-000000000006';

-- The approved field update behind the design's "עדכון מחיר מאושר +140 ₪".
insert into public.price_updates
  (job_id, pro_id, original_price, new_price, photo_url, note, status, decided_at, created_at)
values (
  'd0000000-0000-4000-8000-000000000004',
  'a0000000-0000-4000-8000-000000000003',
  380, 520,
  'a0000000-0000-4000-8000-000000000003/d0000000-0000-4000-8000-000000000004/fault.jpg',
  'הדוד עצמו סדוק — נדרשה החלפה, לא רק איטום.',
  'approved',
  now() - interval '1 day' - interval '30 minutes',
  now() - interval '1 day' - interval '50 minutes'
);

-- Written directly for the same reason the bids above are: through the app the
-- only path into this table is complete_job(), which computes every one of
-- these numbers itself. 12% of the total, to the agora.
insert into public.commission_charges
  (job_id, pro_id, base_price, total_price, commission_amount, payment_method, charged_at)
values
  ('d0000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000003',
   380, 520, 62.40, 'cash',          now() - interval '1 day'),
  ('d0000000-0000-4000-8000-000000000005', 'a0000000-0000-4000-8000-000000000003',
   260, 260, 31.20, 'bit',           now() - interval '4 days'),
  ('d0000000-0000-4000-8000-000000000006', 'a0000000-0000-4000-8000-000000000003',
   320, 320, 38.40, 'bank_transfer', now() - interval '12 days');

-- Two of the three are rated. The third is deliberately not: "ממתין לדירוג" is
-- a real state on the wallet's table and the history tab, and an empty column
-- is how it is meant to look.
insert into public.reviews (id, job_id, rating, comment, created_at) values
  ('f0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000004', 5,
   'הגיע בזמן, הסביר כל שקל לפני שעשה אותו. ממליצה.', now() - interval '23 hours'),
  ('f0000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000005', 5,
   null, now() - interval '3 days');

-- ---------------------------------------------------------------------------
-- Phase 7 — what the admin dashboard is there to see
--
-- The four screens under design/screens/admin-* are all lists of trouble, and
-- a fresh reset otherwise has none: no dispute has ever been opened, and every
-- job in the seed has offers on it. Two rows fix that.
--
--  * One open call, three hours old, that nobody has bid on. It is the
--    "קריאות ללא הצעות" alert on the overview and the ללא הצעות line in the
--    jobs table — both of which are counted from real rows, so without one
--    they would draw a zero that is not a state the product can reach.
--  * Three disputes across the three closed jobs, in the states the design
--    captures: two open (one of each side's kind) and one already decided
--    with a partial credit.
-- ---------------------------------------------------------------------------

insert into public.jobs (
  id, customer_id, category_id, description, photo_urls, location, address_text,
  preferred_time, search_radius_km, status, created_at
) values (
  'd0000000-0000-4000-8000-000000000007',
  'a0000000-0000-4000-8000-000000000002',
  'c0000000-0000-4000-8000-000000000003',
  'המזגן בסלון מקרר חלש ומטפטף מים על הרצפה.',
  '{}',
  extensions.st_point(34.8100, 32.1100)::extensions.geography,
  'רחוב ז׳בוטינסקי 55, רמת גן',
  'this_week', 5, 'open', now() - interval '3 hours'
);

-- Written directly, as everything else in this file is: through the app a
-- participant may insert only (job_id, opened_by, reason), and status,
-- credit_amount and resolved_at are resolve_dispute()'s alone.
insert into public.disputes (
  id, job_id, opened_by, reason, status, credit_amount, resolution_note,
  resolved_by, resolved_at, created_at
) values
  (
    'e0000000-0000-4000-8000-000000000001',
    'd0000000-0000-4000-8000-000000000004',
    'a0000000-0000-4000-8000-000000000001',
    'המחיר עודכן ב-140 ₪ ואני לא בטוחה שהתמונה שצורפה היא של התקלה אצלי.',
    'open', null, null, null, null, now() - interval '6 hours'
  ),
  (
    'e0000000-0000-4000-8000-000000000002',
    'd0000000-0000-4000-8000-000000000006',
    'a0000000-0000-4000-8000-000000000003',
    'הלקוח לא שילם בסיום העבודה ולא עונה לטלפון.',
    'open', null, null, null, null, now() - interval '2 days'
  ),
  (
    'e0000000-0000-4000-8000-000000000003',
    'd0000000-0000-4000-8000-000000000005',
    'a0000000-0000-4000-8000-000000000002',
    'האיטום נעשה רק בחצי מהמרפסת.',
    'resolved', 60,
    'נבדק מול תיעוד הקריאה: התמונות מראות עבודה חלקית. זיכוי של 60 ₪ ללקוח.',
    'a0000000-0000-4000-8000-000000000005',
    now() - interval '4 days' + interval '19 hours',
    now() - interval '5 days'
  );

-- ---------------------------------------------------------------------------
-- Phase 8 — what the public pages read
--
-- The category+city pages and the pro profiles are the first screens in this
-- product that render for somebody with no account, and they render from the
-- same rows everything else does. What they additionally need is the handful
-- of self-description fields Phase 8 added: a URL, a years-of-experience
-- claim, and one answered review.
--
-- No avatar or gallery paths are seeded. Those are objects in the public
-- pro-media bucket and SQL cannot upload bytes; a path with no file behind it
-- would render as a broken image on a public page, which is worse than the
-- initials the profile falls back to.
-- ---------------------------------------------------------------------------

update public.pro_profiles set public_slug = 'david-mizrahi', years_experience = 12
 where user_id = 'a0000000-0000-4000-8000-000000000003';
update public.pro_profiles set public_slug = 'avi-peretz'
 where user_id = 'a0000000-0000-4000-8000-000000000004';
update public.pro_profiles set public_slug = 'musa-hadad', years_experience = 8
 where user_id = 'a0000000-0000-4000-8000-000000000006';
update public.pro_profiles set public_slug = 'alex-fridman', years_experience = 9
 where user_id = 'a0000000-0000-4000-8000-000000000007';

-- One answered review, so "מענה לביקורות" (product-spec.md 4.8) has a rendered
-- state on both the pro's editor and the public profile. Written directly for
-- the reason everything else here is: through the app the only path into this
-- column is reply_to_review().
update public.reviews
   set pro_reply = 'תודה רבה דנה! שמח שהכול עובד. אם יחזור טפטוף — תתקשרי, זה תחת אחריות.',
       pro_replied_at = now() - interval '22 hours'
 where job_id = 'd0000000-0000-4000-8000-000000000004';
