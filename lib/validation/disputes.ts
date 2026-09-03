import { z } from "zod";

/**
 * מחלוקת — product-spec.md 5.4.
 *
 * A dispute is the one thing in this product that both sides can start and
 * neither side can finish. That asymmetry is the whole schema:
 *
 *  * Opening one asserts a **reason** and nothing else. `status` defaults to
 *    `open` and `credit_amount` to null, and since Phase 7 the INSERT grant
 *    covers three columns only — so there is no shape of this form that could
 *    hand somebody a credit.
 *  * Deciding one is `resolve_dispute()`, which checks `is_admin()` in the
 *    database. The schema below is what the admin's form sends; the function
 *    is what makes it true.
 */

export const DISPUTE_STATUSES = [
  "open",
  "in_review",
  "resolved",
  "rejected",
] as const;

export type DisputeStatus = (typeof DISPUTE_STATUSES)[number];

/** Must match the check constraint on disputes.status. */
export const DISPUTE_STATUS_LABEL: Record<DisputeStatus, string> = {
  open: "פתוח",
  in_review: "בבדיקה",
  resolved: "נסגר · זיכוי",
  rejected: "נסגר · נדחה",
};

export function isDisputeStatus(value: string): value is DisputeStatus {
  return (DISPUTE_STATUSES as readonly string[]).includes(value);
}

/** Still somebody's to answer — the two states the 24-hour target counts. */
export function isDisputeOpen(status: DisputeStatus): boolean {
  return status === "open" || status === "in_review";
}

/** The outcomes an admin may choose. `open` is where a case starts, not a decision. */
export const DISPUTE_DECISIONS = ["in_review", "resolved", "rejected"] as const;

export type DisputeDecision = (typeof DISPUTE_DECISIONS)[number];

export const DISPUTE_DECISION_LABEL: Record<DisputeDecision, string> = {
  in_review: "סמן כבבדיקה",
  resolved: "קבל את התלונה",
  rejected: "דחה את התלונה",
};

export const DISPUTE_REASON_MIN = 15;
export const DISPUTE_REASON_MAX = 1000;
export const DISPUTE_NOTE_MAX = 2000;
/** A credit cannot exceed any price this marketplace can produce. */
export const DISPUTE_CREDIT_MAX = 100_000;

/**
 * The `D-118` style reference the design puts on every dispute card, derived
 * from the uuid the same way `jobReference` is — a display convenience, not a
 * second column that can disagree with the id.
 */
export function disputeReference(disputeId: string): string {
  const digits = disputeId.replace(/\D/g, "").slice(-3).padStart(3, "0");
  return `D-${digits}`;
}

/** "יש בעיה עם החיוב?" — what a customer or a pro may say, and only that. */
export const openDisputeSchema = z.object({
  jobId: z.uuid({ error: "מזהה קריאה לא תקין" }),
  reason: z
    .string()
    .trim()
    .min(DISPUTE_REASON_MIN, { error: "כתבו לפחות משפט אחד על מה שקרה" })
    .max(DISPUTE_REASON_MAX, { error: "התיאור ארוך מדי" }),
});

/**
 * "הכרעה וזיכוי" — design/screens/admin-7.4-disputes-control.png.
 *
 * The credit rides with the decision that grants it, which is why it is
 * refined here as well as inside `resolve_dispute()`: a number typed beside
 * "דחה את התלונה" is a mistake, and the clearest place to say so is under the
 * field where it was typed.
 */
export const resolveDisputeSchema = z
  .object({
    disputeId: z.uuid({ error: "מזהה מחלוקת לא תקין" }),
    decision: z.enum(DISPUTE_DECISIONS, { error: "יש לבחור הכרעה" }),
    note: z
      .string()
      .trim()
      .max(DISPUTE_NOTE_MAX, { error: "ההנמקה ארוכה מדי" })
      .optional()
      .transform((value) => (value === "" ? undefined : value)),
    creditAmount: z
      .union([z.literal(""), z.coerce.number()])
      .optional()
      .transform((value) =>
        value === "" || value === undefined ? undefined : Number(value),
      )
      .refine(
        (value) =>
          value === undefined ||
          (Number.isFinite(value) && value >= 0 && value <= DISPUTE_CREDIT_MAX),
        { error: "סכום הזיכוי לא תקין" },
      ),
  })
  .refine(
    (input) =>
      input.creditAmount === undefined || input.decision === "resolved",
    { error: "זיכוי נרשם רק על תלונה שהתקבלה", path: ["creditAmount"] },
  );

export type ResolveDisputeInput = z.infer<typeof resolveDisputeSchema>;
