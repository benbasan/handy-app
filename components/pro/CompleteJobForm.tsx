"use client";

import { useActionState, useState } from "react";
import { ErrorText } from "@/components/ui/primitives";
import { completeJob } from "@/lib/actions/completion";
import { EMPTY_COMPLETE_JOB_STATE } from "@/lib/actions/state";
import {
  commissionOf,
  netOf,
  PAYMENT_METHODS,
  type PaymentMethod,
} from "@/lib/validation/completion";
import { formatIls } from "@/lib/validation/priceUpdates";
import { PAYMENT_METHOD_LABEL } from "@/lib/validation/pros";

/**
 * "מחיר מאושר לקריאה · סיימתי — עדכן גבייה" — the green card in the sidebar of
 * design/screens/pro-3.1-manage-job-price-update.png. Phase 5 drew the price
 * and left the button out, because pressing it has to create a commission row
 * and a receipt. This is that button.
 *
 * One question stands between the pro and the close: **how were you paid.**
 * Handy never touches the money (business rule 4) — it records the collection
 * so it can charge its 12% and issue a receipt, and the pro is the person who
 * was actually handed the cash or the Bit transfer. Nothing else on this form
 * is sent: the total is `job_effective_price()` and the commission is computed
 * inside `complete_job()`.
 *
 * The two numbers under the buttons are shown *before* the press on purpose.
 * A pro should never learn what Handy took by reading it on a statement
 * afterwards, and the arithmetic here is the same arithmetic the database
 * performs — `commissionOf()` exists to keep the two from drifting.
 */
export function CompleteJobForm({
  jobId,
  totalPrice,
  acceptedMethods,
}: {
  jobId: string;
  /** job_effective_price(): the bid plus every update the customer approved. */
  totalPrice: number;
  /** What this pro said they accept, in onboarding. A hint for the order, not a gate. */
  acceptedMethods: readonly PaymentMethod[];
}) {
  const [state, formAction, pending] = useActionState(
    completeJob,
    EMPTY_COMPLETE_JOB_STATE,
  );

  const [method, setMethod] = useState<PaymentMethod | null>(null);

  // The pro's own list first, the rest after it: a customer can always pay by
  // something the pro did not tick, and a receipt that cannot say so would be
  // a receipt that lies.
  const ordered = [
    ...PAYMENT_METHODS.filter((candidate) => acceptedMethods.includes(candidate)),
    ...PAYMENT_METHODS.filter(
      (candidate) => !acceptedMethods.includes(candidate),
    ),
  ];

  const commission = commissionOf(totalPrice);
  const net = netOf(totalPrice);

  return (
    <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold text-muted">מחיר מאושר לקריאה</h2>
        <p className="text-2xl font-bold text-ink">
          <span className="ltr-nums">{formatIls(totalPrice)}</span> ₪
        </p>
      </div>

      <form action={formAction} className="mt-4">
        <input type="hidden" name="jobId" value={jobId} />
        <input type="hidden" name="paymentMethod" value={method ?? ""} />

        <fieldset>
          <legend className="text-sm font-semibold text-ink">
            איך נגבה התשלום?
          </legend>
          <p className="mt-1 text-sm text-muted">
            התשלום עובר ישירות אליך. Handy רק מתעדת אותו לצורך הקבלה והעמלה.
          </p>

          <div className="mt-3 flex flex-wrap gap-2">
            {ordered.map((candidate) => {
              const chosen = method === candidate;
              return (
                <button
                  key={candidate}
                  type="button"
                  onClick={() => setMethod(candidate)}
                  aria-pressed={chosen}
                  className={`rounded-xl border px-4 py-2 text-sm font-semibold transition-colors ${
                    chosen
                      ? "border-pro bg-pro-soft text-pro"
                      : "border-line bg-surface text-ink hover:bg-canvas"
                  }`}
                >
                  {PAYMENT_METHOD_LABEL[candidate]}
                </button>
              );
            })}
          </div>
        </fieldset>

        <button
          type="submit"
          disabled={pending || method === null}
          className="mt-5 w-full rounded-xl bg-cta px-5 py-3 text-base font-bold text-white transition-colors hover:bg-cta-strong disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "סוגר את העבודה…" : "סיימתי — עדכן גבייה"}
        </button>

        <dl className="mt-4 space-y-2 border-t border-line pt-4 text-sm">
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted">עמלת Handy (12%)</dt>
            <dd className="ltr-nums font-semibold text-ink">
              {formatIls(commission)} ₪
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted">נטו אליך</dt>
            <dd className="ltr-nums text-lg font-bold text-cta-strong">
              {formatIls(net)} ₪
            </dd>
          </div>
        </dl>

        {state.error && (
          <div className="mt-3">
            <ErrorText>{state.error}</ErrorText>
          </div>
        )}
      </form>
    </section>
  );
}
