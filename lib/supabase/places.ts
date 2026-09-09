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
 * The point comes back as GeoJSON rather than as WKB, because the only thing
 * the browser does with it is hand it back as the `lat`/`lng` hint on a form.
 */
export type { SavedPlace };

type GeoJsonPoint = { type: "Point"; coordinates: [number, number] };

export async function mySavedPlaces(): Promise<SavedPlace[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("saved_places")
    .select("id, label, address_text, location")
    .order("created_at", { ascending: true });

  if (error || !data) return [];

  return data.flatMap((row) => {
    // `location` arrives as GeoJSON through PostgREST. A row whose point did
    // not survive the trip is dropped rather than rendered as a chip that
    // silently fills in nothing.
    const point = row.location as unknown as GeoJsonPoint | null;
    const [lng, lat] = point?.coordinates ?? [];
    if (typeof lat !== "number" || typeof lng !== "number") return [];

    return [
      {
        id: row.id,
        label: row.label,
        addressText: row.address_text,
        lat,
        lng,
      },
    ];
  });
}
