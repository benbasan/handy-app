"use client";

import { useActionState } from "react";
import {
  BUTTON_QUIET,
  ErrorText,
  INPUT_CLASS,
} from "@/components/ui/primitives";
import { replyToReview } from "@/lib/actions/publicProfile";
import {
  EMPTY_REVIEW_REPLY_STATE,
  type ReviewReplyState,
} from "@/lib/actions/state";
import { REVIEW_REPLY_MAX } from "@/lib/validation/publicProfile";

/**
 * "מענה לביקורות" — product-spec.md 4.8.
 *
 * The reply goes through `reply_to_review()`, not through an update: the two
 * halves of a review belong to different people, and neither has a column
 * grant on the other's. A pro who is not the one who did the job gets 42501
 * from the database, whatever this form sends.
 */
export function ReviewReplyForm({
  reviewId,
  existing,
}: {
  reviewId: string;
  existing: string | null;
}) {
  const [state, action, pending] = useActionState<ReviewReplyState, FormData>(
    replyToReview,
    EMPTY_REVIEW_REPLY_STATE,
  );

  const saved = state.repliedTo === reviewId;

  return (
    <form action={action} className="mt-3">
      <input type="hidden" name="reviewId" value={reviewId} />

      <label htmlFor={`reply-${reviewId}`} className="sr-only">
        תגובה לביקורת
      </label>
      <textarea
        id={`reply-${reviewId}`}
        name="reply"
        rows={2}
        maxLength={REVIEW_REPLY_MAX}
        defaultValue={existing ?? ""}
        placeholder="תשובה קצרה ללקוח — היא מוצגת בעמוד הציבורי שלכם."
        className={INPUT_CLASS}
      />

      {state.error && <ErrorText>{state.error}</ErrorText>}

      <div className="mt-2 flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className={`${BUTTON_QUIET} px-4 py-2 text-sm`}
        >
          {pending ? "שולח…" : existing ? "עדכן תגובה" : "השב"}
        </button>
        {saved && (
          <p role="status" className="text-sm font-semibold text-cta-strong">
            ✓ נשמר
          </p>
        )}
      </div>
    </form>
  );
}
