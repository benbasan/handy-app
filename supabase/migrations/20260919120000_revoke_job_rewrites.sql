-- ---------------------------------------------------------------------------
-- A posted call is not the customer's to rewrite.
--
-- Phase 1 granted the customer UPDATE on `description`, `photo_urls`,
-- `video_url`, `voice_note_url`, `location`, `address_text` and
-- `preferred_time`, under a policy that let them update their own row. Phase 4
-- took `status` and `selected_bid_id` back out; the rest stayed, unused by the
-- app and reachable by anyone holding a customer's session and PostgREST.
--
-- Phase 13.7 found why that matters (docs/roadmap.md, Phase 13.7, item 2):
--
--   * A pro prices what is written. A description rewritten after an offer is
--     an offer that now means something its author never agreed to — which
--     is exactly what `add_job_details()` was built to prevent, by appending
--     and never replacing.
--   * `location` decides who a call reaches (`pro_reaches_job()`). Moving it
--     after posting moves the call out from under pros already told about it,
--     past the fan-out that only runs on insert.
--   * `preferred_time` decides whether an offer needs an arrival window
--     (`bids_check_arrival_window`). Changing it afterwards changes the rule
--     for offers already made under the old one.
--
-- So every UPDATE grant on `jobs` goes, and the policy that only existed to
-- scope it goes with it. What a customer may legitimately change about a call
-- after posting is a security definer function that knows the call's state:
-- `add_job_details()` today, and whatever cancelling becomes in Phase 15.
-- ---------------------------------------------------------------------------

revoke update on public.jobs from authenticated;

drop policy "jobs: customer updates own" on public.jobs;
