import { z } from "zod";
import {
  COMMISSION_RATE,
  PAYMENT_METHODS,
  type PaymentMethod,
} from "@/lib/validation/pros";

/**
 * סיום עבודה, תשלום, עמלה וקבלה — product-spec.md 3.6 and 4.6.
 *
 * What is deliberately *not* in any schema here is, as in
 * lib/validation/priceUpdates.ts, the point of the file:
 *
 *  * The **total**. It is `job_effective_price()` — the selected bid plus every
 *    approved update — read inside `complete_job()`. A pro who could state it
 *    could bill for a price the customer never approved, which is the one rule
 *    the whole product exists to enforce.
 *  * The **commission**. 12% of that total, computed in the same statement.
 *    `commissionOf()` below exists so a screen can *show* the number before it
 *    is charged; it is never sent anywhere.
 *  * The job's **status**. `assigned`/`in_progress` → `completed` is
 *    `complete_job()`, and `jobs.status` has had no column grant since Phase 4.
 *
 * What the pro does send is one thing: how they were paid. Handy does not
 * process the money (business rule 4) — it records the collection.
 */

export { COMMISSION_RATE, PAYMENT_METHODS };
export type { PaymentMethod } from "@/lib/validation/pros";

/** Narrows the free `text[]` a pro ticked in onboarding to the four we know. */
export function isPaymentMethod(value: string): value is PaymentMethod {
  return (PAYMENT_METHODS as readonly string[]).includes(value);
}

/** "סיימתי — עדכן גבייה" — design/screens/pro-3.1-manage-job-price-update.png. */
export const completeJobSchema = z.object({
  jobId: z.uuid({ error: "מזהה קריאה לא תקין" }),
  paymentMethod: z.enum(PAYMENT_METHODS, {
    error: "יש לבחור איך נגבה התשלום",
  }),
});

export const MIN_RATING = 1;
export const MAX_RATING = 5;
export const REVIEW_COMMENT_MAX = 1000;

/** "איך היה השירות?" — design/screens/customer-4.1-summary-receipt-rating.png. */
export const submitReviewSchema = z.object({
  jobId: z.uuid({ error: "מזהה קריאה לא תקין" }),
  rating: z.coerce
    .number({ error: "יש לבחור דירוג" })
    .int({ error: "דירוג הוא מספר כוכבים שלם" })
    .min(MIN_RATING, { error: "יש לבחור בין כוכב אחד לחמישה" })
    .max(MAX_RATING, { error: "יש לבחור בין כוכב אחד לחמישה" }),
  comment: z
    .string()
    .trim()
    .max(REVIEW_COMMENT_MAX, { error: "הביקורת ארוכה מדי" })
    .optional()
    .transform((value) => (value === "" ? undefined : value)),
});

/** The dark "שמור לפעם הבאה" card on the same screen. */
export const saveProSchema = z.object({
  proId: z.uuid({ error: "מזהה בעל מקצוע לא תקין" }),
  jobId: z.uuid({ error: "מזהה קריאה לא תקין" }),
});

/**
 * What Handy takes, for display only.
 *
 * The charged number is `round(total * commission_rate(), 2)` inside
 * `complete_job()`. This is the same arithmetic so a pro can see the figure
 * before they press the button — it is never sent to the server, and a screen
 * that shows a different number from the receipt would be a bug in this
 * function, not in the charge.
 */
export function commissionOf(total: number): number {
  return Math.round(total * COMMISSION_RATE * 100) / 100;
}

/** What the pro actually keeps. */
export function netOf(total: number): number {
  return Math.round((total - commissionOf(total)) * 100) / 100;
}

/**
 * The wallet's היום / השבוע / החודש toggle —
 * design/screens/pro-4.1-earnings-wallet.png.
 */
export const EARNINGS_RANGES = ["today", "week", "month"] as const;
export type EarningsRange = (typeof EARNINGS_RANGES)[number];

export const EARNINGS_RANGE_LABEL: Record<EarningsRange, string> = {
  today: "היום",
  week: "השבוע",
  month: "החודש",
};

/** "הכנסות השבוע" — the heading over the big number, per range. */
export const EARNINGS_RANGE_HEADING: Record<EarningsRange, string> = {
  today: "הכנסות היום",
  week: "הכנסות השבוע",
  month: "הכנסות החודש",
};

export function isEarningsRange(value: string | undefined): value is EarningsRange {
  return (EARNINGS_RANGES as readonly string[]).includes(value ?? "");
}

export const EARNINGS_RANGE_DAYS: Record<EarningsRange, number> = {
  today: 1,
  week: 7,
  month: 30,
};

/**
 * The boundary the range starts at, as local midnight rather than "24 hours
 * ago": "היום" on a screen a pro reads at 08:00 means since they woke up, not
 * since yesterday morning.
 */
export function rangeStart(range: EarningsRange, now: Date = new Date()): Date {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (EARNINGS_RANGE_DAYS[range] - 1));
  return start;
}

/**
 * The bar chart on the wallet card: one bar per day of the range, tallest
 * first-class citizen being whatever the pro actually earned.
 *
 * Derived from the same rows the table below it renders, so a bar and a line
 * can never disagree — there is no second query behind the picture.
 */
export type EarningsBar = {
  /** Local ISO date, `YYYY-MM-DD` — the key, not something rendered. */
  day: string;
  label: string;
  total: number;
};

export function earningsByDay(
  charges: ReadonlyArray<{ chargedAt: string; totalPrice: number }>,
  range: EarningsRange,
  now: Date = new Date(),
): EarningsBar[] {
  const days = EARNINGS_RANGE_DAYS[range];
  // A month of bars is a smear at this width; the design draws seven.
  const shown = Math.min(days, 7);

  const bars: EarningsBar[] = [];
  for (let offset = shown - 1; offset >= 0; offset -= 1) {
    const date = new Date(now);
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - offset);
    bars.push({ day: localDay(date), label: dayLabel(date), total: 0 });
  }

  const index = new Map(bars.map((bar) => [bar.day, bar]));
  for (const charge of charges) {
    const bar = index.get(localDay(new Date(charge.chargedAt)));
    if (bar) bar.total += charge.totalPrice;
  }

  return bars;
}

function localDay(date: Date): string {
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

const HEBREW_WEEKDAYS = ["א", "ב", "ג", "ד", "ה", "ו", "ש"] as const;

function dayLabel(date: Date): string {
  return HEBREW_WEEKDAYS[date.getDay()]!;
}

/**
 * One line of "סיכום חיוב" — design/screens/customer-4.1-summary-receipt-rating.png
 * lists "עבודה בסיסית 380 ₪", "עדכון מחיר מאושר 140+ ₪", "סה״כ 520 ₪".
 *
 * The lines are built from the approved `price_updates` rows themselves rather
 * than stored anywhere: base + every approved delta is the total by
 * construction, which is the same reason the job has no price column.
 */
export type ReceiptLine = {
  label: string;
  amount: number;
  /** An addition the customer approved, rendered with a leading +. */
  delta: boolean;
};

export function receiptLines(
  basePrice: number,
  approved: ReadonlyArray<{ originalPrice: number; newPrice: number }>,
): ReceiptLine[] {
  const lines: ReceiptLine[] = [
    { label: "עבודה בסיסית", amount: basePrice, delta: false },
  ];

  // Oldest first: each approved update measures itself against the price that
  // held when it was asked for, so the deltas only add up in that order.
  const ordered = [...approved].sort(
    (a, b) => a.originalPrice - b.originalPrice,
  );

  for (const update of ordered) {
    lines.push({
      label: "עדכון מחיר מאושר",
      amount: Math.round((update.newPrice - update.originalPrice) * 100) / 100,
      delta: true,
    });
  }

  return lines;
}

/** "22.8, 14:55" — the sub-heading of the summary screen. */
export function receiptTimestamp(iso: string): string {
  const date = new Date(iso);
  const day = date.getDate();
  const month = date.getMonth() + 1;
  const time = date.toLocaleTimeString("he-IL", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${day}.${month}, ${time}`;
}

/** "3 בספטמבר 2026, 14:55" — the date line at the head of the PDF. */
export function formatReceiptDate(iso: string): string {
  return new Date(iso).toLocaleString("he-IL", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
