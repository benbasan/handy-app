-- Phase 5 — מעקב חי ועדכון מחיר בשטח.
--
-- This is the migration that makes the product's central promise
-- (product-spec.md 3.5, "הכלל המרכזי") true in the database rather than in a
-- form. Phase 1 built the `price_updates` table, its photo constraint and its
-- read policies, and said in its own header that the state machine and the
-- derived price belong here. This is here.
--
-- Five things happen, and every one of them exists because the UI must not be
-- the thing enforcing it:
--
--  1. **A job's live price is a function, not a column.** `job_effective_price()`
--     is the selected bid's price until a `price_updates` row is *approved*,
--     and the approved row's `new_price` afterwards. There is no column to
--     UPDATE, which is what makes "a price cannot move without an approved
--     price update" true by construction (`jobs` has never had a price column
--     — see supabase/migrations/20260901123200_jobs_bids.sql).
--
--  2. **The pro no longer writes the price update row.** Phase 1 granted
--     INSERT on the whole table, which let the pro state `original_price`
--     themselves — a money field taken from the client, exactly what
--     CLAUDE.md's "money is server-authoritative" rule forbids. INSERT is
--     revoked; `request_price_update()` reads the current effective price
--     itself and writes the row.
--
--  3. **Approving is `decide_price_update()`, and it is one-way.** Phase 1
--     granted the customer `update (status, decided_at)`, which allowed
--     approve → reject → approve, retroactively re-pricing a finished job.
--     The grant is gone; the function moves `pending` to exactly one of
--     `approved` / `rejected`, once, and a trigger holds that line for any
--     path that ever writes the table.
--
--  4. **Live location is a table, not a broadcast.** docs/architecture.md
--     section 5 sketched a broadcast channel; `job_locations` replaces it, and
--     the document is updated with the reason: a broadcast leaves nothing on
--     screen for a customer who opens the page mid-journey, and — the deciding
--     argument — "who may watch where this pro is right now" is then channel
--     authorisation rather than a policy on a table this suite can prove
--     things about. One row per job, upserted by the pro, published to
--     Realtime, and readable by exactly two people.
--
--  5. **`assigned` → `in_progress` is `mark_job_in_progress()`.** The button
--     is "לחץ: הגעתי ללקוח" on design/screens/pro-3.1-manage-job-price-update.png.
--     `jobs.status` lost its column grant in Phase 4 for the same reason
--     `selected_bid_id` did, so every further transition arrives as a checked
--     function. Completion (`in_progress` → `completed`) is Phase 6's, together
--     with the commission and the receipt it has to create.
--
-- Screens: design/screens/customer-3.1-tracking-chat.png and
-- design/screens/pro-3.1-manage-job-price-update.png — two sides of one flow.

-- ---------------------------------------------------------------------------
-- 1. The derived price
-- ---------------------------------------------------------------------------

/*
 * What this job actually costs right now.
 *
 * The selected bid's price, replaced by the newest *approved* price update.
 * A pending or rejected request does not appear here at all, which is the
 * whole of "אם הלקוח לא מאשר — העבודה ממשיכה במחיר המקורי": there is nowhere
 * for an unapproved number to be stored as the price, so nothing has to
 * remember to ignore it.
 *
 * Each request records the effective price at the moment it was made as its
 * `original_price` (see request_price_update below), so the chain stays
 * consistent across several approvals: base + every approved delta is the same
 * number as the last approved new_price.
 */
create function public.job_effective_price(p_job_id uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select pu.new_price
        from public.price_updates pu
       where pu.job_id = p_job_id and pu.status = 'approved'
       order by pu.decided_at desc, pu.created_at desc
       limit 1
    ),
    (
      select b.price
        from public.jobs j
        join public.bids b on b.id = j.selected_bid_id
       where j.id = p_job_id
    )
  );
$$;

comment on function public.job_effective_price(uuid) is
  'The live price of a job: the selected bid, replaced by the newest approved price_update. There is no price column to disagree with it.';

revoke execute on function public.job_effective_price(uuid) from public, anon;
grant execute on function public.job_effective_price(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. price_updates — the state machine
-- ---------------------------------------------------------------------------

-- A request that changes nothing is not a request, and a job may only have one
-- decision waiting at a time: the customer's two buttons are "מאשר"/"לא מאשר",
-- and a queue of pending requests has no meaning on that screen.
alter table public.price_updates
  add constraint price_updates_new_price_positive check (new_price > 0),
  add constraint price_updates_moves_the_price check (new_price <> original_price),
  add constraint price_updates_decided_at_matches_status
    check ((status = 'pending') = (decided_at is null));

create unique index price_updates_one_pending_per_job
  on public.price_updates (job_id) where status = 'pending';

-- `original_price` is a money field. Phase 1's row-wide INSERT grant let the
-- pro assert it, which meant the pro could claim the agreed price had been
-- 600 all along. Neither side writes this table directly any more.
revoke insert on public.price_updates from authenticated;
revoke update (status, decided_at) on public.price_updates from authenticated;

-- The policies that went with those grants. A policy with no grant behind it
-- reads as permission that exists and does not, which is worse than nothing.
drop policy "price_updates: assigned pro inserts" on public.price_updates;
drop policy "price_updates: job owner decides" on public.price_updates;

/*
 * The invariant, held below every path — including the definer functions.
 *
 * A decision is final: `pending` is the only status that can be left, it can
 * only be left for a decided one, and the amounts, the photo and the job it
 * belongs to are frozen the moment the row exists. Without this, a future
 * function (or a service-role script) could quietly re-price a closed job, and
 * the photo the customer approved would no longer be the photo on file.
 */
create function public.price_updates_guard_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status <> 'pending' then
    raise exception 'a price update that has been decided cannot change'
      using errcode = '22023';
  end if;

  if new.status not in ('approved', 'rejected') then
    raise exception 'a pending price update may only move to approved or rejected'
      using errcode = '22023';
  end if;

  if new.job_id is distinct from old.job_id
     or new.pro_id is distinct from old.pro_id
     or new.original_price is distinct from old.original_price
     or new.new_price is distinct from old.new_price
     or new.photo_url is distinct from old.photo_url
     or new.note is distinct from old.note
  then
    raise exception 'the amounts and the photo of a price update are fixed'
      using errcode = '22023';
  end if;

  new.decided_at := coalesce(new.decided_at, now());
  return new;
end;
$$;

create trigger price_updates_guard_update
  before update on public.price_updates
  for each row execute function public.price_updates_guard_update();

/*
 * "שלח בקשת אישור ללקוח" — design/screens/pro-3.1-manage-job-price-update.png.
 *
 * product-spec.md 4.5: the photo is compulsory *before* the request goes out.
 * The column has been NOT NULL and non-blank since Phase 1; what this adds is
 * that the object named actually sits in the caller's own folder of the
 * price-update-photos bucket, so a pro cannot point the request at somebody
 * else's file.
 *
 * `original_price` is read here, never accepted: it is the effective price at
 * this instant, which is the number the customer is being asked to move away
 * from.
 */
create function public.request_price_update(
  p_job_id uuid,
  p_new_price numeric,
  p_photo_url text,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.jobs;
  v_original numeric;
  v_id uuid;
begin
  select * into v_job from public.jobs j where j.id = p_job_id;

  if v_job is null or not public.is_assigned_pro(p_job_id) then
    raise exception 'only the pro assigned to this job may ask to change its price'
      using errcode = '42501';
  end if;

  if v_job.status not in ('assigned', 'in_progress') then
    raise exception 'this job is not in progress' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.price_updates pu
     where pu.job_id = p_job_id and pu.status = 'pending'
  ) then
    raise exception 'a price update is already waiting for the customer'
      using errcode = '22023';
  end if;

  -- The photo lives at <pro_id>/<job_id>/<filename>; the bucket's insert
  -- policy pins the first segment, and this pins the second, so a photo can
  -- only ever be evidence for the job it was uploaded against.
  if p_photo_url is null
     or split_part(p_photo_url, '/', 1) <> (select auth.uid())::text
     or split_part(p_photo_url, '/', 2) <> p_job_id::text
     or split_part(p_photo_url, '/', 3) = ''
  then
    raise exception 'the photo must be one you uploaded for this job'
      using errcode = '22023';
  end if;

  v_original := public.job_effective_price(p_job_id);

  if v_original is null then
    raise exception 'this job has no agreed price yet' using errcode = '22023';
  end if;

  insert into public.price_updates
    (job_id, pro_id, original_price, new_price, photo_url, note)
  values
    (p_job_id, (select auth.uid()), v_original, p_new_price, p_photo_url,
     nullif(btrim(coalesce(p_note, '')), ''))
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.request_price_update(uuid, numeric, text, text) is
  'The pro asks to change a job''s price. original_price is read from job_effective_price(), never accepted from the caller, and the photo must be one the caller uploaded against this job.';

revoke execute on function public.request_price_update(uuid, numeric, text, text)
  from public, anon;
grant execute on function public.request_price_update(uuid, numeric, text, text)
  to authenticated;

/*
 * "מאשר" / "לא מאשר" — design/screens/customer-3.1-tracking-chat.png, the
 * modal state of product-spec.md 3.5. Two outcomes, one decision, no way back.
 *
 * Rejecting is not a no-op with a different label: it is what leaves
 * job_effective_price() reporting the original price, permanently and for
 * every reader, which is the business rule the roadmap asks to be proven.
 */
create function public.decide_price_update(p_id uuid, p_approve boolean)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.price_updates;
begin
  select * into v_row from public.price_updates pu where pu.id = p_id;

  if v_row is null or not public.is_job_owner(v_row.job_id) then
    raise exception 'only the customer who posted this job may decide its price updates'
      using errcode = '42501';
  end if;

  if v_row.status <> 'pending' then
    raise exception 'this price update has already been decided'
      using errcode = '22023';
  end if;

  update public.price_updates
     set status = case when p_approve then 'approved' else 'rejected' end,
         decided_at = now()
   where id = p_id;

  return case when p_approve then 'approved' else 'rejected' end;
end;
$$;

comment on function public.decide_price_update(uuid, boolean) is
  'The customer approves or refuses a field price change. One-way: a decided row can never move again, and only an approved one reaches job_effective_price().';

revoke execute on function public.decide_price_update(uuid, boolean) from public, anon;
grant execute on function public.decide_price_update(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. The one job-status transition this phase owns
-- ---------------------------------------------------------------------------

/*
 * "לחץ: הגעתי ללקוח" — the progress bar moves from בדרך ללקוח to בעבודה.
 *
 * A checked function rather than a grant, for the reason Phase 4 gave when it
 * revoked `update (status)`: a status a user must not set freely is a security
 * definer function (CLAUDE.md section 3). Here the pro *may* set it — but only
 * this one step, only on their own assigned job, and only in one direction.
 */
create function public.mark_job_in_progress(p_job_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  if not public.is_assigned_pro(p_job_id) then
    raise exception 'only the pro assigned to this job may start it'
      using errcode = '42501';
  end if;

  select j.status into v_status from public.jobs j where j.id = p_job_id;

  if v_status = 'in_progress' then
    return v_status;
  end if;

  if v_status <> 'assigned' then
    raise exception 'this job is not waiting to be started' using errcode = '22023';
  end if;

  update public.jobs set status = 'in_progress' where id = p_job_id;
  return 'in_progress';
end;
$$;

comment on function public.mark_job_in_progress(uuid) is
  'assigned -> in_progress, by the assigned pro. Idempotent. Completion is Phase 6, together with the commission row it has to create.';

revoke execute on function public.mark_job_in_progress(uuid) from public, anon;
grant execute on function public.mark_job_in_progress(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Live location
--
-- One row per job — where the assigned pro is now, not a trail of where they
-- have been. docs/architecture.md section 5 originally sketched this as a
-- broadcast channel; a table is what makes "who may watch this" a policy this
-- suite can prove, and what gives a customer opening the page mid-journey a
-- last known position instead of a blank map until the next ping.
--
-- The cost of that choice is one UPSERT per ping instead of a fan-out with no
-- write. It is bounded on purpose: a single row per job (no history to grow),
-- REPORT_INTERVAL in the client is 15 seconds, and the pro's browser only
-- reports while the job is assigned or in progress and the tab is open.
-- ---------------------------------------------------------------------------

create table public.job_locations (
  job_id uuid primary key references public.jobs (id) on delete cascade,
  pro_id uuid not null references public.pro_profiles (user_id) on delete cascade,
  location extensions.geography(Point, 4326) not null,
  -- Derived for the same reason jobs.latitude/longitude are: PostgREST hands a
  -- geography to the client as hex EWKB, and the map would otherwise decode it
  -- in JS. `location` stays the single source of truth.
  latitude double precision
    generated always as (extensions.st_y(location::extensions.geometry)) stored,
  longitude double precision
    generated always as (extensions.st_x(location::extensions.geometry)) stored,
  accuracy_m int check (accuracy_m is null or accuracy_m >= 0),
  /* The pro's own estimate of how long they still are, minutes. */
  eta_minutes int check (eta_minutes is null or eta_minutes between 0 and 1440),
  updated_at timestamptz not null default now()
);

comment on table public.job_locations is
  'Where the assigned pro is right now, one row per job. Written only through report_job_location(); read by the job''s customer, that pro, and an admin.';

alter table public.job_locations enable row level security;

-- No insert, update or delete grant to any client role at all: a position that
-- a customer could write is not a position, and a pro reporting themselves
-- onto somebody else's job is exactly what the definer function checks.
revoke all on public.job_locations from anon, authenticated;
grant select on public.job_locations to authenticated;

create policy "job_locations: job owner reads"
  on public.job_locations for select to authenticated
  using (public.is_job_owner(job_id));

create policy "job_locations: assigned pro reads own"
  on public.job_locations for select to authenticated
  using (pro_id = (select auth.uid()));

create policy "job_locations: admin reads all"
  on public.job_locations for select to authenticated
  using (public.is_admin());

/*
 * The pro's browser calls this every REPORT_INTERVAL seconds while the job is
 * live. Bounds-checked against Israel for the same reason lib/maps/geocode.ts
 * range-checks Places Autocomplete: a coordinate is an input like any other,
 * and a mis-typed one silently files the pro in the Atlantic.
 */
create function public.report_job_location(
  p_job_id uuid,
  p_lat double precision,
  p_lng double precision,
  p_accuracy_m int default null,
  p_eta_minutes int default null
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_at timestamptz;
begin
  if not public.is_assigned_pro(p_job_id) then
    raise exception 'only the pro assigned to this job may report a location for it'
      using errcode = '42501';
  end if;

  select j.status into v_status from public.jobs j where j.id = p_job_id;

  if v_status not in ('assigned', 'in_progress') then
    raise exception 'this job is not live' using errcode = '22023';
  end if;

  -- Israel's bounding box, the same one lib/maps/geocode.ts uses.
  if p_lat is null or p_lng is null
     or p_lat < 29.3 or p_lat > 33.4
     or p_lng < 34.2 or p_lng > 35.95
  then
    raise exception 'coordinates outside the service area' using errcode = '22023';
  end if;

  insert into public.job_locations
    (job_id, pro_id, location, accuracy_m, eta_minutes, updated_at)
  values (
    p_job_id,
    (select auth.uid()),
    extensions.st_point(p_lng, p_lat)::extensions.geography,
    p_accuracy_m,
    p_eta_minutes,
    now()
  )
  on conflict (job_id) do update
    set pro_id = excluded.pro_id,
        location = excluded.location,
        accuracy_m = excluded.accuracy_m,
        eta_minutes = excluded.eta_minutes,
        updated_at = excluded.updated_at
  returning updated_at into v_at;

  return v_at;
end;
$$;

comment on function public.report_job_location(uuid, double precision, double precision, int, int) is
  'The assigned pro reports where they are. Upserts one row per job; refuses a job that is not theirs, one that is not live, and a coordinate outside Israel.';

revoke execute on function public.report_job_location(uuid, double precision, double precision, int, int)
  from public, anon;
grant execute on function public.report_job_location(uuid, double precision, double precision, int, int)
  to authenticated;

-- ---------------------------------------------------------------------------
-- 5. What each side needs to see about the other
-- ---------------------------------------------------------------------------

/*
 * Both designs put a "חיוג ☎" button on this screen — the customer calls the
 * pro who is on the way, the pro calls the customer they are driving to. A
 * phone number lives on `profiles`, which has no cross-user SELECT policy and
 * must not get one: the number is not public, it is disclosed by the fact that
 * these two people have an assigned job together.
 *
 * So: the counterpart's name and phone, to the two sides of one assigned job,
 * and nothing else about them.
 */
create function public.job_contact(p_job_id uuid)
returns table (
  counterpart_id uuid,
  counterpart_name text,
  counterpart_phone text,
  counterpart_role text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_job public.jobs;
  v_pro_id uuid;
begin
  select * into v_job from public.jobs j where j.id = p_job_id;

  if v_job is null or v_job.selected_bid_id is null then
    return;
  end if;

  select b.pro_id into v_pro_id from public.bids b where b.id = v_job.selected_bid_id;

  if public.is_job_owner(p_job_id) or public.is_admin() then
    return query
      select p.id, p.full_name, p.phone, 'pro'::text
        from public.profiles p where p.id = v_pro_id;
  elsif v_pro_id = (select auth.uid()) then
    return query
      select p.id, p.full_name, p.phone, 'customer'::text
        from public.profiles p where p.id = v_job.customer_id;
  else
    raise exception 'not a job you are a side of' using errcode = '42501';
  end if;
end;
$$;

comment on function public.job_contact(uuid) is
  'The other side''s name and phone on an assigned job — the חיוג button on both tracking screens. Nothing else about them, and only to the two people concerned.';

revoke execute on function public.job_contact(uuid) from public, anon;
grant execute on function public.job_contact(uuid) to authenticated;

/*
 * design/screens/pro-3.2-my-jobs.png — העבודות שלי, the "פעילות" tab.
 *
 * Definer for the usual reason: the card carries the customer's name, and
 * `profiles` is closed. `current_price` comes from job_effective_price(), so a
 * pending request the customer has not answered does not appear as money.
 * History and receipts are the same screen's other tab and belong to Phase 6.
 */
create function public.my_active_jobs()
returns table (
  job_id uuid,
  description text,
  address_text text,
  status text,
  category_name_he text,
  customer_name text,
  agreed_price numeric,
  current_price numeric,
  eta_minutes int,
  pending_update_count int,
  assigned_at timestamptz,
  unread_count int
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    j.id,
    j.description,
    j.address_text,
    j.status,
    c.name_he,
    cust.full_name,
    b.price,
    public.job_effective_price(j.id),
    b.eta_minutes,
    (
      select count(*)::int from public.price_updates pu
       where pu.job_id = j.id and pu.status = 'pending'
    ),
    b.created_at,
    (
      select count(*)::int from public.messages m
       where m.job_id = j.id
         and m.pro_id = b.pro_id
         and m.sender_id <> (select auth.uid())
         and m.read_at is null
    )
  from public.jobs j
  join public.bids b on b.id = j.selected_bid_id
  join public.categories c on c.id = j.category_id
  join public.profiles cust on cust.id = j.customer_id
  where b.pro_id = (select auth.uid())
    and j.status in ('assigned', 'in_progress')
  order by b.created_at desc
  limit 100;
$$;

comment on function public.my_active_jobs() is
  'The calling pro''s assigned and in-progress jobs, with the customer''s name and the live price. The history tab of the same screen is Phase 6.';

revoke execute on function public.my_active_jobs() from public, anon;
grant execute on function public.my_active_jobs() to authenticated;

-- ---------------------------------------------------------------------------
-- 6. The price-update-photos bucket
--
-- docs/architecture.md section 6 names it. Private, like every other bucket
-- here, and with the same stance verification-docs takes: no UPDATE and no
-- DELETE policy at all. This photo is the evidence a customer approved a
-- higher price on, and evidence that can be swapped afterwards is not
-- evidence.
--
-- Layout: <pro_id>/<job_id>/<filename>. Both segments are pinned — the first
-- by the insert policy, the second by request_price_update() — so a photo
-- cannot be re-used as proof for a different job.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'price-update-photos',
  'price-update-photos',
  false,
  10485760, -- 10 MiB: one photo of a fault, taken on a phone
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
on conflict (id) do nothing;

/*
 * The customer's side of the read. They cannot see the pro's folder, and they
 * must be able to see this one file — product-spec.md 3.5 puts the photo at
 * the centre of the approval screen. The link is the price_updates row that
 * names it, which only exists once the request has actually been sent.
 */
create function public.can_read_price_update_photo(p_object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.price_updates pu
    where pu.photo_url = p_object_name
      and (public.is_job_owner(pu.job_id) or public.is_admin())
  );
$$;

comment on function public.can_read_price_update_photo(text) is
  'Storage-side twin of the customer''s SELECT policy on price_updates: the photo becomes visible to the customer exactly when the request naming it does.';

create policy "price-update-photos: pro reads own folder"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'price-update-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "price-update-photos: readable through a price update"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'price-update-photos'
    and public.can_read_price_update_photo(name)
  );

create policy "price-update-photos: pro uploads to own folder"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'price-update-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and public.auth_role() = 'pro'
  );

-- ---------------------------------------------------------------------------
-- 7. Realtime — docs/architecture.md section 5
--
-- "התראה על עדכון מחיר" (Postgres changes on price_updates) and the live map.
-- Realtime applies each subscriber's own RLS before delivering a row, so
-- publishing these widens nothing: only the two sides of a job can read either
-- table in the first place.
-- ---------------------------------------------------------------------------

alter publication supabase_realtime add table public.price_updates;
alter publication supabase_realtime add table public.job_locations;
