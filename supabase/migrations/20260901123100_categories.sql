-- Phase 1 — service categories (Hebrew UI term: תחום).
--
-- The only table in the schema that is readable without signing in: the
-- category+city SEO pages have to render for anonymous visitors.

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name_he text not null,
  slug text not null unique,
  created_at timestamptz not null default now()
);

alter table public.categories enable row level security;

revoke all on public.categories from anon, authenticated;
grant select on public.categories to anon, authenticated;
-- No write grant to any client role. The category list is operator-curated:
-- it ships in seed.sql and, later, through the admin dashboard's elevated
-- access. Nothing a browser holds can add a category.

create policy "categories: readable by everyone"
  on public.categories for select to anon, authenticated
  using (true);
