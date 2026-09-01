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
  id, customer_id, category_id, description, location, address_text, preferred_time, status
) values
  (
    'd0000000-0000-4000-8000-000000000001',
    'a0000000-0000-4000-8000-000000000001',
    'c0000000-0000-4000-8000-000000000001',
    'נזילה מתחת לכיור במטבח, המים מטפטפים כל הזמן.',
    extensions.st_point(34.7806, 32.0809)::extensions.geography,
    'רחוב דיזנגוף 100, תל אביב',
    'היום אחר הצהריים',
    'open'
  ),
  (
    'd0000000-0000-4000-8000-000000000002',
    'a0000000-0000-4000-8000-000000000002',
    'c0000000-0000-4000-8000-000000000002',
    'שקע בסלון הפסיק לעבוד, המפסק קופץ בכל פעם שמחברים מכשיר.',
    extensions.st_point(34.7749, 32.0714)::extensions.geography,
    'רחוב אלנבי 40, תל אביב',
    'מחר בבוקר',
    'open'
  );
