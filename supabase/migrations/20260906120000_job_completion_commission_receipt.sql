-- Phase 6 — סיום עבודה, תשלום, עמלה וקבלה.
--
-- This is the phase that closes the product's economic loop. Phase 5 left the
-- job at `in_progress` on purpose and said so in its own header: reaching
-- `completed` has to create a commission row and a receipt, and building half
-- of that early would have meant a button that half worked.
--
-- Five things happen here, and — as in every phase before it — each exists
-- because the UI must not be the thing enforcing it:
--
--  1. **`complete_job()` is one statement, and the 12% is computed inside it.**
--     `commission_charges` has never had an INSERT grant for any client role
--     (Phase 1 said, in that migration, that Phase 6 would write it with
--     elevated code). The amounts are read here — the selected bid for the
--     base, `job_effective_price()` for the total — never accepted from the
--     caller. CLAUDE.md section 3: money is server-authoritative.
--
--  2. **A request the customer never answered is refused at closing time, not
--     silently ignored.** `job_effective_price()` already excludes a pending
--     row, so the total would have been right either way — but leaving the
--     request `pending` forever on a finished job means a screen that still
--     asks a question nobody can act on. Completing the job settles it as
--     `rejected`, which is the same answer the price already gave: "אם הלקוח
--     לא מאשר, העבודה ממשיכה במחיר המקורי".
--
--  3. **The pro declares how they were paid, because the pro is who was paid.**
--     The button is "סיימתי — עדכן גבייה" on
--     design/screens/pro-3.1-manage-job-price-update.png. Handy never touches
--     the money (business rule 4) — it records the collection so it can charge
--     its 12% and issue a receipt. The customer's summary screen shows the
--     method that was recorded rather than choosing it, which is what the four
--     chips under "התשלום מתבצע ישירות לבעל המקצוע" on
--     design/screens/customer-4.1-summary-receipt-rating.png actually are.
--
--  4. **A review is `submit_job_review()`, and only on a finished job.**
--     Phase 1 granted INSERT and UPDATE (rating, comment) on `reviews` with a
--     policy of "you own the job". That let a customer rate a pro before the
--     pro had done anything, and rewrite the score afterwards as leverage.
--     Both grants are revoked. The function checks the job is `completed`, and
--     a trigger recomputes `pro_profiles.rating_avg` — a column no client has
--     ever been able to write (Phase 1 left it out of the grant list).
--
--  5. **The receipt is a function, and it tells each side a different truth.**
--     `job_receipt()` gives the customer the base, the approved additions and
--     the total; the commission is between Handy and the pro and is none of
--     the customer's business (docs/architecture.md section 4), so it comes
--     back NULL for them and filled for the pro.
--
-- Screens: design/screens/customer-4.1-summary-receipt-rating.png,
-- pro-3.2-my-jobs.png (the היסטוריה tab) and pro-4.1-earnings-wallet.png.

-- ---------------------------------------------------------------------------
-- 1. The rate
-- ---------------------------------------------------------------------------

/*
 * 12% of a closed job, charged to the pro — product-spec.md business rule 3,
 * and the promise on every pro-facing screen in the design.
 *
 * A function rather than a literal repeated in four places: the number appears
 * in the commission row, in the receipt, on the bid form's "נטו לבעל המקצוע"
 * line and in the wallet. One of those drifting from the others is a bug
 * nobody would notice until a pro read their statement.
 */
create function public.commission_rate()
returns numeric
language sql
immutable
as $$ select 0.12::numeric $$;

comment on function public.commission_rate() is
  'Handy''s cut of a closed job: 12%, charged to the pro only (product-spec.md business rule 3).';

grant execute on function public.commission_rate() to authenticated, anon;

-- ---------------------------------------------------------------------------
-- 1b. One vocabulary for "how the money changed hands"
--
-- Phase 1 wrote `commission_charges.payment_method` as
-- cash / bit / paybox / **bank_transfer**; Phase 3 wrote
-- `pro_profiles.payment_methods` as cash / bit / paybox / **transfer**. Two
-- spellings of the same four options, which nothing noticed until this phase
-- needed to put "which methods do you accept" and "how were you paid" on the
-- same screen. Phase 1's spelling wins, because it is the one that ends up on
-- a receipt.
-- ---------------------------------------------------------------------------

alter table public.pro_profiles
  drop constraint pro_profiles_payment_methods_check;

update public.pro_profiles
   set payment_methods = array_replace(payment_methods, 'transfer', 'bank_transfer')
 where 'transfer' = any (payment_methods);

alter table public.pro_profiles
  add constraint pro_profiles_payment_methods_check
  check (payment_methods <@ array['cash', 'bit', 'paybox', 'bank_transfer']);

-- ---------------------------------------------------------------------------
-- 2. Completing a job
-- ---------------------------------------------------------------------------

/*
 * "סיימתי — עדכן גבייה" — design/screens/pro-3.1-manage-job-price-update.png.
 *
 * The whole of the closing transaction, in one statement, because every part
 * of it has to be true at the same instant: the job is finished, any request
 * still hanging is settled, the commission is written against the price that
 * actually held, and the pro's completed count moves.
 *
 * Idempotent on purpose. This is the last thing a pro does on a job, often on
 * a phone in somebody's kitchen, and a retried request must not produce a
 * second commission row — `commission_charges.job_id` is unique, so a second
 * insert would fail loudly rather than double-charge, but returning the
 * existing id is the answer the caller actually wants.
 */
create function public.complete_job(p_job_id uuid, p_payment_method text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.jobs;
  v_base numeric;
  v_total numeric;
  v_commission numeric;
  v_id uuid;
begin
  if not public.is_assigned_pro(p_job_id) then
    raise exception 'only the pro assigned to this job may close it'
      using errcode = '42501';
  end if;

  select * into v_job from public.jobs j where j.id = p_job_id;

  -- Already closed: hand back the charge that exists rather than making a
  -- second one, and rather than raising on a button pressed twice.
  if v_job.status = 'completed' then
    select cc.id into v_id
      from public.commission_charges cc where cc.job_id = p_job_id;
    return v_id;
  end if;

  if v_job.status not in ('assigned', 'in_progress') then
    raise exception 'this job is not one that can be completed'
      using errcode = '22023';
  end if;

  if p_payment_method is null
     or p_payment_method not in ('cash', 'bit', 'paybox', 'bank_transfer') then
    raise exception 'unknown payment method' using errcode = '22023';
  end if;

  -- A request the customer never answered is settled here rather than left
  -- pending on a finished job. It changes no number — job_effective_price()
  -- has never counted a pending row — it closes the question.
  update public.price_updates
     set status = 'rejected', decided_at = now()
   where job_id = p_job_id and status = 'pending';

  select b.price into v_base
    from public.bids b where b.id = v_job.selected_bid_id;

  v_total := public.job_effective_price(p_job_id);

  if v_base is null or v_total is null then
    raise exception 'this job has no agreed price' using errcode = '22023';
  end if;

  -- Rounded to agorot. The client computes the same number for display; this
  -- is the one that is charged.
  v_commission := round(v_total * public.commission_rate(), 2);

  insert into public.commission_charges
    (job_id, pro_id, base_price, total_price, commission_amount, payment_method)
  values
    (p_job_id, (select auth.uid()), v_base, v_total, v_commission, p_payment_method)
  returning id into v_id;

  update public.jobs set status = 'completed' where id = p_job_id;

  update public.pro_profiles
     set jobs_completed_count = jobs_completed_count + 1
   where user_id = (select auth.uid());

  return v_id;
end;
$$;

comment on function public.complete_job(uuid, text) is
  'in_progress -> completed by the assigned pro, writing the commission row in the same statement. base_price is the selected bid, total_price is job_effective_price(), and the 12% is computed here — never accepted from the caller.';

revoke execute on function public.complete_job(uuid, text) from public, anon;
grant execute on function public.complete_job(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. The rating
-- ---------------------------------------------------------------------------

-- Phase 1's grants let a customer rate a pro on a job the pro had not yet
-- done, and rewrite the score afterwards. A review is a pro's public
-- reputation; it belongs to the same family as verification_status and
-- rating_avg, which no client role can write either.
revoke insert on public.reviews from authenticated;
revoke update (rating, comment) on public.reviews from authenticated;

drop policy "reviews: job owner writes" on public.reviews;
drop policy "reviews: job owner edits own" on public.reviews;

/*
 * "איך היה השירות?" — design/screens/customer-4.1-summary-receipt-rating.png.
 *
 * One review per job (Phase 1's unique constraint), by the customer who posted
 * it, and only once the work is actually finished. Re-submitting replaces the
 * previous answer rather than raising: the five stars on that screen are a
 * control the customer may change their mind about while they are still on the
 * page, and a duplicate-key error is not the message for that.
 */
create function public.submit_job_review(
  p_job_id uuid,
  p_rating int,
  p_comment text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_id uuid;
begin
  if not public.is_job_owner(p_job_id) then
    raise exception 'only the customer who posted this job may rate it'
      using errcode = '42501';
  end if;

  select j.status into v_status from public.jobs j where j.id = p_job_id;

  if v_status <> 'completed' then
    raise exception 'a job can only be rated once it is finished'
      using errcode = '22023';
  end if;

  if p_rating is null or p_rating < 1 or p_rating > 5 then
    raise exception 'a rating is one to five stars' using errcode = '22023';
  end if;

  insert into public.reviews (job_id, rating, comment)
  values (p_job_id, p_rating, nullif(btrim(coalesce(p_comment, '')), ''))
  on conflict (job_id) do update
    set rating = excluded.rating,
        comment = excluded.comment
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.submit_job_review(uuid, int, text) is
  'The customer rates a finished job. The only write path into reviews: the grants Phase 1 gave the customer are revoked, because a review is the pro''s public reputation.';

revoke execute on function public.submit_job_review(uuid, int, text) from public, anon;
grant execute on function public.submit_job_review(uuid, int, text) to authenticated;

/*
 * `pro_profiles.rating_avg` is derived from `reviews` and always has been —
 * Phase 1 deliberately left it out of the pro's update grant so a pro could
 * not set their own score. This is what keeps it true.
 *
 * A trigger rather than a line inside submit_job_review(), so that it also
 * holds for the admin tooling of Phase 7 and for anything that ever corrects
 * a review with elevated access.
 */
create function public.reviews_refresh_pro_rating()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pro_id uuid;
begin
  select b.pro_id into v_pro_id
    from public.jobs j
    join public.bids b on b.id = j.selected_bid_id
   where j.id = new.job_id;

  if v_pro_id is null then
    return new;
  end if;

  update public.pro_profiles
     set rating_avg = (
       select round(avg(r.rating), 1)
         from public.reviews r
         join public.jobs j on j.id = r.job_id
         join public.bids b on b.id = j.selected_bid_id
        where b.pro_id = v_pro_id
     )
   where user_id = v_pro_id;

  return new;
end;
$$;

create trigger reviews_refresh_pro_rating
  after insert or update on public.reviews
  for each row execute function public.reviews_refresh_pro_rating();

-- ---------------------------------------------------------------------------
-- 4. The receipt
-- ---------------------------------------------------------------------------

/*
 * "הורד קבלה PDF" — on the customer's summary screen, and beside every closed
 * job on design/screens/pro-3.2-my-jobs.png.
 *
 * A definer function for the usual reason: the receipt names both sides, and
 * `profiles` has no cross-user read policy. It is also the one place where the
 * two readers are told different things — `commission_amount` and
 * `net_amount` come back NULL for the customer, because the 12% is between
 * Handy and the pro (docs/architecture.md section 4).
 *
 * The line items are not here: the approved `price_updates` rows *are* the
 * lines, and both sides already hold a read policy on that table. A second
 * copy of them would be a second answer to the question of what this job cost.
 */
create function public.job_receipt(p_job_id uuid)
returns table (
  job_id uuid,
  description text,
  address_text text,
  category_name_he text,
  customer_name text,
  pro_id uuid,
  pro_name text,
  payment_method text,
  base_price numeric,
  total_price numeric,
  commission_amount numeric,
  net_amount numeric,
  charged_at timestamptz,
  rating int,
  review_comment text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_is_owner boolean := public.is_job_owner(p_job_id);
  v_is_pro boolean := public.is_assigned_pro(p_job_id);
  v_is_admin boolean := public.is_admin();
  v_sees_commission boolean;
begin
  if not (v_is_owner or v_is_pro or v_is_admin) then
    raise exception 'not a job you are a side of' using errcode = '42501';
  end if;

  v_sees_commission := v_is_pro or v_is_admin;

  return query
    select
      j.id,
      j.description,
      j.address_text,
      c.name_he,
      cust.full_name,
      cc.pro_id,
      pro.full_name,
      cc.payment_method,
      cc.base_price,
      cc.total_price,
      case when v_sees_commission then cc.commission_amount end,
      case when v_sees_commission
           then cc.total_price - cc.commission_amount end,
      cc.charged_at,
      r.rating,
      r.comment
    from public.jobs j
    join public.commission_charges cc on cc.job_id = j.id
    join public.categories c on c.id = j.category_id
    join public.profiles cust on cust.id = j.customer_id
    join public.profiles pro on pro.id = cc.pro_id
    left join public.reviews r on r.job_id = j.id
    where j.id = p_job_id;
end;
$$;

comment on function public.job_receipt(uuid) is
  'The billing summary of a closed job, to its two sides. The commission and the net are NULL for the customer: the 12% is between Handy and the pro.';

revoke execute on function public.job_receipt(uuid) from public, anon;
grant execute on function public.job_receipt(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. The pro's history and wallet
-- ---------------------------------------------------------------------------

/*
 * design/screens/pro-3.2-my-jobs.png (the היסטוריה tab) and the table on
 * pro-4.1-earnings-wallet.png are the same rows with different columns
 * visible, so they are one function.
 *
 * `p_since` NULL means everything. The wallet's היום / השבוע / החודש toggle
 * passes a boundary; the history tab passes nothing.
 */
create function public.my_completed_jobs(p_since timestamptz default null)
returns table (
  job_id uuid,
  description text,
  address_text text,
  category_name_he text,
  category_slug text,
  customer_name text,
  base_price numeric,
  total_price numeric,
  commission_amount numeric,
  net_amount numeric,
  payment_method text,
  charged_at timestamptz,
  rating int
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
    c.name_he,
    c.slug,
    cust.full_name,
    cc.base_price,
    cc.total_price,
    cc.commission_amount,
    cc.total_price - cc.commission_amount,
    cc.payment_method,
    cc.charged_at,
    r.rating
  from public.commission_charges cc
  join public.jobs j on j.id = cc.job_id
  join public.categories c on c.id = j.category_id
  join public.profiles cust on cust.id = j.customer_id
  left join public.reviews r on r.job_id = j.id
  where cc.pro_id = (select auth.uid())
    and (p_since is null or cc.charged_at >= p_since)
  order by cc.charged_at desc
  limit 200;
$$;

comment on function public.my_completed_jobs(timestamptz) is
  'The calling pro''s closed jobs with what each one earned and what Handy took. Scoped to auth.uid() inside the function — a pro never sees another pro''s earnings.';

revoke execute on function public.my_completed_jobs(timestamptz) from public, anon;
grant execute on function public.my_completed_jobs(timestamptz) to authenticated;

/*
 * The three cards at the top of design/screens/pro-4.1-earnings-wallet.png.
 *
 * Two of the numbers are about the chosen range (הכנסות השבוע) and two are
 * about the pro's whole history (דירוג מאומת · מתוך N עבודות שהושלמו), which
 * is why both live in one row rather than in one range-filtered aggregate.
 * The acceptance rate is `my_bid_stats()` from Phase 4 and is not repeated
 * here.
 *
 * `rating_avg` is computed from `reviews` rather than read off
 * `pro_profiles.rating_avg`: that column is numeric(2,1) — one decimal, which
 * is all a bid card needs — and this screen prints the score the pro is judged
 * on, so it is worth the extra digit.
 */
create function public.my_earnings_stats(p_since timestamptz default null)
returns table (
  jobs_count int,
  gross numeric,
  commission numeric,
  net numeric,
  lifetime_jobs_count int,
  lifetime_gross numeric,
  lifetime_commission numeric,
  rating_avg numeric,
  rating_count int
)
language sql
stable
security definer
set search_path = ''
as $$
  with mine as (
    select cc.job_id, cc.total_price, cc.commission_amount, cc.charged_at
      from public.commission_charges cc
     where cc.pro_id = (select auth.uid())
  ),
  in_range as (
    select * from mine where p_since is null or charged_at >= p_since
  ),
  rated as (
    select r.rating
      from public.reviews r
      join mine m on m.job_id = r.job_id
  )
  select
    (select count(*)::int from in_range),
    (select coalesce(sum(total_price), 0) from in_range),
    (select coalesce(sum(commission_amount), 0) from in_range),
    (select coalesce(sum(total_price - commission_amount), 0) from in_range),
    (select count(*)::int from mine),
    (select coalesce(sum(total_price), 0) from mine),
    (select coalesce(sum(commission_amount), 0) from mine),
    (select round(avg(rating), 2) from rated),
    (select count(*)::int from rated);
$$;

comment on function public.my_earnings_stats(timestamptz) is
  'The wallet''s header cards: earnings inside the chosen range, and the lifetime rating behind "דירוג מאומת · מתוך N עבודות".';

revoke execute on function public.my_earnings_stats(timestamptz) from public, anon;
grant execute on function public.my_earnings_stats(timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. "שמור לפעם הבאה"
-- ---------------------------------------------------------------------------

/*
 * The dark card on design/screens/customer-4.1-summary-receipt-rating.png, and
 * the "בעלי המקצוע שלי" panel on customer-5.1-my-account.png that has been
 * promising it since Phase 2.
 *
 * `saved_pros` itself is Phase 1's, grants and all — a customer may already
 * insert and delete their own rows. What was missing is a way to render the
 * list: it holds two ids and nothing else, and `profiles` is closed. Definer,
 * returning the same four public facts a bid card shows.
 */
create function public.my_saved_pros()
returns table (
  pro_id uuid,
  full_name text,
  bio text,
  rating_avg numeric,
  jobs_completed_count int,
  verified boolean,
  saved_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    sp.pro_id,
    p.full_name,
    pp.bio,
    pp.rating_avg,
    pp.jobs_completed_count,
    pp.verification_status = 'verified',
    sp.created_at
  from public.saved_pros sp
  join public.pro_profiles pp on pp.user_id = sp.pro_id
  join public.profiles p on p.id = sp.pro_id
  where sp.customer_id = (select auth.uid())
  order by sp.created_at desc
  limit 100;
$$;

comment on function public.my_saved_pros() is
  'The calling customer''s saved pros, with the same public facts a bid card carries — never a phone number, never a document.';

revoke execute on function public.my_saved_pros() from public, anon;
grant execute on function public.my_saved_pros() to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Realtime
--
-- Nothing new is published. The customer's tracking screen learns that the
-- work is finished from the `jobs` subscription it already holds (Phase 4),
-- and re-renders into the summary screen under its own RLS.
-- ---------------------------------------------------------------------------
