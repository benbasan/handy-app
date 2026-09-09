-- Phase 11 — read a saved address's coordinates back without decoding EWKB.
--
-- The same fix `20260902121000_job_coordinates.sql` applied to `jobs`, and it
-- should have been applied here in the same migration that created the table.
-- It was not, and the consequence was not a rough edge: `saved_places.location`
-- is a PostGIS geography, PostgREST hands it over as a hex EWKB string
-- ('0101000020E6100000…'), and `mySavedPlaces()` read it expecting GeoJSON,
-- found no `coordinates`, and dropped every row it was given. The list was
-- empty from the day it shipped — an address saved correctly, stored
-- correctly, protected correctly by RLS, and never shown to anybody.
--
-- Generated and stored, exactly as on `jobs`: both functions are immutable,
-- the pair costs 16 bytes a row, and `location` stays the single source of
-- truth. A generated column cannot be written by anybody, which also answers
-- the grant question before it is asked.

alter table public.saved_places
  add column lat double precision
    generated always as (extensions.st_y(location::extensions.geometry)) stored,
  add column lng double precision
    generated always as (extensions.st_x(location::extensions.geometry)) stored;

comment on column public.saved_places.lat is
  'Derived from location. Read-only by construction — write the geography, never these.';
