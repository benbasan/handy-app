-- Phase 8 — the public half of the product: content pages, the category+city
-- SEO pages, and the pro's public profile.
--
-- Everything before this phase was written for somebody who is signed in. What
-- this migration adds is the opposite audience — `anon` — and that changes the
-- shape of the answer rather than just the audience of it:
--
--  1. **A public profile is a function, not a policy widening.** Phase 1 said
--     so in as many words ("the customer-facing pro profile … is a public-safe
--     view built in the phase that needs it, not a hole in this table"), and it
--     is right: `pro_profiles` carries a payout account, a service point and a
--     verification status, and no `select` policy can hide a column. So the
--     public read paths below are `security definer` functions that name the
--     columns they return, one by one, and `pro_profiles` keeps exactly the
--     grants it had.
--
--  2. **A pro's own vanity URL is a column grant, because it is their own
--     description of themselves** — the same family as `bio`, not the family
--     as `verification_status`. What has to hold is the *shape* of the value,
--     not who writes it, so the rules are a check constraint and a unique
--     index: a slug can never collide with one of the app's own `/pro/…`
--     paths, whoever writes it and through whatever client.
--
--  3. **`support_tickets` is the first table an anonymous visitor may write
--     to.** The contact form (design/screens/content-6.4-support-contact.png)
--     is on a page with no login on it. The INSERT grant is therefore given to
--     `anon` as well, and the policy pins `created_by` to whoever the caller
--     actually is — `auth.uid()` for a signed-in visitor, null for a stranger.
--     Nobody but an admin and the author can read one back, and no client role
--     can update one at all: a ticket's status is the support team's answer.
--
--  4. **`pro-media` is the first *public* bucket in the project.** CLAUDE.md
--     section 9 left it open, and this phase is the one that forces it: a
--     customer comparing pros before they have an account cannot be handed a
--     signed URL, because signing runs under a reader's RLS and there is no
--     reader. Everything in it is content the pro publishes on purpose — their
--     portrait and their work gallery. Their identity documents stay where
--     they are, in the private `verification-docs` bucket, and nothing here
--     touches that.

-- ---------------------------------------------------------------------------
-- 1. pro_profiles — what a public profile is made of
-- ---------------------------------------------------------------------------

alter table public.pro_profiles
  -- The `/pro/<slug>` the design captures at handy.co.il/pro/david-levi.
  add column public_slug text,
  -- An object path inside the public `pro-media` bucket. Not the private
  -- `profile_photo` verification document: that one was uploaded as evidence
  -- for an admin, and a customer must never be handed anything out of that
  -- bucket. A pro who wants a picture on their public page publishes one.
  add column avatar_path text,
  add column gallery_paths text[] not null default '{}'
    constraint pro_profiles_gallery_size_check
    check (coalesce(array_length(gallery_paths, 1), 0) <= 8),
  -- "8 שנות ניסיון" on design/screens/customer-5.2-pro-public-profile.png. A
  -- claim the pro makes about themselves, like `bio` — presented as such.
  add column years_experience smallint
    check (years_experience is null or years_experience between 0 and 70);

comment on column public.pro_profiles.public_slug is
  'The pro''s public URL segment: /pro/<public_slug>. Self-chosen, format-checked, unique, and never one of the app''s own /pro/... paths.';
comment on column public.pro_profiles.avatar_path is
  'Object path in the PUBLIC pro-media bucket. Deliberately not the profile_photo verification document, which lives in a private bucket and is evidence, not publicity.';

/*
 * The shape rules, as constraints rather than as validation in one code path.
 *
 * The reserved list is every static segment the app itself serves under
 * `/pro/`. Next resolves a static route before a dynamic one, so a pro who
 * took the slug `wallet` would not actually shadow /pro/wallet — they would
 * simply own a page nobody can reach. Refusing it here is how the URL stays
 * the same thing on both sides.
 */
alter table public.pro_profiles
  add constraint pro_profiles_public_slug_format_check
  check (
    public_slug is null
    or (
      public_slug ~ '^[a-z0-9]([a-z0-9-]{1,38})[a-z0-9]$'
      and public_slug not like '%--%'
      and public_slug not in (
        'login', 'dashboard', 'join', 'onboarding', 'jobs', 'offers',
        'messages', 'settings', 'my-jobs', 'wallet', 'profile', 'help',
        'api', 'admin', 'new', 'search', 'about', 'terms', 'privacy'
      )
    )
  );

create unique index pro_profiles_public_slug_key
  on public.pro_profiles (public_slug)
  where public_slug is not null;

/*
 * Every pro has a public URL from the moment their row exists, so the category
 * pages can link to all of them without a nullable branch. `pro-<8 hex>` is
 * ugly and deliberately so — it is a working address the pro is invited to
 * replace on /pro/profile, not a name.
 */
create function public.pro_profiles_default_slug()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.public_slug is null then
    new.public_slug := 'pro-' || right(replace(new.user_id::text, '-', ''), 12);
  end if;
  return new;
end;
$$;

create trigger pro_profiles_default_slug
  before insert on public.pro_profiles
  for each row execute function public.pro_profiles_default_slug();

update public.pro_profiles
   set public_slug = 'pro-' || right(replace(user_id::text, '-', ''), 12)
 where public_slug is null;

-- Self-description, exactly like `bio` and `radius_km` above it. Still absent,
-- and still deliberately: verification_status, rating_avg,
-- jobs_completed_count, price_updates_blocked, documents_required_at.
grant update (public_slug, avatar_path, gallery_paths, years_experience)
  on public.pro_profiles to authenticated;

-- ---------------------------------------------------------------------------
-- 2. A pro answers a review — product-spec.md 4.8 ("מענה לביקורות")
-- ---------------------------------------------------------------------------

alter table public.reviews
  add column pro_reply text check (length(btrim(coalesce(pro_reply, 'x'))) > 0),
  add column pro_replied_at timestamptz;

/*
 * No column grant, for the reason Phase 6 revoked the customer's grants on
 * this table: `reviews` is a public reputation, and it is now literally public
 * — `pro_public_reviews()` below serves it to anonymous visitors. The row
 * belongs to the customer who wrote it; the reply belongs to the pro it is
 * about; and neither may touch the other's half. A grant on `pro_reply` would
 * have been a grant to whoever else can pass the row's UPDATE policy.
 */
create function public.reply_to_review(p_review_id uuid, p_reply text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job_id uuid;
  v_reply text := nullif(btrim(coalesce(p_reply, '')), '');
begin
  select r.job_id into v_job_id from public.reviews r where r.id = p_review_id;

  if v_job_id is null then
    raise exception 'no such review' using errcode = 'P0002';
  end if;

  -- The pro who did the work, and only them. is_assigned_pro() reads the job's
  -- selected bid, which is the same test the review's own read policy uses.
  if not public.is_assigned_pro(v_job_id) then
    raise exception 'only the pro who did this job may answer its review'
      using errcode = '42501';
  end if;

  if v_reply is null then
    raise exception 'a reply cannot be empty' using errcode = '22023';
  end if;

  if length(v_reply) > 600 then
    raise exception 'reply is too long' using errcode = '22023';
  end if;

  update public.reviews
     set pro_reply = v_reply,
         pro_replied_at = now()
   where id = p_review_id;

  return p_review_id;
end;
$$;

comment on function public.reply_to_review(uuid, text) is
  'The reviewed pro answers a review. The only write path into reviews.pro_reply; no client role holds a column grant on it.';

revoke execute on function public.reply_to_review(uuid, text) from public, anon;
grant execute on function public.reply_to_review(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. support_tickets — "פנייה לתמיכה", design/screens/content-6.4
-- ---------------------------------------------------------------------------

create table public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  -- Null for a visitor who is not signed in. The whole point of the page is
  -- that it works before anyone has an account.
  created_by uuid references public.profiles (id) on delete set null,
  full_name text not null check (length(btrim(full_name)) between 2 and 80),
  phone text not null check (length(btrim(phone)) between 6 and 20),
  topic text not null
    check (topic in ('active_job', 'pricing', 'pro_complaint', 'other')),
  -- "מספר קריאה (אם יש) — למשל H-24817". Free text on purpose: it is what the
  -- visitor read off their own screen, not a foreign key we can trust.
  job_reference text check (job_reference is null or length(btrim(job_reference)) <= 40),
  body text not null check (length(btrim(body)) between 10 and 4000),
  status text not null default 'open'
    check (status in ('open', 'answered', 'closed')),
  created_at timestamptz not null default now()
);

create index support_tickets_created_by_idx on public.support_tickets (created_by);
create index support_tickets_status_idx on public.support_tickets (status, created_at desc);

alter table public.support_tickets enable row level security;

revoke all on public.support_tickets from anon, authenticated;
-- Insert only. No update grant to any client role: `status` is the support
-- team's answer to the ticket, and a sender who can mark their own case
-- closed is not being answered.
grant insert on public.support_tickets to anon;
grant select, insert on public.support_tickets to authenticated;

create policy "support_tickets: anonymous visitors open unattributed tickets"
  on public.support_tickets for insert to anon
  with check (created_by is null);

create policy "support_tickets: signed-in visitors open tickets as themselves"
  on public.support_tickets for insert to authenticated
  with check (created_by = (select auth.uid()));

create policy "support_tickets: author reads own"
  on public.support_tickets for select to authenticated
  using (created_by = (select auth.uid()));

create policy "support_tickets: admin reads all"
  on public.support_tickets for select to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- 4. pro-media — the project's first public bucket
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'pro-media',
  'pro-media',
  true,
  10485760, -- 10 MiB: these are profile pictures, not job video
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
on conflict (id) do nothing;

-- Public read is what `public = true` above already means; the policy is here
-- so the table is never in the state architecture.md section 4 calls a silent
-- hole (RLS on, no policy) for this bucket's rows.
create policy "pro-media: readable by everyone"
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'pro-media');

create policy "pro-media: pro writes own folder"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'pro-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and public.auth_role() = 'pro'
  );

-- Unlike verification-docs, this bucket does allow delete: removing a photo
-- from your own gallery is not erasing evidence, it is editing a page you
-- publish. Update is still absent — a replacement is a new object.
create policy "pro-media: pro removes own folder"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'pro-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- ---------------------------------------------------------------------------
-- 5. The public profile — product-spec.md 3.8,
--    design/screens/customer-5.2-pro-public-profile.png
-- ---------------------------------------------------------------------------

/*
 * One row, naming every column it returns.
 *
 * What is *not* in the return list is the point of the function: no phone, no
 * payout account, no service_point, no verification document path, no
 * onboarding state. "מסמכים שאומתו" comes back as three booleans — whether a
 * document of that type was approved — which is what the design shows and is
 * the most a customer is ever told (architecture.md section 4).
 *
 * Only `verified` pros exist here at all. A pro who is pending, rejected or
 * suspended has no public page: 404, not an empty one.
 */
create function public.pro_public_profile(p_slug text)
returns table (
  slug text,
  full_name text,
  bio text,
  avatar_path text,
  gallery_paths text[],
  rating_avg numeric,
  reviews_count int,
  jobs_completed_count int,
  years_experience smallint,
  service_city text,
  radius_km int,
  work_days smallint[],
  work_start_time time,
  work_end_time time,
  accepting_jobs boolean,
  payment_methods text[],
  category_names text[],
  category_slugs text[],
  has_id_card boolean,
  has_license boolean,
  has_insurance boolean,
  min_price numeric,
  avg_response_minutes numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    pp.public_slug,
    p.full_name,
    pp.bio,
    pp.avatar_path,
    pp.gallery_paths,
    -- Recomputed rather than read off pro_profiles.rating_avg for the reason
    -- job_receipt() gives: that column is numeric(2,1) and rounds, and the
    -- number beside the star count should agree with the reviews below it.
    (select round(avg(r.rating), 2)
       from public.reviews r
       join public.jobs j on j.id = r.job_id
       join public.bids b on b.id = j.selected_bid_id
      where b.pro_id = pp.user_id),
    (select count(*)::int
       from public.reviews r
       join public.jobs j on j.id = r.job_id
       join public.bids b on b.id = j.selected_bid_id
      where b.pro_id = pp.user_id),
    pp.jobs_completed_count,
    pp.years_experience,
    public.job_city(pp.service_address_text),
    pp.radius_km,
    pp.work_days,
    pp.work_start_time,
    pp.work_end_time,
    pp.accepting_jobs,
    pp.payment_methods,
    (select coalesce(array_agg(c.name_he order by c.name_he), '{}')
       from public.pro_categories pc
       join public.categories c on c.id = pc.category_id
      where pc.pro_id = pp.user_id),
    (select coalesce(array_agg(c.slug order by c.name_he), '{}')
       from public.pro_categories pc
       join public.categories c on c.id = pc.category_id
      where pc.pro_id = pp.user_id),
    exists (select 1 from public.verification_documents vd
             where vd.pro_id = pp.user_id and vd.doc_type = 'id_card'
               and vd.status = 'approved'),
    exists (select 1 from public.verification_documents vd
             where vd.pro_id = pp.user_id and vd.doc_type = 'license'
               and vd.status = 'approved'),
    exists (select 1 from public.verification_documents vd
             where vd.pro_id = pp.user_id and vd.doc_type = 'insurance'
               and vd.status = 'approved'),
    (select min(b.price) from public.bids b where b.pro_id = pp.user_id),
    (select round(avg(extract(epoch from (b.created_at - j.created_at)) / 60)::numeric, 0)
       from public.bids b
       join public.jobs j on j.id = b.job_id
      where b.pro_id = pp.user_id
        and b.created_at >= j.created_at)
  from public.pro_profiles pp
  join public.profiles p on p.id = pp.user_id
  where pp.public_slug = p_slug
    and pp.verification_status = 'verified';
$$;

comment on function public.pro_public_profile(text) is
  'The customer-facing profile of one verified pro, by slug. A definer function naming every column it returns, because RLS picks rows and cannot hide the payout account sitting beside them.';

grant execute on function public.pro_public_profile(text) to anon, authenticated;

/*
 * "ביקורות מאומתות" — every review is attached to a job this pro actually
 * closed, which is what the word מאומתות on that screen means.
 *
 * The reviewer's given name only. The design prints a full name; a first name
 * plus an initial says the same thing about the review being real without
 * publishing a customer's identity on an indexed page.
 */
create function public.pro_public_reviews(p_slug text, p_limit int default 20)
returns table (
  rating int,
  comment text,
  pro_reply text,
  reviewer_name text,
  category_name text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    r.rating,
    r.comment,
    r.pro_reply,
    case
      when btrim(coalesce(p.full_name, '')) = '' then 'לקוח/ה'
      else split_part(btrim(p.full_name), ' ', 1)
           || case
                when split_part(btrim(p.full_name), ' ', 2) = '' then ''
                else ' ' || left(split_part(btrim(p.full_name), ' ', 2), 1) || '.'
              end
    end,
    c.name_he,
    r.created_at
  from public.reviews r
  join public.jobs j on j.id = r.job_id
  join public.bids b on b.id = j.selected_bid_id
  join public.pro_profiles pp on pp.user_id = b.pro_id
  join public.profiles p on p.id = j.customer_id
  join public.categories c on c.id = j.category_id
  where pp.public_slug = p_slug
    and pp.verification_status = 'verified'
    and j.status = 'completed'
  order by r.created_at desc
  limit greatest(1, least(coalesce(p_limit, 20), 50));
$$;

comment on function public.pro_public_reviews(text, int) is
  'Public reviews of one verified pro. Reviewer names are shortened to a given name and an initial: the page is indexed by search engines.';

grant execute on function public.pro_public_reviews(text, int) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. The category+city pages — product-spec.md 3.8,
--    design/screens/customer-5.3-category-page.png
-- ---------------------------------------------------------------------------

/*
 * "אינסטלטורים מומלצים באזור שלך".
 *
 * A pro serves a city if the city centre is inside their own radius — the same
 * question the feed asks about a job, asked about a point instead. `p_lat` and
 * `p_lng` come from the app's own curated city list (lib/content/cities.ts)
 * rather than from a table: a city here is a marketing page, not an entity the
 * product has any other opinion about.
 *
 * Passing null for both means "anywhere in Israel", which is the
 * category-without-a-city page.
 */
create function public.category_pros(
  p_category_slug text,
  p_lat double precision default null,
  p_lng double precision default null,
  p_limit int default 12
)
returns table (
  slug text,
  full_name text,
  avatar_path text,
  rating_avg numeric,
  reviews_count int,
  jobs_completed_count int,
  years_experience smallint,
  service_city text,
  min_price numeric,
  accepting_jobs boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    pp.public_slug,
    p.full_name,
    pp.avatar_path,
    (select round(avg(r.rating), 2)
       from public.reviews r
       join public.jobs j on j.id = r.job_id
       join public.bids b on b.id = j.selected_bid_id
      where b.pro_id = pp.user_id),
    (select count(*)::int
       from public.reviews r
       join public.jobs j on j.id = r.job_id
       join public.bids b on b.id = j.selected_bid_id
      where b.pro_id = pp.user_id),
    pp.jobs_completed_count,
    pp.years_experience,
    public.job_city(pp.service_address_text),
    (select min(b.price) from public.bids b where b.pro_id = pp.user_id),
    pp.accepting_jobs
  from public.pro_profiles pp
  join public.profiles p on p.id = pp.user_id
  join public.pro_categories pc on pc.pro_id = pp.user_id
  join public.categories c on c.id = pc.category_id
  where c.slug = p_category_slug
    and pp.verification_status = 'verified'
    and (
      p_lat is null or p_lng is null
      or (
        pp.service_point is not null
        and extensions.st_dwithin(
              pp.service_point,
              extensions.st_point(p_lng, p_lat)::extensions.geography,
              pp.radius_km * 1000
            )
      )
    )
  order by pp.jobs_completed_count desc, pp.rating_avg desc nulls last
  limit greatest(1, least(coalesce(p_limit, 12), 50));
$$;

comment on function public.category_pros(text, double precision, double precision, int) is
  'Verified pros in one trade who cover a point, for the public category+city page. Same public-safe column list as pro_public_profile().';

grant execute on function public.category_pros(text, double precision, double precision, int)
  to anon, authenticated;

/*
 * The three numbers in that page's opening paragraph: how many verified pros
 * work this trade here, how fast a first offer arrives, and what jobs like
 * this have actually closed at.
 *
 * Every one of them is counted from rows. There is no invented figure on a
 * public page in this repo — the landing page made the same call in Phase 2.
 */
create function public.category_stats(
  p_category_slug text,
  p_lat double precision default null,
  p_lng double precision default null
)
returns table (
  pros_count int,
  avg_first_bid_minutes numeric,
  jobs_closed int,
  price_low numeric,
  price_typical numeric,
  price_high numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  with cat as (
    select id from public.categories where slug = p_category_slug
  ),
  covered as (
    select pp.user_id
      from public.pro_profiles pp
      join public.pro_categories pc on pc.pro_id = pp.user_id
     where pc.category_id = (select id from cat)
       and pp.verification_status = 'verified'
       and (
         p_lat is null or p_lng is null
         or (
           pp.service_point is not null
           and extensions.st_dwithin(
                 pp.service_point,
                 extensions.st_point(p_lng, p_lat)::extensions.geography,
                 pp.radius_km * 1000
               )
         )
       )
  ),
  first_bids as (
    select extract(epoch from (min(b.created_at) - j.created_at)) / 60 as minutes
      from public.jobs j
      join public.bids b on b.job_id = j.id
     where j.category_id = (select id from cat)
     group by j.id, j.created_at
    having min(b.created_at) >= j.created_at
  ),
  closed as (
    select cc.total_price
      from public.commission_charges cc
      join public.jobs j on j.id = cc.job_id
     where j.category_id = (select id from cat)
  )
  select
    (select count(*)::int from covered),
    (select round(avg(minutes)::numeric, 0) from first_bids),
    (select count(*)::int from closed),
    (select percentile_cont(0.1) within group (order by total_price) from closed),
    (select percentile_cont(0.5) within group (order by total_price) from closed),
    (select percentile_cont(0.9) within group (order by total_price) from closed);
$$;

comment on function public.category_stats(text, double precision, double precision) is
  'The counted figures on a public category+city page. Nothing here is a constant: an empty marketplace returns zeros and nulls, and the page says so.';

grant execute on function public.category_stats(text, double precision, double precision)
  to anon, authenticated;

/*
 * מדריך עלויות — design/screens/content-6.2-pricing-guide.png.
 *
 * The design's table lists individual tasks ("החלפת ברז מטבח") with a typical
 * price, a range and a duration. This product does not record either a task or
 * a duration — a job is a free-text description in a category, and nothing
 * times the work — so the table is per **category**, and it drops the duration
 * column rather than invent one. product-spec.md asks for "מבוסס נתונים
 * אמיתיים מעבודות שנסגרו", and this is that, exactly and only.
 */
create function public.pricing_guide()
returns table (
  category_slug text,
  category_name text,
  jobs_closed int,
  price_low numeric,
  price_typical numeric,
  price_high numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    c.slug,
    c.name_he,
    count(cc.id)::int,
    percentile_cont(0.1) within group (order by cc.total_price),
    percentile_cont(0.5) within group (order by cc.total_price),
    percentile_cont(0.9) within group (order by cc.total_price)
  from public.categories c
  left join public.jobs j on j.category_id = c.id
  left join public.commission_charges cc on cc.job_id = j.id
  group by c.slug, c.name_he
  order by count(cc.id) desc, c.name_he;
$$;

comment on function public.pricing_guide() is
  'Closed-job price statistics per category, for the public cost guide. Categories with no closed job come back with a zero count, and the page shows them as "אין עדיין מספיק נתונים" rather than as free.';

grant execute on function public.pricing_guide() to anon, authenticated;

/*
 * The sitemap needs the slug of every pro who has a public page, and nothing
 * else about them. A separate function rather than reusing category_pros(),
 * because "every verified pro" is a different question from "the pros to show
 * on this page" and the two should not drift into each other.
 */
create function public.public_pro_slugs()
returns table (slug text)
language sql
stable
security definer
set search_path = ''
as $$
  select pp.public_slug
    from public.pro_profiles pp
   where pp.verification_status = 'verified'
     and pp.public_slug is not null
   order by pp.public_slug;
$$;

grant execute on function public.public_pro_slugs() to anon, authenticated;

/*
 * The pro's own reviews, for the editor on
 * design/screens/pro-5.1-public-profile-edit.png.
 *
 * `reviews` already carries a "reviewed pro reads" policy, so the rows are not
 * the problem — the reviewer's name is. `profiles` has no cross-user read
 * policy, and the pro screen has to show who wrote each one in order for
 * answering them to mean anything. The same shape `my_completed_jobs()` takes
 * in Phase 6, and for the same reason: scoped to `auth.uid()` inside the
 * function, so "a pro sees only their own" is not a filter a caller can drop.
 *
 * Unlike `pro_public_reviews()` this one carries the full customer name — the
 * pro already knows it, they did the job — and the review's id, which is what
 * `reply_to_review()` needs.
 */
create function public.my_reviews()
returns table (
  id uuid,
  job_id uuid,
  rating int,
  comment text,
  pro_reply text,
  pro_replied_at timestamptz,
  customer_name text,
  category_name text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    r.id, r.job_id, r.rating, r.comment, r.pro_reply, r.pro_replied_at,
    p.full_name, c.name_he, r.created_at
  from public.reviews r
  join public.jobs j on j.id = r.job_id
  join public.bids b on b.id = j.selected_bid_id
  join public.profiles p on p.id = j.customer_id
  join public.categories c on c.id = j.category_id
  where b.pro_id = (select auth.uid())
  order by r.created_at desc;
$$;

comment on function public.my_reviews() is
  'The calling pro''s own reviews, with the reviewer''s name and the answer they gave. Scoped to auth.uid() inside the function.';

revoke execute on function public.my_reviews() from public, anon;
grant execute on function public.my_reviews() to authenticated;
