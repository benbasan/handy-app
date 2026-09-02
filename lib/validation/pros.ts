import { z } from "zod";
import { ISRAEL_BOUNDS } from "@/lib/maps/geocode";

/**
 * The pro's profile — product-spec.md 4.2 (the five onboarding steps) and 4.9
 * (availability and settings).
 *
 * Everything the onboarding and settings forms collect is re-validated here on
 * the server (CLAUDE.md section 3). Three things are deliberately absent and
 * cannot be reached from any schema in this file:
 *
 *  * `verification_status` — moved only by `submit_pro_for_approval()` and
 *    `set_pro_verification()`, which check the caller in the database. There
 *    is no column grant to write it from a client at all.
 *  * `rating_avg` / `jobs_completed_count` — derived from real jobs, in the
 *    phases that create them.
 *  * A full bank account number. Only the last four digits are collected, so
 *    the pro can recognise the account on screen; how the rest is stored is a
 *    payments-phase decision to take with the user (CLAUDE.md section 8).
 */

/** 0 = Sunday … 6 = Saturday — the א…ש chips in pro-5.2-availability-settings. */
export const WORK_DAYS = [0, 1, 2, 3, 4, 5, 6] as const;

export const WORK_DAY_LABEL: Record<number, string> = {
  0: "א",
  1: "ב",
  2: "ג",
  3: "ד",
  4: "ה",
  5: "ו",
  6: "ש",
};

export const WORK_DAY_FULL_LABEL: Record<number, string> = {
  0: "ראשון",
  1: "שני",
  2: "שלישי",
  3: "רביעי",
  4: "חמישי",
  5: "שישי",
  6: "שבת",
};

/**
 * The pro's own travel radius (רדיוס פעילות). Distinct from a job's
 * `search_radius_km` — see the glossary in CLAUDE.md section 4. "כל העיר" in
 * the design is the widest chip, not an unbounded one: an unbounded radius
 * would make the GiST index pointless and the feed meaningless.
 */
export const SERVICE_RADIUS_OPTIONS = [3, 5, 15] as const;
export const DEFAULT_SERVICE_RADIUS_KM = 5;

export const SERVICE_RADIUS_LABEL: Record<number, string> = {
  3: "עד 3 ק״מ",
  5: "עד 5 ק״מ",
  15: "כל העיר",
};

/** product-spec.md 3.6 / business rule 4: Handy never handles the money. */
export const PAYMENT_METHODS = ["cash", "bit", "paybox", "transfer"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  cash: "מזומן",
  bit: "ביט",
  paybox: "פייבוקס",
  transfer: "העברה בנקאית",
};

/** Business rule 3, and the only number in the product that is not negotiable. */
export const COMMISSION_RATE = 0.12;

export const BIO_MAX = 600;

export const VERIFICATION_DOC_TYPES = [
  "profile_photo",
  "id_card",
  "license",
  "insurance",
] as const;
export type VerificationDocType = (typeof VERIFICATION_DOC_TYPES)[number];

export const VERIFICATION_DOC_LABEL: Record<VerificationDocType, string> = {
  profile_photo: "תמונת פרופיל",
  id_card: "ת.ז / רישיון מקצוע",
  license: "רישיון מקצועי",
  insurance: "ביטוח אחריות מקצועית",
};

/** Only the first two are required to submit; the design marks the rest optional. */
export const REQUIRED_DOC_TYPES: readonly VerificationDocType[] = [
  "profile_photo",
  "id_card",
];

export const VERIFICATION_DOC_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
] as const;

export const MAX_VERIFICATION_DOC_BYTES = 10 * 1024 * 1024;

const FILENAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;

/**
 * `<pro id>/<filename>` inside the private verification-docs bucket. Two
 * segments, not three: unlike job media there is no upload group, because the
 * pro_profiles row already exists before anything is uploaded.
 *
 * Restates what the bucket's insert policy enforces, so a document row can
 * never come to reference somebody else's file.
 */
export function verificationDocPathSchema(userId: string) {
  return z
    .string()
    .trim()
    .max(200)
    .refine(
      (value) => {
        const parts = value.split("/");
        return (
          parts.length === 2 && parts[0] === userId && FILENAME.test(parts[1])
        );
      },
      { error: "הקובץ אינו שייך למשתמש הזה" },
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

const serviceRadiusKm = z.coerce
  .number()
  .int()
  .refine(
    (value) => (SERVICE_RADIUS_OPTIONS as readonly number[]).includes(value),
    { error: "רדיוס פעילות לא חוקי" },
  );

const categoryIds = z
  .array(z.uuid())
  .min(1, { error: "יש לבחור לפחות תחום אחד" })
  .max(20, { error: "נבחרו יותר מדי תחומים" });

const fullName = z
  .string()
  .trim()
  .min(2, { error: "יש להזין שם מלא" })
  .max(80, { error: "השם ארוך מדי" });

const addressText = z
  .string()
  .trim()
  .min(5, { error: "יש להזין כתובת מלאה — רחוב, מספר ועיר" })
  .max(200, { error: "הכתובת ארוכה מדי" });

/**
 * Step 1 of the design's onboarding, and the whole of the /pro/join screen
 * (design/screens/pro-1.3-signup-verification.png): who you are, what you do,
 * and where.
 *
 * The address is an addition to that screen, which shows only radius chips.
 * A radius with no centre cannot be turned into a PostGIS query, so the
 * "אזור פעילות" card asks for the base address the radius is measured from.
 */
export const proProfileSchema = z.object({
  fullName,
  bio: z
    .string()
    .trim()
    .max(BIO_MAX, { error: "התיאור ארוך מדי" })
    .optional()
    .transform((value) => (value === "" ? undefined : value)),
  categoryIds,
  radiusKm: serviceRadiusKm,
  addressText,
  // Advisory, exactly as on the customer side: Places Autocomplete's answer is
  // range-checked here and re-checked in geocodeAddress before it is stored.
  lat: latitude.nullish(),
  lng: longitude.nullish(),
});

export type ProProfileInput = z.infer<typeof proProfileSchema>;

/** Step 3 — the documents. The paths are pinned to the caller's own folder. */
export function proDocumentsSchema(userId: string) {
  const path = verificationDocPathSchema(userId);

  return z.object({
    profilePhotoPath: path.nullish(),
    idCardPath: path.nullish(),
    licensePath: path.nullish(),
    insurancePath: path.nullish(),
  });
}

/**
 * Step 4 — the practice bid (תרגול הגשת הצעה).
 *
 * product-spec.md 4.2 is explicit that this is a simulation on a sample job
 * and is never sent to a real customer, so nothing here reaches the `bids`
 * table. It is validated all the same: the numbers drive the commission
 * arithmetic the pro is being taught to read, and a NaN there would teach them
 * the wrong thing.
 */
export const practiceBidSchema = z.object({
  price: z.coerce
    .number({ error: "יש להזין מחיר" })
    .positive({ error: "המחיר חייב להיות גדול מאפס" })
    .max(100000, { error: "המחיר גבוה מדי" }),
  etaMinutes: z.coerce
    .number({ error: "יש להזין זמן הגעה" })
    .int()
    .positive({ error: "זמן ההגעה חייב להיות גדול מאפס" })
    .max(24 * 60, { error: "זמן ההגעה ארוך מדי" }),
  note: z
    .string()
    .trim()
    .max(500, { error: "ההערה ארוכה מדי" })
    .optional()
    .transform((value) => (value === "" ? undefined : value)),
});

/** Step 5 — how money moves, on both sides of the 12%. */
export const payoutSchema = z.object({
  paymentMethods: z
    .array(z.enum(PAYMENT_METHODS))
    .min(1, { error: "יש לבחור לפחות אמצעי גבייה אחד" }),
  bankName: z
    .string()
    .trim()
    .min(2, { error: "יש להזין שם בנק" })
    .max(60, { error: "שם הבנק ארוך מדי" }),
  bankBranch: z
    .string()
    .trim()
    .regex(/^\d{1,4}$/, { error: "מספר סניף מורכב מעד 4 ספרות" }),
  accountLast4: z
    .string()
    .trim()
    .regex(/^\d{4}$/, { error: "יש להזין את 4 הספרות האחרונות של החשבון" }),
});

/** The availability screen — design/screens/pro-5.2-availability-settings.png. */
export const availabilitySchema = z.object({
  acceptingJobs: z.coerce.boolean(),
  workDays: z
    .array(z.coerce.number().int().min(0).max(6))
    .min(1, { error: "יש לבחור לפחות יום עבודה אחד" }),
  workStartTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, { error: "שעת התחלה לא תקינה" }),
  workEndTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, { error: "שעת סיום לא תקינה" }),
  radiusKm: serviceRadiusKm,
  categoryIds,
});

export const dismissJobSchema = z.object({
  jobId: z.uuid({ error: "מזהה קריאה לא תקין" }),
});

export const setVerificationSchema = z.object({
  proId: z.uuid({ error: "מזהה בעל מקצוע לא תקין" }),
  status: z.enum(["verified", "rejected", "suspended"], {
    error: "החלטה לא חוקית",
  }),
});

/**
 * What Handy takes and what is left, from a bid price. Business rule 3: the
 * 12% is charged to the pro, never added to the customer's price.
 *
 * Rounded to agorot at each end so the two numbers the pro is shown always add
 * back up to the price they typed.
 */
export function commissionBreakdown(price: number): {
  commission: number;
  net: number;
} {
  const commission = Math.round(price * COMMISSION_RATE * 100) / 100;
  return { commission, net: Math.round((price - commission) * 100) / 100 };
}

/** "כל יום" beats listing all seven; a workless week reads as a warning. */
export function formatWorkDays(days: readonly number[]): string {
  const sorted = [...new Set(days)].sort((a, b) => a - b);
  if (sorted.length === 0) return "לא נבחרו ימים";
  if (sorted.length === 7) return "כל ימות השבוע";
  return sorted.map((day) => WORK_DAY_FULL_LABEL[day]).join(", ");
}

/** `08:00:00` out of Postgres, `08:00` in an <input type="time">. */
export function trimSeconds(time: string | null): string {
  return (time ?? "").slice(0, 5);
}
