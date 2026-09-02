import { z } from "zod";

/**
 * Chat (הודעות) — product-spec.md 3.3 and 4.10.
 *
 * A thread is keyed by (job, pro), not by job: on a call with three offers,
 * each pro talks to the customer alone, and neither the schema nor the RLS
 * policies behind it admit a "job-wide" conversation. `proId` is therefore
 * part of every write, and the database re-checks that the pro named actually
 * bid on the job — a customer cannot start a conversation with a stranger, and
 * a pro cannot post into somebody else's thread.
 */

export const MESSAGE_MAX = 2000;

export const sendMessageSchema = z.object({
  jobId: z.uuid({ error: "מזהה קריאה לא תקין" }),
  proId: z.uuid({ error: "מזהה בעל מקצוע לא תקין" }),
  body: z
    .string()
    .trim()
    .min(1, { error: "אי אפשר לשלוח הודעה ריקה" })
    .max(MESSAGE_MAX, { error: "ההודעה ארוכה מדי" }),
});

export const threadKeySchema = z.object({
  jobId: z.uuid({ error: "מזהה קריאה לא תקין" }),
  proId: z.uuid({ error: "מזהה בעל מקצוע לא תקין" }),
});

/** "09:02" beside each bubble in design/screens/pro-5.3-messages.png. */
export function messageTime(iso: string): string {
  return new Intl.DateTimeFormat("he-IL", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jerusalem",
  }).format(new Date(iso));
}

/**
 * The thread list stamps today's conversations with a time and older ones with
 * a date — "14:12" / "אתמול" / "20.8", exactly as the design does.
 */
export function threadStamp(iso: string, now: Date = new Date()): string {
  const at = new Date(iso);
  const dayMs = 24 * 60 * 60 * 1000;
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).getTime();

  if (at.getTime() >= startOfToday) return messageTime(iso);
  if (at.getTime() >= startOfToday - dayMs) return "אתמול";

  return new Intl.DateTimeFormat("he-IL", {
    day: "numeric",
    month: "numeric",
    timeZone: "Asia/Jerusalem",
  }).format(at);
}
