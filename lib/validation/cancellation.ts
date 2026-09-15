import { z } from "zod";

/**
 * Cancelling a job (Phase 15) — the vocabulary and the two forms.
 *
 * Who may cancel and when is the database's (`cancel_job()`,
 * `cancel_assigned_job()`); this file is the words. `CANCEL_REASONS` mirrors
 * the `jobs_cancel_reason_check` constraint, and a Vitest assertion reads the
 * migration to keep the two identical — the same arrangement as the
 * notification kinds.
 */

/** What a customer may say when they cancel before a pro takes the job. */
export const CUSTOMER_CANCEL_REASONS = [
  "solved_myself",
  "found_elsewhere",
  "not_needed",
  "other",
] as const;

export type CustomerCancelReason = (typeof CUSTOMER_CANCEL_REASONS)[number];

/** Every value the column accepts: the customer's four and the pro's one. */
export const CANCEL_REASONS = [
  ...CUSTOMER_CANCEL_REASONS,
  "customer_cancelled",
] as const;

export const CANCEL_REASON_LABEL: Record<
  (typeof CANCEL_REASONS)[number],
  string
> = {
  solved_myself: "הסתדרתי לבד",
  found_elsewhere: "מצאתי בעל מקצוע בדרך אחרת",
  not_needed: "כבר לא צריך",
  other: "סיבה אחרת",
  customer_cancelled: "הלקוח ביטל אחרי שבעל המקצוע אישר",
};

export const cancelJobSchema = z.object({
  jobId: z.uuid({ error: "מזהה קריאה לא תקין" }),
  reason: z.enum(CUSTOMER_CANCEL_REASONS, { error: "בחרו סיבה לביטול" }),
});

export const cancelAssignedJobSchema = z.object({
  jobId: z.uuid({ error: "מזהה קריאה לא תקין" }),
});

export const CUSTOMER_RATING_COMMENT_MAX = 500;

export const rateCustomerSchema = z.object({
  jobId: z.uuid({ error: "מזהה קריאה לא תקין" }),
  rating: z.coerce
    .number({ error: "בחרו דירוג" })
    .int()
    .min(1, { error: "בחרו דירוג" })
    .max(5, { error: "בחרו דירוג" }),
  comment: z
    .string()
    .trim()
    .max(CUSTOMER_RATING_COMMENT_MAX, { error: "ההערה ארוכה מדי" })
    .optional()
    .transform((value) => (value ? value : undefined)),
});
