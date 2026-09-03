"use client";

import { useActionState } from "react";
import { ErrorText } from "@/components/ui/primitives";
import { decidePriceUpdate } from "@/lib/actions/priceUpdates";
import { EMPTY_PRICE_DECISION_STATE } from "@/lib/actions/state";
import type { PriceUpdate } from "@/lib/supabase/priceUpdates";
import { formatIls, priceDelta } from "@/lib/validation/priceUpdates";

/**
 * "בקשת עדכון מחיר" on design/screens/customer-3.1-tracking-chat.png — the
 * modal state product-spec.md 3.5 describes, and the single most important
 * screen in the product.
 *
 * The spec lists exactly what the customer must see before deciding: the photo
 * taken in the field, the pro's explanation, the original price, the updated
 * price, and the difference. All five are here, and the photo is first,
 * because it is the thing that makes the rest checkable.
 *
 * Exactly two actions, both final. Refusing is not a "maybe later": it is what
 * leaves the job at the price that was agreed, and the sentence under the
 * buttons says so before either is pressed rather than after.
 */
export function PriceUpdateDecision({
  update,
  photoUrl,
  proName,
}: {
  update: PriceUpdate;
  /** A short-lived signed URL, or null if the object could not be signed. */
  photoUrl: string | null;
  proName: string | null;
}) {
  const [state, formAction, pending] = useActionState(
    decidePriceUpdate,
    EMPTY_PRICE_DECISION_STATE,
  );

  const delta = priceDelta(update.originalPrice, update.newPrice);

  // The server's answer wins immediately; the router refresh follows.
  if (state.decision) {
    const approved = state.decision === "approved";
    return (
      <section
        role="status"
        className={`rounded-2xl border-2 p-5 ${
          approved ? "border-cta bg-cta/10" : "border-line bg-surface"
        }`}
      >
        <h2 className="text-lg font-bold text-ink">
          {approved ? "אישרת את המחיר המעודכן" : "לא אישרת את השינוי"}
        </h2>
        <p className="mt-2 text-sm text-ink">
          {approved ? (
            <>
              המחיר לקריאה הוא כעת{" "}
              <span className="ltr-nums font-bold">
                {formatIls(update.newPrice)}
              </span>{" "}
              ₪.
            </>
          ) : (
            <>
              העבודה ממשיכה במחיר המקורי —{" "}
              <span className="ltr-nums font-bold">
                {formatIls(update.originalPrice)}
              </span>{" "}
              ₪. לא ניתן לחייב אותך ביותר מזה.
            </>
          )}
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border-2 border-alert bg-surface">
      <div className="flex items-start gap-3 border-b border-line p-5">
        <span
          aria-hidden
          className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-alert text-sm font-bold text-white"
        >
          !
        </span>
        <div>
          <h2 className="text-lg font-bold text-ink">בקשת עדכון מחיר</h2>
          <p className="mt-1 text-sm text-muted">
            {proName ?? "בעל המקצוע"} מבקש לעדכן את המחיר לאחר שראה את התקלה.
          </p>
        </div>
      </div>

      <div className="space-y-4 p-5">
        {/* The photo, first. Without it there is nothing to check the rest
            against — which is why the column has been NOT NULL since Phase 1
            rather than being a required field in a form. */}
        {photoUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element -- a signed,
             expiring Storage URL: next/image would cache a URL that dies. */
          <img
            src={photoUrl}
            alt="התמונה שצילם בעל המקצוע בשטח"
            className="max-h-72 w-full rounded-xl object-cover"
          />
        ) : (
          <p className="rounded-xl bg-canvas p-4 text-center text-sm text-muted">
            לא הצלחנו לטעון את התמונה כרגע. אל תאשרו שינוי מחיר בלי לראות אותה —
            רעננו את הדף או בקשו מבעל המקצוע לשלוח אותה שוב בצ׳אט.
          </p>
        )}

        {update.note && (
          <p className="rounded-xl bg-alert-soft p-4 text-sm whitespace-pre-line text-ink">
            {update.note}
          </p>
        )}

        <dl className="grid grid-cols-3 gap-3 text-center">
          <div className="rounded-xl border border-line p-3">
            <dt className="text-xs text-muted">מחיר מקורי</dt>
            <dd className="ltr-nums mt-1 text-lg font-bold text-muted line-through">
              {formatIls(update.originalPrice)} ₪
            </dd>
          </div>
          <div className="rounded-xl border-2 border-alert p-3">
            <dt className="text-xs text-muted">מחיר מעודכן</dt>
            <dd className="ltr-nums mt-1 text-lg font-bold text-alert">
              {formatIls(update.newPrice)} ₪
            </dd>
          </div>
          <div className="rounded-xl border border-line p-3">
            <dt className="text-xs text-muted">ההפרש</dt>
            <dd className="ltr-nums mt-1 text-lg font-bold text-ink">
              {delta > 0 ? "+" : ""}
              {formatIls(delta)} ₪
            </dd>
          </div>
        </dl>

        <form action={formAction} className="flex flex-wrap gap-3">
          <input type="hidden" name="priceUpdateId" value={update.id} />
          <input type="hidden" name="jobId" value={update.jobId} />

          <button
            type="submit"
            name="decision"
            value="approve"
            disabled={pending}
            className="min-w-40 flex-1 rounded-xl bg-cta px-5 py-3 text-base font-bold text-white transition-colors hover:bg-cta-strong disabled:opacity-60"
          >
            מאשר את המחיר המעודכן
          </button>

          <button
            type="submit"
            name="decision"
            value="reject"
            disabled={pending}
            className="min-w-40 flex-1 rounded-xl border border-line bg-surface px-5 py-3 text-base font-bold text-ink transition-colors hover:bg-canvas disabled:opacity-60"
          >
            לא מאשר
          </button>
        </form>

        <p className="text-sm text-muted">
          אם לא תאשרו — העבודה ממשיכה במחיר המקורי,{" "}
          <span className="ltr-nums font-semibold text-ink">
            {formatIls(update.originalPrice)}
          </span>{" "}
          ₪. זה כלל מערכת, לא הבטחה של בעל המקצוע.
        </p>

        {state.error && <ErrorText>{state.error}</ErrorText>}
      </div>
    </section>
  );
}
