import { z } from "zod";
import { ISRAEL_BOUNDS } from "@/lib/maps/geometry";

/**
 * כתובות שמורות — the customer's own list of addresses to post calls from.
 *
 * Every bound here is also a check constraint on `saved_places`. The schema is
 * what produces a Hebrew sentence under the right field; the constraint is what
 * makes it true whatever reaches the database.
 */

/**
 * One saved address, as every screen sees it. Declared here rather than beside
 * the reader because components/ui/AddressField.tsx needs it too and must not
 * import a module that opens a Supabase server client.
 */
export type SavedPlace = {
  id: string;
  label: string;
  addressText: string;
  lat: number;
  lng: number;
};

export const PLACE_LABEL_MAX = 20;

/** The two the design offers as one tap, and the third that is a text field. */
export const PLACE_LABEL_SUGGESTIONS = ["בית", "עבודה"] as const;

const coordinate = (min: number, max: number, name: string) =>
  z.coerce
    .number()
    .refine((value) => value >= min && value <= max, {
      error: `${name} מחוץ לתחום`,
    })
    .nullish();

export const savePlaceSchema = z.object({
  label: z
    .string()
    .trim()
    .min(1, { error: "יש לתת לכתובת שם, למשל: בית" })
    .max(PLACE_LABEL_MAX, { error: "השם ארוך מדי" }),

  addressText: z
    .string()
    .trim()
    .min(5, { error: "יש להזין כתובת מלאה — רחוב, מספר ועיר" })
    .max(200, { error: "הכתובת ארוכה מדי" }),

  // Advisory, exactly as on the job form: a point from a GPS fix or from
  // Places Autocomplete, re-checked in geocodeAddress before it is stored.
  lat: coordinate(ISRAEL_BOUNDS.minLat, ISRAEL_BOUNDS.maxLat, "קו הרוחב"),
  lng: coordinate(ISRAEL_BOUNDS.minLng, ISRAEL_BOUNDS.maxLng, "קו האורך"),
});

export type SavePlaceInput = z.infer<typeof savePlaceSchema>;

export const renamePlaceSchema = z.object({
  placeId: z.uuid({ error: "כתובת לא מזוהה" }),
  label: savePlaceSchema.shape.label,
});

export const removePlaceSchema = z.object({
  placeId: z.uuid({ error: "כתובת לא מזוהה" }),
});
