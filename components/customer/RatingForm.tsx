"use client";

import { useActionState, useState } from "react";
import { ErrorText, INPUT_CLASS } from "@/components/ui/primitives";
import { submitJobReview } from "@/lib/actions/completion";
import { EMPTY_REVIEW_FORM_STATE } from "@/lib/actions/state";
import { MAX_RATING, REVIEW_COMMENT_MAX } from "@/lib/validation/completion";

/**
 * "איך היה השירות?" — design/screens/customer-4.1-summary-receipt-rating.png:
 * five stars and an optional sentence for other customers.
 *
 * Five real radio inputs behind the stars rather than buttons and a hidden
 * field: this is a single choice out of five, which is what a radio group is,
 * and it means the control works with a keyboard and reads correctly to a
 * screen reader without a word of ARIA. The stars are the labels.
 *
 * A rating already given comes back as `saved`, and the form stays on the page
 * — the receipt and the save-for-next-time card are on the same screen, and a
 * redirect would take the customer away from the download they came for.
 */
export function RatingForm({
  jobId,
  existingRating,
  existingComment,
  proName,
}: {
  jobId: string;
  existingRating: number | null;
  existingComment: string | null;
  proName: string | null;
}) {
  const [state, formAction, pending] = useActionState(
    submitJobReview,
    EMPTY_REVIEW_FORM_STATE,
  );

  // The server's answer wins over the prop until the router catches up.
  const saved = state.rating ?? existingRating;
  const [rating, setRating] = useState<number | null>(existingRating);

  const chosen = rating ?? saved;

  return (
    <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-bold text-ink">איך היה השירות?</h2>
        {saved !== null && (
          <p className="text-sm font-semibold text-cta-strong" role="status">
            הדירוג נשמר — תודה!
          </p>
        )}
      </div>

      <form action={formAction} className="mt-4 space-y-4">
        <input type="hidden" name="jobId" value={jobId} />

        <fieldset>
          <legend className="sr-only">
            דירוג {proName ?? "בעל המקצוע"}, בין כוכב אחד לחמישה
          </legend>

          {/* row-reverse so one star sits on the leading (right) edge in RTL,
              which is the direction the design's row fills from. */}
          <div className="flex flex-row-reverse justify-end gap-2">
            {Array.from({ length: MAX_RATING }, (_, index) => {
              const value = MAX_RATING - index;
              const lit = chosen !== null && value <= chosen;
              return (
                <label
                  key={value}
                  className={`flex size-14 cursor-pointer items-center justify-center rounded-xl text-2xl transition-colors ${
                    lit
                      ? "bg-cta/15 text-cta-strong"
                      : "bg-canvas text-muted hover:bg-line"
                  } has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand/40`}
                >
                  <input
                    type="radio"
                    name="rating"
                    value={value}
                    checked={chosen === value}
                    onChange={() => setRating(value)}
                    className="sr-only"
                  />
                  <span aria-hidden>★</span>
                  <span className="sr-only">
                    {value} {value === 1 ? "כוכב" : "כוכבים"}
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <label className="block">
          <span className="sr-only">ביקורת</span>
          <textarea
            name="comment"
            rows={3}
            defaultValue={existingComment ?? ""}
            maxLength={REVIEW_COMMENT_MAX}
            placeholder="מה כדאי שלקוחות אחרים ידעו? (אופציונלי)"
            className={INPUT_CLASS}
          />
        </label>

        <button
          type="submit"
          disabled={pending || chosen === null}
          className="rounded-xl bg-brand px-5 py-3 text-base font-bold text-white transition-colors hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "שומר…" : saved !== null ? "עדכון הדירוג" : "שליחת הדירוג"}
        </button>

        {state.error && <ErrorText>{state.error}</ErrorText>}
      </form>
    </section>
  );
}
