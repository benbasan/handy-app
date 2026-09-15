"use client";

import { useActionState, useState } from "react";
import {
  rateCustomer,
  type CancellationState,
} from "@/lib/actions/cancellation";
import { ErrorText, INPUT_CLASS } from "@/components/ui/primitives";
import { StarIcon } from "@/components/ui/icons";
import { CUSTOMER_RATING_COMMENT_MAX } from "@/lib/validation/cancellation";

const INITIAL: CancellationState = {};

/**
 * "דרגו את הלקוח" (Phase 15) — private. Only Handy's team reads it, by the
 * user's decision: it exists to notice the customer who is a pattern, not to
 * let a pro pre-judge the next stranger's call. The form says so, because a
 * rating somebody believes is public is a different rating.
 */
export function RateCustomerForm({
  jobId,
  alreadyRated,
}: {
  jobId: string;
  alreadyRated: boolean;
}) {
  const [state, formAction, pending] = useActionState(rateCustomer, INITIAL);
  const [open, setOpen] = useState(false);

  if (alreadyRated || state.saved) {
    return (
      <p className="text-sm text-muted">
        ✓ דירגת את הלקוח. הדירוג נשמר אצל צוות Handy בלבד.
      </p>
    );
  }

  // Folded, like the dispute below it: a history of ten jobs must not be ten
  // open forms.
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-sm font-semibold text-pro underline-offset-2 hover:underline"
      >
        דרגו את הלקוח (פרטי)
      </button>
    );
  }

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="jobId" value={jobId} />
      <fieldset>
        <legend className="text-sm font-semibold text-ink">
          איך היה לעבוד עם הלקוח?{" "}
          <span className="font-normal text-muted">
            (פרטי — רק צוות Handy רואה)
          </span>
        </legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {[1, 2, 3, 4, 5].map((value) => (
            <label
              key={value}
              className="inline-flex min-h-11 cursor-pointer items-center gap-1 rounded-xl border border-line px-3 text-sm font-semibold text-ink has-checked:border-pro has-checked:bg-pro has-checked:text-white"
            >
              <input
                type="radio"
                name="rating"
                value={value}
                required
                className="sr-only"
              />
              <span className="ltr-nums">{value}</span>
              <StarIcon filled className="size-3.5" />
            </label>
          ))}
        </div>
      </fieldset>
      <label className="block">
        <span className="sr-only">הערה לצוות Handy</span>
        <input
          name="comment"
          maxLength={CUSTOMER_RATING_COMMENT_MAX}
          placeholder="הערה לצוות Handy (לא חובה)"
          className={INPUT_CLASS}
        />
      </label>
      {state.error && <ErrorText>{state.error}</ErrorText>}
      <button
        type="submit"
        disabled={pending}
        className="inline-flex min-h-11 items-center rounded-xl border border-line px-4 text-sm font-semibold text-ink hover:border-pro disabled:opacity-60"
      >
        {pending ? "שומר…" : "שמירת הדירוג"}
      </button>
    </form>
  );
}
