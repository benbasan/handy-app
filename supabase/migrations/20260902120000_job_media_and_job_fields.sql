-- Phase 2 — posting a job: media storage, the customer's search radius, and a
-- canonical vocabulary for "when suits you".
--
-- Three things happen here:
--
--  1. `jobs.search_radius_km` — product-spec.md 3.2 has the customer pick a
--     search radius on the address step, and business rule 7 puts its default
--     at 3–5 km. Phase 1's draft schema had nowhere to put it. It is the
--     customer's stated preference; the pro feed's own gate stays
--     `pro_serves_point` (the pro's radius), and Phase 3 decides how the two
--     combine. Recorded in docs/architecture.md.
--
--  2. `jobs.preferred_time` gets a check constraint. It was free text, which
--     means the UI cannot render it in Hebrew without echoing whatever string
--     happened to be stored. The form offers fixed choices, so the column
--     stores canonical English slugs and the labels live in the app.
--
--  3. The `job-media` bucket and its policies — photos, a short video and a
--     voice note attached to a job (product-spec.md 3.2).

-- ---------------------------------------------------------------------------
-- jobs: search radius + preferred_time vocabulary
-- ---------------------------------------------------------------------------

alter table public.jobs
  add column search_radius_km int not null default 5
    check (search_radius_km between 1 and 50);

comment on column public.jobs.search_radius_km is
  'How far from the address the customer wants the job broadcast. Their preference; the pro feed still gates on the pro''s own radius (pro_serves_point).';

-- Existing rows are seed data and are rewritten by seed.sql in the same reset,
-- so there is nothing to migrate before the constraint bites.
update public.jobs
   set preferred_time = case preferred_time
     when 'היום אחר הצהריים' then 'today'
     when 'מחר בבוקר' then 'tomorrow'
     else null
   end
 where preferred_time is not null;

alter table public.jobs
  add constraint jobs_preferred_time_check
  check (preferred_time in ('asap', 'today', 'tomorrow', 'this_week', 'flexible'));

comment on column public.jobs.preferred_time is
  'asap | today | tomorrow | this_week | flexible. Hebrew labels live in lib/validation/jobs.ts — the database stores the slug.';

comment on column public.jobs.photo_urls is
  'Object paths inside the private job-media bucket (not public URLs). Rendered through short-lived signed URLs.';

-- ---------------------------------------------------------------------------
-- The job-media bucket
--
-- Private. Every read goes through a signed URL minted server-side, which is
-- itself gated by the policies below — so "only the owner and the pros who may
-- see the job" is enforced by the database, not by the obscurity of a path.
--
-- Layout: <customer_id>/<upload_group>/<filename>. The first segment is the
-- uploader's user id, which is what the insert policy pins. `upload_group` is
-- a uuid the form mints before the job row exists, because the files are
-- uploaded while the job is still being filled in.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'job-media',
  'job-media',
  false,
  52428800, -- 50 MiB, matching the stack-wide cap in supabase/config.toml
  array[
    'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
    'video/mp4', 'video/quicktime', 'video/webm',
    'audio/webm', 'audio/mpeg', 'audio/mp4', 'audio/ogg', 'audio/wav'
  ]
)
on conflict (id) do nothing;

/*
 * Who, besides the uploader, may read one of these files.
 *
 * security definer for the same reason every Phase 1 helper is: this runs
 * inside a policy on storage.objects, and reading public.jobs from there would
 * otherwise re-enter jobs' own policies.
 *
 * The visibility rules deliberately mirror the SELECT policies on `jobs`
 * one-for-one — a pro who can see the job in their feed can see its photos,
 * and nobody else can. If those policies change, this changes with them.
 */
create function public.can_read_job_media(p_object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.jobs j
    where (
        p_object_name = any (j.photo_urls)
        or p_object_name = j.video_url
        or p_object_name = j.voice_note_url
      )
      and (
        j.customer_id = (select auth.uid())
        or public.is_admin()
        or (j.status in ('open', 'bidding') and public.pro_serves_point(j.location))
        or public.is_bidding_pro(j.id)
        or public.is_assigned_pro(j.id)
      )
  );
$$;

comment on function public.can_read_job_media(text) is
  'Storage-side twin of the SELECT policies on jobs: may the caller read this job-media object because of a job that references it?';

-- storage.objects already has RLS enabled and wide grants to anon/authenticated
-- (that is how Supabase ships it); the policies are the whole gate.

create policy "job-media: owner reads own folder"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'job-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "job-media: readable through a visible job"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'job-media'
    and public.can_read_job_media(name)
  );

-- Uploads land in the caller's own folder, and only customers upload here:
-- verification documents (pros) get their own bucket in Phase 3.
create policy "job-media: customer uploads to own folder"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'job-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and public.auth_role() = 'customer'
  );

-- Removing a file you attached and then thought better of, before publishing.
create policy "job-media: owner removes own folder"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'job-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- No UPDATE policy: a file is replaced by uploading a new one, never mutated
-- in place. An editable attachment is worthless as evidence in a dispute, the
-- same reasoning that keeps `messages` insert-only.
