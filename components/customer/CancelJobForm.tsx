"use client";

import { useActionState, useState } from "react";
import { cancelJob, type CancellationState } from "@/lib/actions/cancellation";
import {
  BUTTON_QUIET,
  ErrorText,
  SECTION_TITLE,
} from "@/components/ui/primitives";
import {
  CANCEL_REASON_LABEL,
  CUSTOMER_CANCEL_REASONS,
} from "@/lib/validation/cancellation";

const INITIAL: CancellationState = {};

/**
 * "ביטול הקריאה" (Phase 15) — until a pro takes the job, the customer's own
 * decision, and free for everyone: nobody has paid yet.
 *
 * Folded behind a quiet button, and asking why: a cancel that is one stray tap
 * away on the screen where offers arrive would cost pros who were pricing it,
 * and the reason is the only thing that tells us whether the call was solved,
 * lost to somebody else, or never needed.
 */
export function CancelJobForm({ jobId }: { jobId: string }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(cancelJob, INITIAL);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full text-sm font-semibold text-muted underline underline-offset-2 hover:text-alert"
      >
        ביטול הקריאה
      </button>
    );
  }

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="jobId" value={jobId} />
      <h2 className={SECTION_TITLE}>לבטל את הקריאה?</h2>
      <p className="text-sm text-muted">
        הביטול ללא עלות. כל ההצעות שהתקבלו ייסגרו, ובעלי המקצוע שהציעו יקבלו
        הודעה.
      </p>

      <fieldset>
        <legend className="mb-2 text-sm font-semibold text-ink">
          למה מבטלים?
        </legend>
        <div className="space-y-2">
          {CUSTOMER_CANCEL_REASONS.map((reason) => (
            <label
              key={reason}
              className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-line px-4 text-sm text-ink has-checked:border-brand has-checked:bg-brand-soft"
            >
              <input type="radio" name="reason" value={reason} required />
              {CANCEL_REASON_LABEL[reason]}
            </label>
          ))}
        </div>
      </fieldset>

      {state.error && <ErrorText>{state.error}</ErrorText>}

      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex min-h-11 flex-1 items-center justify-center rounded-xl bg-alert px-5 text-sm font-bold text-white hover:opacity-90 disabled:opacity-60"
        >
          {pending ? "מבטל…" : "כן, לבטל את הקריאה"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className={`${BUTTON_QUIET} flex-1`}
        >
          השאירו אותה פתוחה
        </button>
      </div>
    </form>
  );
}
