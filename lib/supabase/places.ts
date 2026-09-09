import { createClient } from "./server";
import type { SavedPlace } from "@/lib/validation/places";

/**
 * Read side of כתובות שמורות.
 *
 * A plain select, and deliberately not a `security definer` function: choosing
 * which rows a caller may see is what a policy does, and `saved_places` has one
 * that says "your own". CLAUDE.md section 3 draws the line at aggregates — a
 * count across everybody's rows cannot be expressed as a policy, and this can.
 *
 * `lat`/`lng` are the generated columns from
 * 20260913120000_saved_places_coordinates.sql, NOT `location`. That distinction
 * is the whole reason this file was ever wrong: a PostGIS geography reaches
 * PostgREST as a hex EWKB string, this read it as GeoJSON, and every row was
 * silently discarded — the list was empty from the day it shipped. `jobs` had
 * solved the same problem in Phase 2 and the answer was there to copy.
 */
export type { SavedPlace };

export async function mySavedPlaces(): Promise<SavedPlace[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("saved_places")
    .select("id, label, address_text, lat, lng")
    .order("created_at", { ascending: true });

  if (error || !data) return [];

  return data.flatMap((row) =>
    // `lat`/`lng` are nullable in the generated types because a generated
    // column is, in principle, computable to null. It cannot be here —
    // `location` is `not null` — but a row without a point would fill a form
    // with nothing, so it is dropped rather than rendered as a dead chip.
    row.lat === null || row.lng === null
      ? []
      : [
          {
            id: row.id,
            label: row.label,
            addressText: row.address_text,
            lat: row.lat,
            lng: row.lng,
          },
        ],
  );
}
