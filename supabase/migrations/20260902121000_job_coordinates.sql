-- Phase 2 — read the job's coordinates back without decoding EWKB in JS.
--
-- `jobs.location` is a PostGIS geography, and PostgREST hands it to the client
-- as a hex EWKB string. Everything that wants to draw the job on a map, or
-- simply show a customer that their address really did resolve, would
-- otherwise have to parse that by hand.
--
-- Generated and stored rather than a view: both functions are immutable, the
-- pair costs 16 bytes a row, and it keeps `location` the single source of
-- truth — there is no way for the coordinates to disagree with the geography
-- they are derived from.

alter table public.jobs
  add column latitude double precision
    generated always as (extensions.st_y(location::extensions.geometry)) stored,
  add column longitude double precision
    generated always as (extensions.st_x(location::extensions.geometry)) stored;

comment on column public.jobs.latitude is
  'Derived from location. Read-only by construction — write the geography, never these.';
