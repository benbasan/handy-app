import { z } from "zod";

/**
 * פנייה לתמיכה — design/screens/content-6.4-support-contact.png.
 *
 * The first form in this product that an anonymous visitor may submit, which
 * makes it the first schema that cannot lean on a session for anything. The
 * name and the phone number are asserted rather than known, and the job
 * reference is free text on purpose: it is what the visitor read off their own
 * screen, not something the server can resolve to a row it trusts.
 *
 * Every bound below is also a check constraint on `support_tickets`. The Zod
 * schema is what produces a Hebrew sentence under the right field; the
 * constraint is what makes it true.
 */

export const SUPPORT_TOPICS = [
  "active_job",
  "pricing",
  "pro_complaint",
  "other",
] as const;

export type SupportTopic = (typeof SUPPORT_TOPICS)[number];

/** The four chips in the design, in its order. */
export const SUPPORT_TOPIC_LABEL: Record<SupportTopic, string> = {
  active_job: "בעיה בקריאה פעילה",
  pricing: "מחיר ותשלום",
  pro_complaint: "תלונה על בעל מקצוע",
  other: "אחר",
};

export const SUPPORT_BODY_MIN = 10;
export const SUPPORT_BODY_MAX = 4000;

export const supportTicketSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, { error: "יש להזין שם מלא" })
    .max(80, { error: "השם ארוך מדי" }),
  phone: z
    .string()
    .trim()
    .min(6, { error: "יש להזין מספר טלפון" })
    .max(20, { error: "מספר הטלפון ארוך מדי" }),
  topic: z.enum(SUPPORT_TOPICS, { error: "יש לבחור נושא" }),
  jobReference: z
    .string()
    .trim()
    .max(40, { error: "מספר הקריאה ארוך מדי" })
    .optional()
    .transform((value) => (value === "" ? undefined : value)),
  body: z
    .string()
    .trim()
    .min(SUPPORT_BODY_MIN, { error: "ספרו לנו במשפט אחד לפחות מה קרה" })
    .max(SUPPORT_BODY_MAX, { error: "התיאור ארוך מדי" }),
});

export type SupportTicketInput = z.infer<typeof supportTicketSchema>;

/**
 * What the support team did with a ticket (Phase 17). The same three values
 * as the check on `support_tickets.status`; `set_support_ticket_status()` is
 * the only way to move one.
 */
export const SUPPORT_STATUSES = ["open", "answered", "closed"] as const;

export type SupportStatus = (typeof SUPPORT_STATUSES)[number];

export const SUPPORT_STATUS_LABEL: Record<SupportStatus, string> = {
  open: "פתוחה",
  answered: "נענתה",
  closed: "סגורה",
};

export function isSupportStatus(value: unknown): value is SupportStatus {
  return (
    typeof value === "string" &&
    (SUPPORT_STATUSES as readonly string[]).includes(value)
  );
}

export function isSupportTopic(value: unknown): value is SupportTopic {
  return (
    typeof value === "string" &&
    (SUPPORT_TOPICS as readonly string[]).includes(value)
  );
}

export const supportTicketStatusSchema = z.object({
  ticketId: z.uuid({ error: "פנייה לא מזוהה" }),
  status: z.enum(SUPPORT_STATUSES, { error: "סטטוס לא מוכר" }),
});
