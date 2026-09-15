-- ---------------------------------------------------------------------------
-- Phase 17 — צמיחה ורכישה
--
-- Three database pieces, each small, each read by a stranger or shared with
-- one — so each names exactly what it hands over:
--
--   1. `open_calls_by_city()` — "there are 7 open calls in Petah Tikva right
--      now" on the pro landing page. Counts, never a call.
--   2. Receipt share links — decided with the user on 15.9.2026: a link the
--      customer creates, that expires after seven days and can be revoked, and
--      that shows the customer's version of the receipt (no fee). The token is
--      stored hashed: a leaked table must not be a set of working links.
--   3. Answering the contact form — `support_tickets` has been written since
--      Phase 8 and read by nobody (CLAUDE.md section 9). An admin screen reads
--      it under the existing policy; this adds the one transition it needs.
-- ---------------------------------------------------------------------------

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- 1. Real demand, for the page that recruits pros
-- ---------------------------------------------------------------------------

create function public.open_calls_by_city()
returns table (city text, open_calls int)
language sql
stable
security definer
set search_path = ''
as $$
  select public.job_city(j.address_text), count(*)::int
    from public.jobs j
   where j.status in ('open', 'bidding', 'awaiting_pro')
     and j.created_at > now() - interval '14 days'
     and public.job_city(j.address_text) is not null
   group by 1
   order by 2 desc, 1
   limit 8;
$$;

comment on function public.open_calls_by_city() is
  'Open calls from the last fourteen days, counted per city, for the public pro landing page. A count and a city name — never a call, an address or a customer.';

revoke execute on function public.open_calls_by_city() from public;
grant execute on function public.open_calls_by_city() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. A receipt somebody can send
-- ---------------------------------------------------------------------------

create table public.receipt_share_links (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs (id) on delete cascade,
  created_by uuid not null references public.profiles (id) on delete cascade,
  /** sha256 of the token. The token itself exists only in the link. */
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  revoked_at timestamptz
);

comment on table public.receipt_share_links is
  'Links a customer created to send a finished job''s receipt to somebody without an account. Expire after seven days; revocable. Only the hash of the token is stored.';

create index receipt_share_links_job_idx on public.receipt_share_links (job_id);

alter table public.receipt_share_links enable row level security;
revoke all on public.receipt_share_links from anon, authenticated;
grant select (id, job_id, created_at, expires_at, revoked_at)
  on public.receipt_share_links to authenticated;

create policy "receipt_share_links: creator reads own"
  on public.receipt_share_links for select to authenticated
  using (created_by = (select auth.uid()));

create function public.create_receipt_share_link(p_job_id uuid)
returns table (token text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text;
  v_expires timestamptz;
begin
  if not public.is_job_owner(p_job_id) then
    raise exception 'only the customer who posted this job may share its receipt'
      using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.job_fees f
     where f.job_id = p_job_id and f.completed_at is not null
  ) then
    raise exception 'this job has no receipt yet' using errcode = '22023';
  end if;

  -- Two random UUIDs: 244 bits the link carries and the table never does.
  v_token := replace(gen_random_uuid()::text, '-', '')
          || replace(gen_random_uuid()::text, '-', '');

  insert into public.receipt_share_links (job_id, created_by, token_hash)
  values (
    p_job_id,
    (select auth.uid()),
    encode(extensions.digest(v_token, 'sha256'), 'hex')
  )
  returning receipt_share_links.expires_at into v_expires;

  return query select v_token, v_expires;
end;
$$;

comment on function public.create_receipt_share_link(uuid) is
  'The customer of a finished job creates a seven-day link to its receipt. Returns the token once; only its hash is kept.';

revoke execute on function public.create_receipt_share_link(uuid) from public, anon;
grant execute on function public.create_receipt_share_link(uuid) to authenticated;

create function public.revoke_receipt_share_links(p_job_id uuid)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count int;
begin
  if not public.is_job_owner(p_job_id) then
    raise exception 'not your job' using errcode = '42501';
  end if;

  update public.receipt_share_links
     set revoked_at = now()
   where job_id = p_job_id and revoked_at is null and expires_at > now();
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

comment on function public.revoke_receipt_share_links(uuid) is
  'The customer switches off every live share link to a job''s receipt.';

revoke execute on function public.revoke_receipt_share_links(uuid) from public, anon;
grant execute on function public.revoke_receipt_share_links(uuid) to authenticated;

-- What a link opens: the customer's receipt — fee and net as NULL, exactly as
-- job_receipt() returns them to the customer — and the approved price updates
-- the document's lines are drawn from. Nothing about the pro but a name.
create function public.shared_receipt(p_token text)
returns table (
  job_id uuid,
  description text,
  address_text text,
  category_name_he text,
  customer_name text,
  pro_name text,
  payment_method text,
  base_price numeric,
  total_price numeric,
  charged_at timestamptz,
  completed_at timestamptz,
  approved_updates jsonb
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
    cust.full_name,
    pro.full_name,
    f.payment_method,
    f.base_price,
    f.total_price,
    f.charged_at,
    f.completed_at,
    coalesce((
      select jsonb_agg(jsonb_build_object(
               'original_price', pu.original_price,
               'new_price', pu.new_price))
        from public.price_updates pu
       where pu.job_id = j.id and pu.status = 'approved'
    ), '[]'::jsonb)
  from public.receipt_share_links l
  join public.jobs j on j.id = l.job_id
  join public.job_fees f on f.job_id = j.id and f.completed_at is not null
  join public.categories c on c.id = j.category_id
  join public.profiles cust on cust.id = j.customer_id
  join public.profiles pro on pro.id = f.pro_id
  where l.token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex')
    and l.revoked_at is null
    and l.expires_at > now();
$$;

comment on function public.shared_receipt(text) is
  'The customer''s version of a receipt, for whoever holds a live share link. No row for an unknown, expired or revoked token.';

revoke execute on function public.shared_receipt(text) from public;
grant execute on function public.shared_receipt(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Answering the contact form
-- ---------------------------------------------------------------------------

alter table public.support_tickets add column handled_at timestamptz;

create function public.set_support_ticket_status(p_ticket_id uuid, p_status text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;

  if p_status not in ('open', 'answered', 'closed') then
    raise exception 'unsupported ticket status' using errcode = '22023';
  end if;

  update public.support_tickets
     set status = p_status,
         handled_at = case when p_status = 'open' then null else now() end
   where id = p_ticket_id;

  if not found then
    raise exception 'no such ticket' using errcode = 'P0002';
  end if;

  return p_status;
end;
$$;

comment on function public.set_support_ticket_status(uuid, text) is
  'An admin marks a contact-form ticket answered, closed, or open again. No client role holds an UPDATE grant on support_tickets.';

revoke execute on function public.set_support_ticket_status(uuid, text) from public, anon;
grant execute on function public.set_support_ticket_status(uuid, text) to authenticated;
