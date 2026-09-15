"use client";

import { useActionState, useState } from "react";
import {
  cancelAssignedJob,
  type CancellationState,
} from "@/lib/actions/cancellation";
import { BUTTON_QUIET, ErrorText } from "@/components/ui/primitives";

const INITIAL: CancellationState = {};

/**
 * "הלקוח ביטל את העבודה" (Phase 15) — the pro reports a cancellation the
 * customer asked for after the job was taken, and the fee they paid comes back
 * as a credit on their next job.
 *
 * The screen says plainly that the customer is told and can dispute it. That
 * sentence is the deterrent: the credit is only safe to give because a
 * cancellation that never happened has a witness.
 */
export function CancelAssignedJobForm({
  jobId,
  feeAmount,
  admin = false,
}: {
  jobId: string;
  /** What was charged for this job — and so what the credit will be. */
  feeAmount: number | null;
  admin?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(
    cancelAssignedJob,
    INITIAL,
  );

  if (state.saved) {
    return (
      <p role="status" className="text-sm font-semibold text-cta-strong">
        ✓ העבודה בוטלה.
      </p>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full text-sm font-semibold text-muted underline underline-offset-2 hover:text-alert"
      >
        {admin ? "ביטול העבודה" : "הלקוח ביטל את העבודה"}
      </button>
    );
  }

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="jobId" value={jobId} />
      <p className="text-sm text-ink">
        {admin
          ? "העבודה תבוטל, הלקוח ובעל המקצוע יקבלו הודעה"
          : "העבודה תבוטל והלקוח יקבל הודעה על כך"}
        {feeAmount && feeAmount > 0
          ? ` — ובעל המקצוע יקבל זיכוי של ${feeAmount} ₪ לעבודה הבאה שיאשר.`
          : ". דמי קבלת עבודה לא נגבו על העבודה הזו, ולכן אין זיכוי."}
      </p>
      {!admin && (
        <p className="text-sm text-muted">
          אם הלקוח לא ביקש לבטל, הוא יכול לפנות לצוות Handy, והמקרה ייבדק.
        </p>
      )}

      {state.error && <ErrorText>{state.error}</ErrorText>}

      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex min-h-11 flex-1 items-center justify-center rounded-xl bg-alert px-5 text-sm font-bold text-white hover:opacity-90 disabled:opacity-60"
        >
          {pending ? "מבטל…" : "כן, לבטל"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className={`${BUTTON_QUIET} flex-1`}
        >
          חזרה
        </button>
      </div>
    </form>
  );
}
