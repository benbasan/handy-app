-- Phase 7 — לוח ניהול (Admin): oversight and enforcement.
--
-- product-spec.md section 5, and the four screens under design/screens/admin-*.
-- Phase 3 left a deliberately minimal approvals desk behind ("a way, even a
-- temporary one, to move a pro to verified") and said the rest was this phase.
-- This is the rest.
--
-- Six things happen here, and each one is here rather than in the dashboard
-- for the same reason every phase before it gives: the UI must not be the
-- thing enforcing it.
--
--  1. **`disputes` loses its table-wide INSERT grant.** Phase 1 wrote
--     `grant select, insert on public.disputes`, which is every column — so a
--     participant could have opened a case already marked `resolved` with a
--     `credit_amount` of their own choosing. RLS picks rows, never columns
--     (CLAUDE.md section 5), so the policy underneath was never going to stop
--     that. Three columns are granted now: job_id, opened_by, reason.
--
--  2. **Deciding a dispute is `resolve_dispute()`.** Phase 1 withheld the
--     UPDATE grant on purpose and named this phase as the one that would
--     resolve a case with elevated access. Neither side can close their own
--     complaint, and the credit a customer is given is written by the same
--     statement that closes it.
--
--  3. **The four enforcement tools of product-spec.md 5.4 are real, not a
--     caption.** השעיית פרופיל · חסימת עדכוני מחיר · דרישת מסמכים מחודשת ·
--     זיכוי ללקוח. The first goes through Phase 3's `set_pro_verification()`;
--     the middle two need state that did not exist, and it lands on
--     `pro_profiles` with **no client grant at all** — the same treatment
--     `verification_status` has had since Phase 1.
--
--  4. **Blocking price updates is enforced where price updates are made.**
--     `request_price_update()` is replaced so the block is checked inside the
--     one function that can write the table, rather than by hiding a button.
--
--  5. **Every admin read is a `security definer` function that calls
--     `is_admin()` first.** The dashboard's numbers are aggregates —
--     "how many jobs today", "what share of price updates were approved" —
--     and an aggregate cannot be expressed as a row policy. So each one
--     re-asks the question the policies ask, at its own front door, and a
--     customer calling any of them by hand gets 42501 rather than a number.
--     The *dossier* behind a dispute is the opposite: `jobs`, `bids`,
--     `price_updates`, `messages`, `commission_charges` and `reviews` all
--     already carry an "admin reads all" policy from the phase that created
--     them, so it is read as plain rows under RLS and no new function exists
--     to widen.
--
--  6. **A job's city is derived, never stored.** The jobs table groups by עיר,
--     and `address_text` already ends in one. A second column would be a
--     second thing that can disagree with the address the customer typed.

-- ---------------------------------------------------------------------------
-- 1. The hole in Phase 1's dispute grant
-- ---------------------------------------------------------------------------

revoke insert on public.disputes from authenticated;
-- status defaults to 'open' and credit_amount to null; neither is the
-- complainant's to assert, any more than a bid's expires_at was theirs.
grant insert (job_id, opened_by, reason) on public.disputes to authenticated;

alter table public.disputes
  add column resolution_note text,
  add column resolved_by uuid references public.profiles (id) on delete set null;

comment on column public.disputes.resolution_note is
  'What the admin decided and why. Written only by resolve_dispute(); there is no UPDATE grant on this table for any client role.';

create index disputes_status_idx on public.disputes (status);

-- A job carries at most one live case. A second complaint about the same job
-- while the first is open is the same complaint, and two rows would be two
-- answers to one question.
create unique index disputes_one_open_per_job_idx
  on public.disputes (job_id)
  where status in ('open', 'in_review');

/*
 * "הכרעה וזיכוי" — design/screens/admin-7.4-disputes-control.png.
 *
 * in_review is a step, not an end: it says a human has picked the case up,
 * which is what the 24-hour response target on the same screen is measured
 * against. resolved and rejected are terminal and stamp resolved_at, which is
 * what feeds "זמן הכרעה ממוצע" in the trust metrics.
 *
 * The credit belongs to the decision that grants it: passing an amount with
 * any other outcome is a mistake, not a shortcut, and is refused.
 */
create function public.resolve_dispute(
  p_id uuid,
  p_status text,
  p_note text default null,
  p_credit_amount numeric default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.disputes;
begin
  if not public.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;

  select * into v_row from public.disputes d where d.id = p_id;

  if v_row is null then
    raise exception 'no such dispute' using errcode = 'P0002';
  end if;

  if p_status not in ('in_review', 'resolved', 'rejected') then
    raise exception 'unsupported dispute status: %', p_status using errcode = '22023';
  end if;

  if v_row.status in ('resolved', 'rejected') then
    raise exception 'this dispute has already been decided' using errcode = '22023';
  end if;

  if p_credit_amount is not null then
    if p_status <> 'resolved' then
      raise exception 'a credit belongs to a dispute that was upheld'
        using errcode = '22023';
    end if;
    if p_credit_amount < 0 then
      raise exception 'a credit cannot be negative' using errcode = '22023';
    end if;
  end if;

  update public.disputes
     set status = p_status,
         resolution_note = nullif(btrim(coalesce(p_note, '')), ''),
         credit_amount = case when p_status = 'resolved' then p_credit_amount end,
         resolved_by = (select auth.uid()),
         resolved_at = case
           when p_status in ('resolved', 'rejected') then now()
         end
   where id = p_id;

  return p_status;
end;
$$;

comment on function public.resolve_dispute(uuid, text, text, numeric) is
  'An admin decides a dispute. The only write path into an existing row: disputes has no UPDATE grant for any client role, so neither side can close their own case or award themselves a credit.';

revoke execute on function public.resolve_dispute(uuid, text, text, numeric) from public, anon;
grant execute on function public.resolve_dispute(uuid, text, text, numeric) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. The enforcement tools — product-spec.md 5.4
-- ---------------------------------------------------------------------------

alter table public.pro_profiles
  add column price_updates_blocked boolean not null default false,
  add column documents_required_at timestamptz;

comment on column public.pro_profiles.price_updates_blocked is
  'Admin enforcement: this pro may not ask for a field price change. Checked inside request_price_update(), not in the UI. No client grant.';
comment on column public.pro_profiles.documents_required_at is
  'Admin enforcement: fresh verification documents were demanded at this time. No client grant.';

-- Deliberately NOT added to the pro's update grant, which is the whole point:
-- a pro who could clear their own block would be enforcing nothing.

/*
 * The four buttons under "כלי אכיפה" on the disputes screen, as one function
 * with a closed vocabulary rather than four grants.
 *
 * `require_documents` moves the pro back to `pending`, which is not decoration:
 * `is_verified_pro()` is false in that state, and the INSERT policy on `bids`
 * checks it — so demanding documents actually stops the pro taking new work
 * until an admin has looked again. Their existing document rows are left
 * alone; they are the evidence of what was reviewed last time.
 */
create function public.set_pro_enforcement(p_pro_id uuid, p_action text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;

  if not exists (select 1 from public.pro_profiles pp where pp.user_id = p_pro_id) then
    raise exception 'no such pro' using errcode = 'P0002';
  end if;

  case p_action
    when 'block_price_updates' then
      update public.pro_profiles set price_updates_blocked = true
       where user_id = p_pro_id;
    when 'unblock_price_updates' then
      update public.pro_profiles set price_updates_blocked = false
       where user_id = p_pro_id;
    when 'require_documents' then
      update public.pro_profiles
         set documents_required_at = now(),
             verification_status = 'pending'
       where user_id = p_pro_id;
    when 'clear_documents_request' then
      update public.pro_profiles set documents_required_at = null
       where user_id = p_pro_id;
    else
      raise exception 'unsupported enforcement action: %', p_action
        using errcode = '22023';
  end case;

  return p_action;
end;
$$;

comment on function public.set_pro_enforcement(uuid, text) is
  'Admin enforcement on one pro: block/unblock field price updates, or demand fresh documents. Suspension is set_pro_verification(); a credit to the customer is resolve_dispute().';

revoke execute on function public.set_pro_enforcement(uuid, text) from public, anon;
grant execute on function public.set_pro_enforcement(uuid, text) to authenticated;

/*
 * Phase 5's function, with one gate added.
 *
 * The block is checked here rather than in the pro's job screen for the reason
 * this project keeps repeating: a hidden button is not an enforced rule. Every
 * other line is unchanged.
 */
create or replace function public.request_price_update(
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

  -- Phase 7: an admin can take this away from a specific pro
  -- (product-spec.md 5.4). Checked where the row is written, so there is no
  -- version of the client that can get around it.
  if exists (
    select 1 from public.pro_profiles pp
     where pp.user_id = (select auth.uid()) and pp.price_updates_blocked
  ) then
    raise exception 'field price updates are blocked for this pro'
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

-- ---------------------------------------------------------------------------
-- 3. עיר — derived from the address, never stored
-- ---------------------------------------------------------------------------

create function public.job_city(p_address text)
returns text
language sql
immutable
as $$ select nullif(btrim(split_part(p_address, ',', -1)), '') $$;

comment on function public.job_city(text) is
  'The city out of a job''s address_text — the last comma-separated part. Derived so the admin table can group by city without a column that can disagree with the address.';

grant execute on function public.job_city(text) to authenticated, anon;

-- ---------------------------------------------------------------------------
-- 4. סקירה כללית — product-spec.md 5.1
-- ---------------------------------------------------------------------------

/*
 * design/screens/admin-7.1-overview.png, in one row.
 *
 * Every figure on that screen and nothing else. It is one function rather than
 * eight because the header pills, the four stat cards, the revenue card and
 * the red "התראות בקרה" list are all one glance at one moment — eight round
 * trips could show a state that never existed.
 */
create function public.admin_overview()
returns table (
  pending_pros int,
  open_disputes int,
  jobs_24h int,
  jobs_prev_24h int,
  minutes_to_first_bid numeric,
  closed_rate_pct numeric,
  jobs_without_bids int,
  commission_month numeric,
  commission_month_jobs int,
  commission_prev_month numeric,
  unreviewed_docs int,
  pros_with_many_price_updates int
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;

  return query
  with month_start as (
    select date_trunc('month', now()) as this_month,
           date_trunc('month', now()) - interval '1 month' as prev_month
  ),
  first_bids as (
    select b.job_id, min(b.created_at) as first_at
      from public.bids b
     group by b.job_id
  )
  select
    (select count(*)::int from public.pro_profiles pp
      where pp.verification_status = 'pending'),
    (select count(*)::int from public.disputes d
      where d.status in ('open', 'in_review')),
    (select count(*)::int from public.jobs j
      where j.created_at >= now() - interval '24 hours'),
    (select count(*)::int from public.jobs j
      where j.created_at >= now() - interval '48 hours'
        and j.created_at < now() - interval '24 hours'),
    (select round(avg(extract(epoch from (fb.first_at - j.created_at)) / 60)::numeric, 0)
       from first_bids fb
       join public.jobs j on j.id = fb.job_id
      where j.created_at >= now() - interval '7 days'),
    (select case when count(*) = 0 then null
                 else round(100.0 * count(*) filter (where j.status = 'completed') / count(*), 0)
            end
       from public.jobs j
      where j.created_at >= now() - interval '30 days'
        and j.status <> 'draft'),
    -- "קריאות ללא הצעות מעל שעה" — the first line of התראות בקרה.
    (select count(*)::int from public.jobs j
      where j.status in ('open', 'bidding')
        and j.created_at < now() - interval '1 hour'
        and not exists (select 1 from public.bids b where b.job_id = j.id)),
    (select coalesce(sum(cc.commission_amount), 0) from public.commission_charges cc, month_start m
      where cc.charged_at >= m.this_month),
    (select count(*)::int from public.commission_charges cc, month_start m
      where cc.charged_at >= m.this_month),
    (select coalesce(sum(cc.commission_amount), 0) from public.commission_charges cc, month_start m
      where cc.charged_at >= m.prev_month and cc.charged_at < m.this_month),
    (select count(*)::int from public.verification_documents vd
      where vd.status = 'pending'),
    -- "בעל מקצוע אחד עם 3 עדכוני מחיר ביום" — the transparency rule's own
    -- smoke alarm: a pro leaning on field updates is what 5.5 exists to catch.
    (select count(*)::int from (
        select pu.pro_id from public.price_updates pu
         where pu.created_at >= now() - interval '24 hours'
         group by pu.pro_id having count(*) >= 3
      ) heavy);
end;
$$;

comment on function public.admin_overview() is
  'Every number on design/screens/admin-7.1-overview.png, in one row and one instant. Checks is_admin() itself — an aggregate cannot be expressed as a row policy.';

revoke execute on function public.admin_overview() from public, anon;
grant execute on function public.admin_overview() to authenticated;

/*
 * The "קריאות לפי יום" chart. One row per day including the empty ones, so the
 * bars keep their spacing on a quiet week.
 */
create function public.admin_jobs_by_day(p_days int default 7)
returns table (day date, jobs_count int)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;

  return query
  select d::date,
         (select count(*)::int from public.jobs j
           where j.created_at >= d and j.created_at < d + interval '1 day')
    from generate_series(
      date_trunc('day', now()) - make_interval(days => greatest(least(p_days, 90), 1) - 1),
      date_trunc('day', now()),
      interval '1 day'
    ) as d;
end;
$$;

revoke execute on function public.admin_jobs_by_day(int) from public, anon;
grant execute on function public.admin_jobs_by_day(int) to authenticated;

/*
 * The legend under that chart — אינסטלציה 34% · חשמל 27% · … Shares of the
 * same window the bars cover, so the picture and its key are one query apart
 * rather than two different weeks.
 */
create function public.admin_category_mix(p_days int default 7)
returns table (category_name_he text, category_slug text, jobs_count int, share_pct numeric)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;

  return query
  with window_jobs as (
    select j.category_id
      from public.jobs j
     where j.created_at >= date_trunc('day', now())
                          - make_interval(days => greatest(least(p_days, 90), 1) - 1)
  ),
  total as (select count(*)::numeric as n from window_jobs)
  select c.name_he,
         c.slug,
         count(*)::int,
         case when t.n = 0 then 0 else round(100.0 * count(*) / t.n, 0) end
    from window_jobs w
    join public.categories c on c.id = w.category_id
    cross join total t
   group by c.name_he, c.slug, t.n
   order by count(*) desc, c.name_he;
end;
$$;

revoke execute on function public.admin_category_mix(int) from public, anon;
grant execute on function public.admin_category_mix(int) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. קריאות במערכת — product-spec.md 5.3
-- ---------------------------------------------------------------------------

/*
 * design/screens/admin-7.3-jobs-management.png: the table and its four
 * filters, plus the search box that accepts a job reference, a customer or a
 * pro.
 *
 * The סכום column is `job_effective_price()` — the same function the customer
 * and the pro read — rather than anything stored on the row, which is why a
 * job the customer never chose a bid on shows "—" here without a special case.
 */
create function public.admin_jobs(
  p_search text default null,
  p_status text default null,
  p_category_slug text default null,
  p_city text default null,
  p_days int default 7
)
returns table (
  job_id uuid,
  category_name_he text,
  category_slug text,
  city text,
  address_text text,
  description text,
  status text,
  bids_count int,
  amount numeric,
  customer_name text,
  pro_name text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
begin
  if not public.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;

  return query
  select
    j.id,
    c.name_he,
    c.slug,
    public.job_city(j.address_text),
    j.address_text,
    j.description,
    j.status,
    (select count(*)::int from public.bids b where b.job_id = j.id),
    public.job_effective_price(j.id),
    cust.full_name,
    pro.full_name,
    j.created_at
  from public.jobs j
  join public.categories c on c.id = j.category_id
  join public.profiles cust on cust.id = j.customer_id
  left join public.bids sel on sel.id = j.selected_bid_id
  left join public.profiles pro on pro.id = sel.pro_id
  where (p_days is null
         or j.created_at >= date_trunc('day', now())
                            - make_interval(days => greatest(p_days, 1) - 1))
    and (p_status is null or j.status = p_status)
    and (p_category_slug is null or c.slug = p_category_slug)
    and (p_city is null or public.job_city(j.address_text) = p_city)
    and (
      v_search is null
      -- The H-24817 reference the design puts on every card: the last five
      -- digits of the id, which is how lib/validation/jobs.ts derives it.
      or (regexp_replace(v_search, '\D', '', 'g') <> ''
          and right(regexp_replace(j.id::text, '\D', '', 'g'), 5)
              = right(regexp_replace(v_search, '\D', '', 'g'), 5))
      or cust.full_name ilike '%' || v_search || '%'
      or pro.full_name ilike '%' || v_search || '%'
      or j.address_text ilike '%' || v_search || '%'
    )
  order by j.created_at desc
  limit 300;
end;
$$;

comment on function public.admin_jobs(text, text, text, text, int) is
  'The קריאות במערכת table. Every column is read live — the amount is job_effective_price(), the same number the two sides of the job see.';

revoke execute on function public.admin_jobs(text, text, text, text, int) from public, anon;
grant execute on function public.admin_jobs(text, text, text, text, int) to authenticated;

/** The כל הערים chip's options — whatever cities actually have jobs. */
create function public.admin_job_cities()
returns table (city text, jobs_count int)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;

  return query
  select public.job_city(j.address_text), count(*)::int
    from public.jobs j
   where public.job_city(j.address_text) is not null
   group by 1
   order by 2 desc, 1;
end;
$$;

revoke execute on function public.admin_job_cities() from public, anon;
grant execute on function public.admin_job_cities() to authenticated;

-- ---------------------------------------------------------------------------
-- 6. מחלוקות ומדדי אמון — product-spec.md 5.4 and 5.5
-- ---------------------------------------------------------------------------

/*
 * The dispute list on design/screens/admin-7.4-disputes-control.png. Definer
 * because the card names both sides and `profiles` has no cross-user read
 * policy — the same reason bids_for_job() and job_receipt() are definers.
 *
 * What is *not* here is the dossier the three buttons open. `jobs`, `bids`,
 * `price_updates`, `messages`, `commission_charges` and `reviews` each carry
 * an "admin reads all" policy already, so the documentation screen is plain
 * rows under RLS. Wrapping them in a function would have meant a second,
 * unpoliced way to read the same data.
 */
create function public.admin_disputes(p_status text default null)
returns table (
  dispute_id uuid,
  job_id uuid,
  reason text,
  status text,
  credit_amount numeric,
  resolution_note text,
  created_at timestamptz,
  resolved_at timestamptz,
  opened_by uuid,
  opened_by_name text,
  opened_by_role text,
  job_status text,
  category_name_he text,
  customer_name text,
  pro_name text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;

  return query
  select
    d.id,
    d.job_id,
    d.reason,
    d.status,
    d.credit_amount,
    d.resolution_note,
    d.created_at,
    d.resolved_at,
    d.opened_by,
    opener.full_name,
    opener.role,
    j.status,
    c.name_he,
    cust.full_name,
    pro.full_name
  from public.disputes d
  join public.jobs j on j.id = d.job_id
  join public.categories c on c.id = j.category_id
  join public.profiles cust on cust.id = j.customer_id
  join public.profiles opener on opener.id = d.opened_by
  left join public.bids sel on sel.id = j.selected_bid_id
  left join public.profiles pro on pro.id = sel.pro_id
  where p_status is null or d.status = p_status
  order by
    case when d.status in ('open', 'in_review') then 0 else 1 end,
    d.created_at desc
  limit 200;
end;
$$;

revoke execute on function public.admin_disputes(text) from public, anon;
grant execute on function public.admin_disputes(text) to authenticated;

/*
 * מדדי אמון — product-spec.md 5.5, the three numbers in the left column of the
 * disputes screen.
 *
 * The middle one is the one that matters: "% עדכוני מחיר שאושרו" is how you
 * tell a field update that was genuine from an attempt to inflate a price
 * after the customer had already committed. It counts decided rows only —
 * a request still waiting is not yet evidence of anything.
 */
create function public.admin_trust_metrics(p_days int default 90)
returns table (
  jobs_count int,
  disputes_count int,
  disputes_per_1000 numeric,
  price_updates_decided int,
  price_updates_approved_pct numeric,
  avg_resolution_hours numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_since timestamptz := now() - make_interval(days => greatest(p_days, 1));
begin
  if not public.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;

  return query
  with j as (
    select count(*)::int as n from public.jobs where created_at >= v_since
  ),
  d as (
    select count(*)::int as n from public.disputes where created_at >= v_since
  ),
  pu as (
    select count(*)::int as n,
           count(*) filter (where status = 'approved')::int as approved
      from public.price_updates
     where created_at >= v_since and status in ('approved', 'rejected')
  ),
  res as (
    select avg(extract(epoch from (resolved_at - created_at)) / 3600)::numeric as hours
      from public.disputes
     where resolved_at is not null and created_at >= v_since
  )
  select
    j.n,
    d.n,
    case when j.n = 0 then 0 else round(1000.0 * d.n / j.n, 1) end,
    pu.n,
    case when pu.n = 0 then null else round(100.0 * pu.approved / pu.n, 0) end,
    round(res.hours, 0)
  from j, d, pu, res;
end;
$$;

comment on function public.admin_trust_metrics(int) is
  'product-spec.md 5.5: disputes per 1,000 jobs, the share of field price updates the customer approved, and how long a case takes to decide.';

revoke execute on function public.admin_trust_metrics(int) from public, anon;
grant execute on function public.admin_trust_metrics(int) to authenticated;
