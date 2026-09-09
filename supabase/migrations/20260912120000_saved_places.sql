-- Phase 11 — כתובות שמורות.
--
-- A customer's own list of addresses they post calls from: "בית", "עבודה",
-- "הדירה של אמא". One tap on the job form instead of retyping a street, and —
-- because a saved place carries the point it was saved with — no parsing of a
-- string that was already resolved once.
--
-- Three decisions worth writing down, because each is the kind that is easy to
-- get wrong quietly:
--
--  1. **`customer_id` has no grant and takes `auth.uid()` as its default.**
--     The `with check` on the INSERT policy would refuse a row filed into
--     somebody else's list anyway; not granting the column means the attempt
--     never gets that far, and there is no path by which a client asserts whose
--     list a row belongs to. Same reasoning as the four INSERT grants Phase 9
--     narrowed.
--
--  2. **`location` IS granted, and that is deliberate.** A point saved from a
--     GPS fix is the whole value of the feature; dropping it would send every
--     saved address back through text matching, which is exactly what this
--     phase is trying to stop. The point is a HINT, in the same standing as the
--     lat/lng the browser already sends with every job form, and
--     `coordinatesInIsrael()` re-checks it on the way out again. A forged point
--     in a customer's own private list gains them nothing they cannot already
--     do by typing a different address.
--
--  3. **No `security definer` function.** Reading and writing one's own rows is
--     row selection, which is what a policy is for — CLAUDE.md section 3's
--     "an admin's aggregate is a function; an admin's record is RLS", read from
--     the other end. There is no aggregate here and nothing to hide.

create table public.saved_places (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null default auth.uid()
    references public.profiles (id) on delete cascade,
  label text not null,
  address_text text not null,
  location extensions.geography(Point, 4326) not null,
  created_at timestamptz not null default now(),

  constraint saved_places_label_length check (char_length(btrim(label)) between 1 and 20),
  constraint saved_places_address_length check (char_length(btrim(address_text)) between 5 and 200)
);

-- One row per address per customer: saving "בית" twice is a slip, not an
-- intention, and the form should say so rather than grow a second identical
-- chip.
create unique index saved_places_customer_address_idx
  on public.saved_places (customer_id, address_text);

create index saved_places_customer_idx
  on public.saved_places (customer_id, created_at desc);

alter table public.saved_places enable row level security;

revoke all on public.saved_places from anon, authenticated;
grant select on public.saved_places to authenticated;
grant insert (label, address_text, location) on public.saved_places to authenticated;
grant update (label, address_text, location) on public.saved_places to authenticated;
grant delete on public.saved_places to authenticated;

create policy "saved_places: customer reads own"
  on public.saved_places for select to authenticated
  using (customer_id = (select auth.uid()));

create policy "saved_places: customer saves own"
  on public.saved_places for insert to authenticated
  with check (customer_id = (select auth.uid()));

create policy "saved_places: customer renames own"
  on public.saved_places for update to authenticated
  using (customer_id = (select auth.uid()))
  with check (customer_id = (select auth.uid()));

create policy "saved_places: customer removes own"
  on public.saved_places for delete to authenticated
  using (customer_id = (select auth.uid()));

comment on table public.saved_places is
  'A customer''s own addresses, for the job form. Private to them: there is no policy by which a pro or another customer reads one, and none by which anybody writes into somebody else''s list.';

comment on column public.saved_places.location is
  'The point this address resolved to when it was saved — a GPS fix, or the town the gazetteer matched. A hint, re-checked against the country box every time it is used, exactly like the lat/lng a browser sends with a job.';
