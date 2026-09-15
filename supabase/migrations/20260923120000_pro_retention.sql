-- ---------------------------------------------------------------------------
-- Phase 16 — שימור בעל מקצוע
--
-- Most of this phase is screens over functions that already exist. What the
-- database needs is small, and it is all about *why*:
--
--   1. Why an admin rejected or suspended a pro. `set_pro_verification()` never
--      stored a reason, so `ProStatusCard` guessed out loud ("לרוב מדובר
--      במסמך לא קריא") — to a pro who may have been suspended for something
--      else entirely.
--   2. Why a pro passed on a call — "לא מתאים לי" and declining an offer. A
--      closed vocabulary, optional, and the only data that will ever let
--      matching become smarter than a radius.
--
-- Neither reason column has a client grant for the side that did not write
-- it: the admin's reason is the admin's, and a decline reason is written by
-- `decline_job()` itself.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. The admin's reason
-- ---------------------------------------------------------------------------

alter table public.pro_profiles
  add column verification_reason text
    check (verification_reason is null or char_length(verification_reason) <= 300);

comment on column public.pro_profiles.verification_reason is
  'What the admin told the pro when rejecting or suspending them. Written only by set_pro_verification(); no client update grant. Cleared on approval.';

drop function public.set_pro_verification(uuid, text);

create function public.set_pro_verification(
  p_pro_id uuid,
  p_status text,
  p_reason text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;

  if p_status not in ('verified', 'rejected', 'suspended', 'pending') then
    raise exception 'unsupported verification status: %', p_status using errcode = '22023';
  end if;

  update public.pro_profiles
     set verification_status = p_status,
         -- A reason belongs to a refusal. Approving, or sending back to the
         -- queue, leaves nothing to explain — and must not leave an old
         -- rejection's words on the screen of a pro who is now verified.
         verification_reason = case
           when p_status in ('rejected', 'suspended')
             then nullif(btrim(coalesce(p_reason, '')), '')
           else null
         end
   where user_id = p_pro_id;

  if not found then
    raise exception 'no such pro' using errcode = 'P0002';
  end if;

  update public.verification_documents
     set status = case when p_status = 'verified' then 'approved' else 'rejected' end,
         reviewed_at = now()
   where pro_id = p_pro_id
     and status = 'pending'
     and p_status in ('verified', 'rejected');

  if p_status in ('verified', 'rejected') then
    perform public.notify_user(
      p_pro_id,
      case when p_status = 'verified' then 'pro_verified' else 'pro_rejected' end,
      null,
      (select auth.uid())
    );
  end if;

  return p_status;
end;
$$;

comment on function public.set_pro_verification(uuid, text, text) is
  'Admin decision on a pro, with the reason the pro will read when it is a refusal. Checks is_admin() itself; no client role holds an UPDATE grant on verification_status or verification_reason.';

revoke execute on function public.set_pro_verification(uuid, text, text) from public, anon;
grant execute on function public.set_pro_verification(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Why a pro passed
-- ---------------------------------------------------------------------------

alter table public.job_dismissals
  add column reason text,
  add constraint job_dismissals_reason_check check (
    reason in ('too_far', 'not_my_trade', 'too_busy', 'price_too_low', 'unclear', 'other')
  );

comment on column public.job_dismissals.reason is
  'Why the pro hid this call — optional, closed vocabulary mirrored in lib/validation/pros.ts. The pro''s own insert.';

-- Not a column on `bids`: the customer reads every column of the bids on their
-- own job, and why a pro passed is the pro's to tell Handy, not a verdict for
-- the customer. So it is a row of its own, read by its author and an admin.
create table public.decline_reasons (
  bid_id uuid primary key references public.bids (id) on delete cascade,
  pro_id uuid not null references public.profiles (id) on delete cascade,
  reason text not null check (
    reason in ('too_far', 'not_my_trade', 'too_busy', 'price_too_low', 'unclear', 'other')
  ),
  created_at timestamptz not null default now()
);

comment on table public.decline_reasons is
  'Why a pro declined an offer they were chosen for. Written only by decline_job(); read by the pro who wrote it and by an admin — never by the customer.';

alter table public.decline_reasons enable row level security;
revoke all on public.decline_reasons from anon, authenticated;
grant select on public.decline_reasons to authenticated;

create policy "decline_reasons: pro reads own"
  on public.decline_reasons for select to authenticated
  using (pro_id = (select auth.uid()));

create policy "decline_reasons: admin reads all"
  on public.decline_reasons for select to authenticated
  using (public.is_admin());

drop function public.decline_job(uuid);

create function public.decline_job(p_bid_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bid public.bids;
  v_customer uuid;
begin
  select * into v_bid from public.bids b where b.id = p_bid_id;
  if v_bid is null then
    raise exception 'no such bid' using errcode = 'P0002';
  end if;

  if v_bid.pro_id <> (select auth.uid()) then
    raise exception 'only the pro this job was offered to may decline it'
      using errcode = '42501';
  end if;

  if v_bid.status <> 'selected' then
    raise exception 'this job has not been offered to you' using errcode = '22023';
  end if;

  if p_reason is not null
     and p_reason not in ('too_far', 'not_my_trade', 'too_busy', 'price_too_low', 'unclear', 'other') then
    raise exception 'unknown decline reason' using errcode = '22023';
  end if;

  update public.bids
     set status = 'declined', accept_deadline = null
   where id = p_bid_id;

  if p_reason is not null then
    insert into public.decline_reasons (bid_id, pro_id, reason)
    values (p_bid_id, v_bid.pro_id, p_reason)
    on conflict (bid_id) do nothing;
  end if;

  update public.jobs
     set status = 'bidding'
   where id = v_bid.job_id
     and status = 'awaiting_pro';

  select customer_id into v_customer from public.jobs where id = v_bid.job_id;

  -- The reason is not in the notification: it is the pro's to give Handy, not
  -- a verdict to hand the customer.
  perform public.notify_user(
    v_customer, 'pro_declined', v_bid.job_id, v_bid.pro_id
  );
end;
$$;

comment on function public.decline_job(uuid, text) is
  'The pro passes on an offer they were chosen for, optionally saying why. No charge; the job returns to bidding with every rival offer untouched.';

revoke execute on function public.decline_job(uuid, text) from public, anon;
grant execute on function public.decline_job(uuid, text) to authenticated;
