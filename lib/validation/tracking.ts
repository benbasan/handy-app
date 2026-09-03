import { z } from "zod";
import { ISRAEL_BOUNDS } from "@/lib/maps/geocode";

/**
 * מעקב חי — docs/architecture.md section 5, the customer's half of
 * design/screens/customer-3.1-tracking-chat.png.
 *
 * The pro's browser reports a position while it is on the way; the customer's
 * screen draws the last one. Everything here is about how often that happens
 * and when a position stops being worth drawing.
 */

/**
 * How often the pro's device reports, in milliseconds.
 *
 * The roadmap's third definition-of-done line asks for "עדכון תדיר סביר (לא
 * מכביד על הביצועים)", and this is the number that answers it. Fifteen seconds
 * is roughly 200 metres of city driving — fine enough that the pin moves while
 * you watch, coarse enough that a 40-minute drive costs about 160 writes to a
 * single row that is overwritten each time (`job_locations` keeps no history).
 *
 * The browser also only reports while the tab is open and the job is live, so
 * this is the ceiling rather than a background cost.
 */
export const LOCATION_REPORT_INTERVAL_MS = 15_000;

/**
 * After this, the map says "עודכן לפני X" instead of pretending the pin is
 * current. A position nobody has refreshed for five minutes is a place
 * somebody was, and drawing it as a place somebody is would be a lie the
 * customer has no way to check.
 */
export const LOCATION_STALE_AFTER_MS = 5 * 60 * 1000;

export function isLocationFresh(
  updatedAt: string,
  now: number = Date.now(),
): boolean {
  return now - new Date(updatedAt).getTime() < LOCATION_STALE_AFTER_MS;
}

/** "עודכן לפני 40 שניות" — the timestamp under the live map. */
export function sinceLabel(iso: string, now: number = Date.now()): string {
  const seconds = Math.max(
    0,
    Math.round((now - new Date(iso).getTime()) / 1000),
  );

  if (seconds < 60) return `לפני ${seconds} שניות`;

  const minutes = Math.round(seconds / 60);
  if (minutes === 1) return "לפני דקה";
  if (minutes < 60) return `לפני ${minutes} דקות`;

  const hours = Math.round(minutes / 60);
  return hours === 1 ? "לפני שעה" : `לפני ${hours} שעות`;
}

/**
 * One ping. The bounds are the same ones lib/maps/geocode.ts range-checks
 * Places Autocomplete against, and `report_job_location()` re-checks them in
 * the database — a coordinate is an input like any other, and this one arrives
 * from a sensor rather than a person.
 */
export const reportLocationSchema = z.object({
  jobId: z.uuid({ error: "מזהה קריאה לא תקין" }),

  lat: z.coerce
    .number({ error: "קו רוחב לא תקין" })
    .min(ISRAEL_BOUNDS.minLat, { error: "המיקום מחוץ לאזור השירות" })
    .max(ISRAEL_BOUNDS.maxLat, { error: "המיקום מחוץ לאזור השירות" }),

  lng: z.coerce
    .number({ error: "קו אורך לא תקין" })
    .min(ISRAEL_BOUNDS.minLng, { error: "המיקום מחוץ לאזור השירות" })
    .max(ISRAEL_BOUNDS.maxLng, { error: "המיקום מחוץ לאזור השירות" }),

  /** What the browser's geolocation API claims, rounded to whole metres. */
  accuracyM: z.coerce.number().int().min(0).max(100000).nullish(),

  etaMinutes: z.coerce.number().int().min(0).max(1440).nullish(),
});

export const markJobInProgressSchema = z.object({
  jobId: z.uuid({ error: "מזהה קריאה לא תקין" }),
});

/**
 * The three steps of the design's progress bar — בדרך ללקוח · בעבודה · הושלם
 * (design/screens/pro-3.1-manage-job-price-update.png), and the four ticks of
 * "סטטוס הקריאה" on the customer's side.
 *
 * `completed` is listed because both screens draw the step; reaching it is
 * Phase 6, together with the payment and the receipt it has to produce.
 */
export const JOB_PROGRESS_STEPS = [
  "assigned",
  "in_progress",
  "completed",
] as const;
export type JobProgressStep = (typeof JOB_PROGRESS_STEPS)[number];

export const JOB_PROGRESS_LABEL_PRO: Record<JobProgressStep, string> = {
  assigned: "בדרך ללקוח",
  in_progress: "בעבודה",
  completed: "הושלם",
};

export function progressIndex(status: string): number {
  const index = (JOB_PROGRESS_STEPS as readonly string[]).indexOf(status);
  return index === -1 ? 0 : index;
}
