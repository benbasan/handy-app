"use client";

import { useActionState } from "react";
import {
  BUTTON_BASE,
  ErrorText,
  INPUT_CLASS,
} from "@/components/ui/primitives";
import { openDispute } from "@/lib/actions/disputes";
import { EMPTY_OPEN_DISPUTE_STATE } from "@/lib/actions/state";
import {
  DISPUTE_REASON_MAX,
  DISPUTE_REASON_MIN,
  DISPUTE_STATUS_LABEL,
  type DisputeStatus,
} from "@/lib/validation/disputes";

/**
 * "משהו לא תקין בחיוב?" — the one door from either side of a job into the
 * admin console.
 *
 * Phase 6 named this moment without building it: the four payment chips on the
 * customer's summary screen show what the pro recorded and are not a form,
 * because Handy is not a party to the payment (business rule 4) and cannot
 * know what happened. A gap between what was recorded and what the customer
 * remembers is a dispute, and this is where it is opened.
 *
 * Collapsed behind a `<details>` on purpose: a finished job is overwhelmingly
 * a job that went fine, and a complaint box standing open beside a receipt
 * invites a complaint. It is one click away, not zero and not five.
 *
 * The same component serves the pro (product-spec.md 5.4 lets either side open
 * a case; the policy on `disputes` is what decides, not a role name here).
 */
export function DisputeOpener({
  jobId,
  existingStatus,
  tone = "brand",
}: {
  jobId: string;
  /** A live or decided case on this job — one per job is all there can be. */
  existingStatus?: DisputeStatus;
  tone?: "brand" | "pro";
}) {
  const [state, formAction, pending] = useActionState(
    openDispute,
    EMPTY_OPEN_DISPUTE_STATE,
  );

  if (existingStatus || state.opened) {
    return (
      <div className="rounded-2xl border border-line bg-surface p-5">
        <h2 className="font-bold text-ink">פנייה לצוות Handy</h2>
        <p className="mt-2 text-sm text-muted">
          {existingStatus
            ? `הפנייה שלכם על הקריאה הזו נמצאת בסטטוס: ${DISPUTE_STATUS_LABEL[existingStatus]}.`
            : "הפנייה נפתחה. צוות Handy בודק אותה מול תיעוד הקריאה המלא."}
        </p>
      </div>
    );
  }

  return (
    <details className="rounded-2xl border border-line bg-surface p-5">
      <summary className="cursor-pointer font-bold text-ink">
        משהו לא תקין בחיוב?
      </summary>

      <p className="mt-2 text-sm text-muted">
        צוות Handy בודק כל פנייה מול תיעוד הקריאה המלא — ההצעה שנבחרה, התמונות,
        אישורי המחיר וההתכתבות. כתבו מה קרה.
      </p>

      <form action={formAction} className="mt-4 space-y-3">
        <input type="hidden" name="jobId" value={jobId} />

        <label htmlFor={`dispute-reason-${jobId}`} className="sr-only">
          מה קרה
        </label>
        <textarea
          id={`dispute-reason-${jobId}`}
          name="reason"
          rows={4}
          minLength={DISPUTE_REASON_MIN}
          maxLength={DISPUTE_REASON_MAX}
          required
          className={INPUT_CLASS}
          placeholder="למשל: נרשם שהתשלום נגבה במזומן, אבל שילמתי בביט."
        />

        <button
          type="submit"
          disabled={pending}
          className={`${BUTTON_BASE} px-5 py-2.5 text-sm text-white ${
            tone === "pro"
              ? "bg-pro hover:bg-pro-strong"
              : "bg-brand hover:bg-brand-strong"
          }`}
        >
          שלח פנייה
        </button>

        {state.error && <ErrorText>{state.error}</ErrorText>}
      </form>
    </details>
  );
}
