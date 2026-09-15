-- ---------------------------------------------------------------------------
-- The pro feed got 2.75× slower in Phase 13.8, and nothing noticed until the
-- load check was run.
--
--   npm run perf:postgis, 10,000 open calls:
--     before 13.8   open_jobs_for_pro()  212 ms
--     after  13.8   open_jobs_for_pro()  585 ms   (budget 409 ms)
--
-- The cause is the policy, not the feed query. `jobs: verified pro reads open
-- jobs in radius` became `pro_reaches_job(location, requested_pro_id,
-- opened_to_all_at)`, and a `security definer` SQL function is never inlined —
-- so every open call in the table paid for two opaque function calls
-- (`pro_reaches_job()`, then `pro_serves_job()` inside it) where it had paid
-- for one. TECHNICAL_DEBT.md #26 already explains why this policy is a linear
-- scan; this made each step of the scan dearer.
--
-- The rule does not change. The two branches that need no function at all —
-- "is this call directed" and "is it directed at me" — are written into the
-- policy as plain expressions, so `pro_serves_job()` runs once per undirected
-- row, exactly as before 13.8, and `is_verified_pro()` runs only on the rare
-- row directed at the caller. `pro_reaches_job()` stays as the one statement
-- of the rule for every other caller (`can_bid_on_job()`, `can_read_job_media()`,
-- `record_job_view()`), which each ask about one job, and a pgTAP assertion
-- holds the policy and the function to the same answer.
-- ---------------------------------------------------------------------------

drop policy "jobs: verified pro reads open jobs in radius" on public.jobs;

create policy "jobs: verified pro reads open jobs in radius"
  on public.jobs for select to authenticated
  using (
    status in ('open', 'bidding', 'awaiting_pro')
    and (
      -- Undirected, or directed and opened: the pro's own radius.
      (
        (requested_pro_id is null or opened_to_all_at is not null)
        and public.pro_serves_job(location)
      )
      -- Directed at the caller: wherever they are, while verified.
      or (
        requested_pro_id = (select auth.uid())
        and public.is_verified_pro()
      )
    )
  );

comment on policy "jobs: verified pro reads open jobs in radius" on public.jobs is
  'pro_reaches_job(), written out so the cheap branches cost no function call per row. Held to the same answer as the function by a pgTAP assertion.';
