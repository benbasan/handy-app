import { z } from "zod";

/**
 * Bids (הצעות מחיר) — product-spec.md 3.3 and 4.4.
 *
 * Everything the bid form collects is re-validated here on the server
 * (CLAUDE.md section 3). What is deliberately *not* in any schema in this file
 * is the whole point of the file:
 *
 *  * `expiresAt` — the 45 minutes are a column default plus a trigger, and the
 *    pro holds no INSERT grant on that column. A form cannot offer a bid that
 *    never lapses.
 *  * `status` — `pending → selected/rejected` is `select_bid()` and
 *    `pending → expired` is `expire_stale_bids()`, both security definer. No
 *    client role holds an UPDATE grant on the column.
 *  * The commission. It is derived from the price by
 *    `commissionBreakdown()`, never sent from the browser: business rule 3 is
 *    server-authoritative like every other number with a ₪ in front of it.
 */

/** Business rule 6 — הצעת מחיר תקפה 45 דקות. Mirrors the column default. */
export const BID_VALIDITY_MINUTES = 45;

/** The four chips on design/screens/pro-2.3-submit-bid.png. */
export const ETA_OPTIONS = [15, 30, 45, 60] as const;
export const DEFAULT_ETA_MINUTES = 30;

export const ETA_LABEL: Record<number, string> = {
  15: "15 דק׳",
  30: "30 דק׳",
  45: "45 דק׳",
  60: "שעה+",
};

export const MIN_BID_PRICE = 50;
export const MAX_BID_PRICE = 100000;
/** The + / − buttons on the price card move in this step. */
export const PRICE_STEP = 20;
export const DEFAULT_BID_PRICE = 320;

export const BID_NOTE_MAX = 500;

/**
 * The five states a bid can be in on screen. `expired` is reported by the read
 * functions the moment the deadline passes, whether or not the sweep has run —
 * so a label here is never ahead of or behind the database.
 */
export const BID_STATUSES = [
  "pending",
  "selected",
  "rejected",
  "expired",
] as const;
export type BidStatus = (typeof BID_STATUSES)[number];

/** Customer-facing wording (design/screens/customer-2.2-compare-bids.png). */
export const BID_STATUS_LABEL: Record<BidStatus, string> = {
  pending: "ממתינה להחלטה",
  selected: "ההצעה שנבחרה",
  rejected: "לא נבחרה",
  expired: "פג תוקף",
};

/** Pro-facing wording (design/screens/pro-2.4-my-bids.png). */
export const BID_STATUS_LABEL_PRO: Record<BidStatus, string> = {
  pending: "ממתינה לבחירת הלקוח",
  selected: "הלקוח בחר בך",
  rejected: "הלקוח בחר אחר",
  expired: "פג תוקף — לא נענה",
};

export function isBidStatus(value: string): value is BidStatus {
  return (BID_STATUSES as readonly string[]).includes(value);
}

/** The three sort tabs above the offer list. */
export const BID_SORTS = ["recommended", "cheapest", "fastest"] as const;
export type BidSort = (typeof BID_SORTS)[number];

export const BID_SORT_LABEL: Record<BidSort, string> = {
  recommended: "מומלץ",
  cheapest: "המחיר הזול",
  fastest: "הגעה מהירה",
};

export function isBidSort(value: string | undefined): value is BidSort {
  return (
    value !== undefined && (BID_SORTS as readonly string[]).includes(value)
  );
}

const price = z.coerce
  .number({ error: "יש להזין מחיר" })
  .int({ error: "המחיר בשקלים שלמים" })
  .min(MIN_BID_PRICE, { error: `המחיר המינימלי הוא ${MIN_BID_PRICE} ₪` })
  .max(MAX_BID_PRICE, { error: "המחיר גבוה מדי" });

const etaMinutes = z.coerce
  .number({ error: "יש לבחור זמן הגעה" })
  .int()
  .positive({ error: "זמן ההגעה חייב להיות גדול מאפס" })
  .max(24 * 60, { error: "זמן ההגעה ארוך מדי" });

const note = z
  .string()
  .trim()
  .max(BID_NOTE_MAX, { error: "ההערה ארוכה מדי" })
  .optional()
  .transform((value) => (value === "" ? undefined : value));

/** Submitting a new offer — design/screens/pro-2.3-submit-bid.png. */
export const submitBidSchema = z.object({
  jobId: z.uuid({ error: "מזהה קריאה לא תקין" }),
  price,
  etaMinutes,
  note,
});

/** "עדכן הצעה" on design/screens/pro-2.4-my-bids.png. */
export const updateBidSchema = z.object({
  bidId: z.uuid({ error: "מזהה הצעה לא תקין" }),
  price,
  etaMinutes,
  note,
});

export const selectBidSchema = z.object({
  bidId: z.uuid({ error: "מזהה הצעה לא תקין" }),
});

/**
 * "כולל ביקור וחלקים" under every price in the design — business rule 2, that
 * there are no separate call-out fees. Kept here beside the schema so the two
 * screens that promise it cannot drift apart.
 */
export const PRICE_INCLUDES_NOTE = "כולל ביקור וחלקים";

/** "לפני 4 דקות" — how every card in both designs stamps a time. */
export function relativeTime(iso: string, now: number = Date.now()): string {
  const minutes = Math.round((now - new Date(iso).getTime()) / 60000);

  if (minutes < 1) return "עכשיו";
  if (minutes === 1) return "לפני דקה";
  if (minutes < 60) return `לפני ${minutes} דק׳`;

  const hours = Math.round(minutes / 60);
  if (hours === 1) return "לפני שעה";
  if (hours < 24) return `לפני ${hours} שעות`;

  const days = Math.round(hours / 24);
  return days === 1 ? "אתמול" : `לפני ${days} ימים`;
}

/**
 * "ההצעה תקפה עוד 38 דקות" — counted down from the deadline the database
 * wrote, not from when the page happened to render a timer.
 */
export function minutesLeft(
  expiresAt: string,
  now: number = Date.now(),
): number {
  return Math.max(0, Math.ceil((new Date(expiresAt).getTime() - now) / 60000));
}

/** "ד.ל" — the initials avatar the compare screen puts beside each offer. */
export function initials(name: string | null): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "??";
  return parts
    .slice(0, 2)
    .map((part) => `${part[0]}.`)
    .join("");
}
