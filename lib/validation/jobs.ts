import { z } from "zod";
import { ISRAEL_BOUNDS } from "@/lib/maps/geocode";

/**
 * Posting a job (קריאה) — product-spec.md 3.2.
 *
 * Everything the multi-step form collects is re-validated here on the server,
 * even where the browser already refused it (CLAUDE.md section 3). The two
 * rules worth calling out:
 *
 *  * Media is uploaded straight from the browser to Supabase Storage, so the
 *    form submits *paths*, not files. `jobMediaPathSchema` pins every path to
 *    the signed-in user's own folder — the same thing the bucket's insert
 *    policy enforces, restated here so a job row can never come to reference
 *    somebody else's file.
 *  * Coordinates that arrive from Places Autocomplete are advisory. They are
 *    range-checked here and re-checked in `geocodeAddress`; a job's location is
 *    never simply whatever the browser said.
 */

export const PREFERRED_TIMES = [
  "asap",
  "today",
  "tomorrow",
  "this_week",
  "flexible",
] as const;

export type PreferredTime = (typeof PREFERRED_TIMES)[number];

/** Must match the check constraint on jobs.preferred_time. */
export const PREFERRED_TIME_LABEL: Record<PreferredTime, string> = {
  asap: "דחוף — עוד שעה",
  today: "היום",
  tomorrow: "מחר",
  this_week: "השבוע",
  flexible: "גמיש — מתי שנוח",
};

/** Business rule 7: the customer's default broadcast radius is 3–5 km. */
export const SEARCH_RADIUS_OPTIONS = [3, 5, 10] as const;
export const DEFAULT_SEARCH_RADIUS_KM = 5;

export const DESCRIPTION_MIN = 15;
export const DESCRIPTION_MAX = 2000;
export const MAX_PHOTOS = 5;

/** product-spec.md 3.2: photo, short video (≤30s), voice note. */
export const PHOTO_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
] as const;
export const VIDEO_MIME_TYPES = [
  "video/mp4",
  "video/quicktime",
  "video/webm",
] as const;
export const AUDIO_MIME_TYPES = [
  "audio/webm",
  "audio/mpeg",
  "audio/mp4",
  "audio/ogg",
  "audio/wav",
] as const;

export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
export const MAX_AUDIO_BYTES = 10 * 1024 * 1024;
export const MAX_VIDEO_SECONDS = 30;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FILENAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;

/**
 * `<user id>/<upload group>/<filename>` inside the job-media bucket. The
 * upload group is minted by the form before the job row exists, because the
 * files are uploaded while the job is still being filled in.
 */
export function jobMediaPathSchema(userId: string) {
  return z
    .string()
    .trim()
    .max(300)
    .refine(
      (value) => {
        const parts = value.split("/");
        return (
          parts.length === 3 &&
          parts[0] === userId &&
          UUID.test(parts[1]) &&
          FILENAME.test(parts[2])
        );
      },
      { error: "קובץ המדיה אינו שייך למשתמש הזה" },
    );
}

const latitude = z.coerce
  .number()
  .min(ISRAEL_BOUNDS.minLat)
  .max(ISRAEL_BOUNDS.maxLat);

const longitude = z.coerce
  .number()
  .min(ISRAEL_BOUNDS.minLng)
  .max(ISRAEL_BOUNDS.maxLng);

/**
 * Bound to a user id, because the media rules depend on who is posting. Built
 * per request rather than once at module scope for exactly that reason.
 */
export function createJobSchema(userId: string) {
  const mediaPath = jobMediaPathSchema(userId);

  return z.object({
    categoryId: z.uuid({ error: "יש לבחור תחום" }),

    description: z
      .string()
      .trim()
      .min(DESCRIPTION_MIN, {
        error: `תארו את התקלה במעט יותר פירוט (לפחות ${DESCRIPTION_MIN} תווים)`,
      })
      .max(DESCRIPTION_MAX, { error: "התיאור ארוך מדי" }),

    preferredTime: z.enum(PREFERRED_TIMES, { error: "יש לבחור מועד" }),

    addressText: z
      .string()
      .trim()
      .min(5, { error: "יש להזין כתובת מלאה — רחוב, מספר ועיר" })
      .max(200, { error: "הכתובת ארוכה מדי" }),

    searchRadiusKm: z.coerce
      .number()
      .int()
      .refine(
        (value) => (SEARCH_RADIUS_OPTIONS as readonly number[]).includes(value),
        { error: "רדיוס חיפוש לא חוקי" },
      ),

    // Optional as a pair: a lone latitude is meaningless, and both are
    // dropped rather than half-trusted.
    lat: latitude.nullish(),
    lng: longitude.nullish(),

    photoPaths: z.array(mediaPath).max(MAX_PHOTOS, {
      error: `אפשר לצרף עד ${MAX_PHOTOS} תמונות`,
    }),
    videoPath: mediaPath.nullish(),
    voiceNotePath: mediaPath.nullish(),
  });
}

export type CreateJobInput = z.infer<ReturnType<typeof createJobSchema>>;

/**
 * The `H-24817` style reference the design puts on every job card. Derived
 * from the uuid rather than stored: it is a display convenience, and a second
 * column would be a second thing that can disagree with the id.
 */
export function jobReference(jobId: string): string {
  const digits = jobId.replace(/\D/g, "").slice(-5).padStart(5, "0");
  return `H-${digits}`;
}
