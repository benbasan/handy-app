-- Phase 9 — closing what the security checklist found.
--
-- The checklist in the roadmap is "RLS on every table, no secrets in code,
-- rate limiting on OTP". Walking it produced one class of finding, four times
-- over: a table whose INSERT grant was never narrowed the way its UPDATE grant
-- was.
--
-- Every one of these tables is already guarded on the update side — Phase 4
-- took `status` and `selected_bid_id` off `jobs`, Phase 5 took `status` off
-- `price_updates`, Phase 6 took the customer's grants off `reviews`, Phase 7
-- narrowed `disputes` to three columns. The insert side kept the table-wide
-- `grant insert` each table was created with, and a column a client may not
-- *change* is a column a client may not *assert* either: a row inserted with
-- the value already set never needs an update.
--
-- CLAUDE.md section 3 states each of these rules in prose. This migration is
-- what makes four of them true.
--
--  1. jobs — `status` and `selected_bid_id` were insertable.
--     "Choosing a bid is select_bid(), and no client may write
--     jobs.selected_bid_id." A customer posting straight at PostgREST could
--     create a job already `completed` whose `selected_bid_id` pointed at any
--     bid they can read — every bid on their own real jobs. `is_assigned_pro`
--     and `job_effective_price()` both read the job through that column, so
--     the fabricated job would name a pro who had never heard of it, and
--     `submit_job_review()` (completed jobs only, owned by the caller) would
--     then accept a rating against them. `reviews_refresh_pro_rating` puts
--     that straight into `pro_profiles.rating_avg`, which is on the pro's
--     public profile. One INSERT, and a stranger's public reputation.
--
--  2. verification_documents — `status` and `reviewed_at` were insertable.
--     A pro could file their own identity document already `approved`.
--     `pro_public_profile()` renders "תעודה מאומתת" / "ביטוח" straight from
--     `status = 'approved'`, so this forged a trust badge on the page whose
--     whole job is to be trusted, and inflated it past the admin's pending
--     queue on the way.
--
--  3. messages — `created_at` and `read_at` were insertable. A thread is
--     evidence: /admin/jobs/[jobId] is what a dispute is judged against
--     (product-spec.md 5.4), and a party who can choose a message's timestamp
--     can reorder that record. `read_at` is the same rule this table already
--     enforces on update — only the side that did *not* send may set it.
--
--  4. support_tickets — `status` was insertable, by `anon` as well. "A
--     ticket's status is the support team's answer to it": a ticket that
--     arrives already `closed` is a ticket nobody reads.
--
-- No policy changes and no new tables: every one of these is a grant, because
-- RLS picks rows and cannot pick columns. Nothing else in the checklist moved
-- — see docs/security-checklist.md for the full walk, including the items
-- that came back clean.

-- ---------------------------------------------------------------------------
-- 1. jobs
--
-- What a customer legitimately asserts when they post: who they are, what is
-- broken, where, and how far to broadcast it. `status` takes its 'open'
-- default (the same reason `bids` leaves `expires_at` to a default rather than
-- taking it from the form), `selected_bid_id` stays null until select_bid()
-- writes it, and `id` / `created_at` are the database's to say.
--
-- `latitude` and `longitude` are STORED GENERATED off `location` and could
-- never have been written anyway; they are simply absent here.
-- ---------------------------------------------------------------------------

revoke insert on public.jobs from authenticated;

grant insert (
  customer_id, category_id, description,
  photo_urls, video_url, voice_note_url,
  location, address_text, preferred_time, search_radius_km
) on public.jobs to authenticated;

-- ---------------------------------------------------------------------------
-- 2. verification_documents
--
-- The pro says which document this is and where the file sits. Whether it is
-- any good is the admin's answer, written by set_pro_verification() and by the
-- review path in Phase 3 — never by the person being verified. Exactly the
-- reasoning that has kept `pro_profiles.verification_status` ungranted since
-- Phase 1.
-- ---------------------------------------------------------------------------

revoke insert on public.verification_documents from authenticated;

grant insert (pro_id, doc_type, file_url)
  on public.verification_documents to authenticated;

-- ---------------------------------------------------------------------------
-- 3. messages
--
-- Who is talking to whom, and what they said. When it was said, and whether
-- the other side has read it, are not the sender's to state.
-- ---------------------------------------------------------------------------

revoke insert on public.messages from authenticated;

grant insert (job_id, pro_id, sender_id, body)
  on public.messages to authenticated;

-- ---------------------------------------------------------------------------
-- 4. support_tickets
--
-- Still the one table an anonymous visitor may write to, and still no UPDATE
-- grant for anybody. `created_by` stays in the grant because the INSERT policy
-- pins it to whoever the caller actually is — auth.uid(), or null for anon.
-- ---------------------------------------------------------------------------

revoke insert on public.support_tickets from anon, authenticated;

grant insert (created_by, full_name, phone, topic, job_reference, body)
  on public.support_tickets to anon;
grant insert (created_by, full_name, phone, topic, job_reference, body)
  on public.support_tickets to authenticated;
