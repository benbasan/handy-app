import { z } from "zod";

/**
 * לוח ניהול — product-spec.md section 5, and the four screens under
 * design/screens/admin-*.
 *
 * The admin's side of the product is almost entirely *reading*, which is why
 * this file is mostly labels and one filter schema. The three things it can
 * write — a pro's verification, a dispute's outcome, an enforcement action —
 * each go through a checked database function, and their schemas live beside
 * the entity they act on (`pros.ts`, `disputes.ts`) rather than here.
 */

/**
 * What the jobs table calls a call's state — design/screens/
 * admin-7.3-jobs-management.png reads הושלם · בעבודה · ללא הצעות · ממתין
 * לבחירה, which is not `jobs.status` alone: "ללא הצעות" and "ממתין לבחירה"
 * are both `open`/`bidding`, told apart by whether anyone has offered.
 *
 * Derived here rather than stored, for the same reason the job has no price
 * column: a second field would be a second thing that can disagree.
 */
export type AdminJobState =
  | "no_bids"
  | "awaiting_choice"
  | "assigned"
  | "in_progress"
  | "completed"
  | "cancelled"
  | "draft";

export const ADMIN_JOB_STATE_LABEL: Record<AdminJobState, string> = {
  no_bids: "ללא הצעות",
  awaiting_choice: "ממתין לבחירה",
  assigned: "שובץ",
  in_progress: "בעבודה",
  completed: "הושלם",
  cancelled: "בוטל",
  draft: "טיוטה",
};

/** Red where somebody has to do something, green where the money landed. */
export const ADMIN_JOB_STATE_TONE: Record<
  AdminJobState,
  "alert" | "warn" | "ok" | "muted"
> = {
  no_bids: "alert",
  awaiting_choice: "warn",
  assigned: "ok",
  in_progress: "ok",
  completed: "ok",
  cancelled: "muted",
  draft: "muted",
};

export function adminJobState(
  status: string,
  bidsCount: number,
): AdminJobState {
  if (status === "open" || status === "bidding") {
    return bidsCount === 0 ? "no_bids" : "awaiting_choice";
  }
  if (
    status === "assigned" ||
    status === "in_progress" ||
    status === "completed" ||
    status === "cancelled" ||
    status === "draft"
  ) {
    return status;
  }
  return "draft";
}

/** The סטטוס chip's options, as `jobs.status` values the function filters on. */
export const ADMIN_JOB_STATUS_FILTERS = [
  "open",
  "bidding",
  "assigned",
  "in_progress",
  "completed",
] as const;

export const ADMIN_JOB_STATUS_FILTER_LABEL: Record<string, string> = {
  open: "פתוחות",
  bidding: "בהצעות",
  assigned: "שובצו",
  in_progress: "בעבודה",
  completed: "הושלמו",
};

/** "7 ימים אחרונים" and the two other spans the chip offers. */
export const ADMIN_RANGE_DAYS = [7, 30, 90] as const;

export const ADMIN_RANGE_LABEL: Record<number, string> = {
  7: "7 ימים אחרונים",
  30: "30 יום אחרונים",
  90: "90 יום אחרונים",
};

export const DEFAULT_ADMIN_RANGE_DAYS = 7;

/**
 * The four filters and the search box above the table. Everything is optional
 * and everything arrives from the query string, so each field is narrowed to
 * something the database function will accept rather than passed through.
 */
export const adminJobFiltersSchema = z.object({
  search: z
    .string()
    .trim()
    .max(120)
    .optional()
    .transform((value) => (value ? value : undefined)),
  status: z
    .enum(ADMIN_JOB_STATUS_FILTERS)
    .optional()
    .catch(undefined)
    .transform((value) => value ?? undefined),
  category: z
    .string()
    .trim()
    .max(60)
    .regex(/^[a-z-]+$/, { error: "תחום לא תקין" })
    .optional()
    .catch(undefined)
    .transform((value) => (value ? value : undefined)),
  city: z
    .string()
    .trim()
    .max(60)
    .optional()
    .transform((value) => (value ? value : undefined)),
  days: z.coerce
    .number()
    .int()
    .refine((value) => (ADMIN_RANGE_DAYS as readonly number[]).includes(value))
    .catch(DEFAULT_ADMIN_RANGE_DAYS),
});

export type AdminJobFilters = z.infer<typeof adminJobFiltersSchema>;

/**
 * The four buttons under "כלי אכיפה" that act on one pro, as the closed
 * vocabulary `set_pro_enforcement()` accepts. Suspension is not here: it is
 * `set_pro_verification()`, which has existed since Phase 3, and a credit to
 * the customer is `resolve_dispute()`.
 */
export const PRO_ENFORCEMENT_ACTIONS = [
  "block_price_updates",
  "unblock_price_updates",
  "require_documents",
  "clear_documents_request",
] as const;

export type ProEnforcementAction = (typeof PRO_ENFORCEMENT_ACTIONS)[number];

export const PRO_ENFORCEMENT_LABEL: Record<ProEnforcementAction, string> = {
  block_price_updates: "חסום עדכוני מחיר",
  unblock_price_updates: "בטל חסימת עדכוני מחיר",
  require_documents: "דרוש מסמכים מחודשים",
  clear_documents_request: "בטל דרישת מסמכים",
};

export const proEnforcementSchema = z.object({
  proId: z.uuid({ error: "מזהה בעל מקצוע לא תקין" }),
  action: z.enum(PRO_ENFORCEMENT_ACTIONS, { error: "פעולה לא חוקית" }),
});

/**
 * "+12% מאתמול" — the change between two spans, or null when there is nothing
 * to compare against. A jump from zero is not "+100%", it is a first day.
 */
export function percentChange(
  current: number,
  previous: number,
): number | null {
  if (previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

const HEBREW_WEEKDAYS = ["א", "ב", "ג", "ד", "ה", "ו", "ש"] as const;

/** The א…ש under each bar of "קריאות לפי יום". */
export function hebrewWeekday(date: Date): string {
  return HEBREW_WEEKDAYS[date.getDay()]!;
}
