-- Phase 0: enable PostGIS only. No tables here — the full schema is Phase 1.
--
-- PostGIS backs the radius queries the product depends on: matching a job to
-- pros whose service area covers it (ST_DWithin over a GiST index), rather
-- than scanning every pro and computing distance in JS.
-- See docs/architecture.md section 3.

create extension if not exists postgis with schema extensions;
