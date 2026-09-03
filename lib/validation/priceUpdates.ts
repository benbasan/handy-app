import { z } from "zod";

/**
 * עדכון מחיר בשטח — product-spec.md 3.5 and 4.5, the rule the whole product
 * is built around.
 *
 * What is deliberately *not* in any schema here is the point of the file:
 *
 *  * `originalPrice` — the price the change is measured from is read by
 *    `request_price_update()` from `job_effective_price()`. A pro who could
 *    state it could claim the agreed price had been 600 all along.
 *  * `status` — `pending → approved/rejected` is `decide_price_update()`, and
 *    no client role holds an UPDATE grant on the column. The form sends a
 *    decision, not a status.
 *  * The new price of the *job*. There is no such column: the live price is
 *    `job_effective_price()`, the selected bid plus every approved update.
 *
 * The photo is the one field that is compulsory in both directions — a NOT
 * NULL, non-blank column since Phase 1, and re-checked here against the
 * caller's own folder before it can be named as evidence.
 */

export const PRICE_UPDATE_STATUSES = [
  "pending",
  "approved",
  "rejected",
] as const;
export type PriceUpdateStatus = (typeof PRICE_UPDATE_STATUSES)[number];

export function isPriceUpdateStatus(value: string): value is PriceUpdateStatus {
  return (PRICE_UPDATE_STATUSES as readonly string[]).includes(value);
}

/** Customer-facing wording — design/screens/customer-3.1-tracking-chat.png. */
export const PRICE_UPDATE_STATUS_LABEL: Record<PriceUpdateStatus, string> = {
  pending: "ממתין לאישור שלך",
  approved: "אושר על ידך",
  rejected: "לא אושר — נשאר המחיר המקורי",
};

/** Pro-facing wording — design/screens/pro-3.1-manage-job-price-update.png. */
export const PRICE_UPDATE_STATUS_LABEL_PRO: Record<PriceUpdateStatus, string> =
  {
    pending: "ממתין לאישור הלקוח",
    approved: "הלקוח אישר",
    rejected: "הלקוח לא אישר — העבודה במחיר המקורי",
  };

export const MIN_PRICE_UPDATE_PRICE = 50;
export const MAX_PRICE_UPDATE_PRICE = 100000;
/** The + / − buttons on the orange price card move in this step. */
export const PRICE_UPDATE_STEP = 20;

export const PRICE_UPDATE_NOTE_MAX = 500;

/**
 * The reason chips on the design's orange card. They are a shortcut into the
 * note field, not a vocabulary the database knows about: a field fault does
 * not fit a closed list the way "מתי נוח" does, and a wrong-but-tickable
 * reason is worse than a sentence the pro actually wrote.
 */
export const PRICE_UPDATE_REASONS = [
  "צינור סדוק בקיר",
  "רכיב שבור דורש החלפה",
  "עבודה מורכבת מהמתוכנן",
] as const;

export const PHOTO_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
] as const;

export const MAX_PRICE_UPDATE_PHOTO_BYTES = 10 * 1024 * 1024;

const FILENAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;

/**
 * `<pro id>/<job id>/<filename>` inside the price-update-photos bucket.
 *
 * Both leading segments are pinned, here and again in the database: the
 * bucket's insert policy owns the first, `request_price_update()` owns the
 * second. A photo therefore cannot be re-used as evidence for a different job,
 * which is the difference between a photo and a photo of *this* fault.
 */
export function priceUpdatePhotoPathSchema(userId: string, jobId: string) {
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
          parts[1] === jobId &&
          FILENAME.test(parts[2]!)
        );
      },
      { error: "התמונה חייבת להיות תמונה שצולמה עבור הקריאה הזו" },
    );
}

/**
 * "שלח בקשת אישור ללקוח". Bound to the caller and the job, because the photo
 * rule depends on both — built per request rather than once at module scope
 * for exactly that reason, the same as `createJobSchema`.
 */
export function requestPriceUpdateSchema(userId: string, jobId: string) {
  return z.object({
    jobId: z.literal(jobId, { error: "מזהה קריאה לא תקין" }),

    newPrice: z.coerce
      .number({ error: "יש להזין מחיר מעודכן" })
      .int({ error: "המחיר בשקלים שלמים" })
      .min(MIN_PRICE_UPDATE_PRICE, {
        error: `המחיר המינימלי הוא ${MIN_PRICE_UPDATE_PRICE} ₪`,
      })
      .max(MAX_PRICE_UPDATE_PRICE, { error: "המחיר גבוה מדי" }),

    photoPath: priceUpdatePhotoPathSchema(userId, jobId),

    note: z
      .string()
      .trim()
      .max(PRICE_UPDATE_NOTE_MAX, { error: "ההסבר ארוך מדי" })
      .optional()
      .transform((value) => (value === "" ? undefined : value)),
  });
}

/** The customer's two buttons, and nothing in between. */
export const decidePriceUpdateSchema = z.object({
  priceUpdateId: z.uuid({ error: "מזהה בקשה לא תקין" }),
  decision: z.enum(["approve", "reject"], { error: "החלטה לא תקינה" }),
});

/**
 * "ההפרש" on the customer's approval card — product-spec.md 3.5 lists it
 * beside the two prices because that is the number the decision is actually
 * about.
 */
export function priceDelta(originalPrice: number, newPrice: number): number {
  return Math.round((newPrice - originalPrice) * 100) / 100;
}

export function formatIls(amount: number): string {
  return amount.toLocaleString("he-IL");
}
