"use client";

import Link from "next/link";
import { useActionState } from "react";
import {
  BUTTON_COMPACT,
  BUTTON_QUIET,
  ErrorText,
} from "@/components/ui/primitives";
import { withdrawSelection } from "@/lib/actions/bids";
import { EMPTY_WITHDRAW_SELECTION_STATE } from "@/lib/actions/state";
import { CUSTOMER_ROUTES } from "@/lib/routes";
import type { JobBid } from "@/lib/supabase/bids";
import { timeLeftLabel } from "@/lib/validation/bids";

/**
 * "ממתינים לאישור בעל המקצוע" — the state Phase 10 put between choosing and
 * being assigned.
 *
 * The important thing on it is not the clock, it is the second button: the
 * customer is not stuck for two hours. They can take the offer back, and every
 * other card on the screen stayed live precisely so there is somewhere to take
 * it to.
 */
export function WaitingForProCard({
  bid,
  jobId,
  otherLiveCount,
}: {
  bid: JobBid;
  jobId: string;
  /** Offers still choosable right now — what "בחירת מישהו אחר" would reach. */
  otherLiveCount: number;
}) {
  const [state, formAction, pending] = useActionState(
    withdrawSelection,
    EMPTY_WITHDRAW_SELECTION_STATE,
  );

  return (
    <div className="rounded-2xl border border-brand bg-brand/5 p-4">
      <p className="text-sm font-semibold text-brand">
        בחרתם ב{bid.proName ?? "בעל המקצוע"} על סך{" "}
        <span className="ltr-nums">{bid.price.toLocaleString("he-IL")}</span> ₪.
        ממתינים לאישור שלו
        {bid.acceptDeadline ? ` · ${timeLeftLabel(bid.acceptDeadline)}` : ""}.
      </p>

      {/* One sentence per line: what happens if they answer, and what happens
          if they do not. */}
      <p className="mt-2 text-sm text-muted">
        הקריאה תשובץ אליו ברגע שיאשר. אם לא יאשר בזמן — היא חוזרת אליכם
        אוטומטית, וההצעות האחרות עדיין פתוחות.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <form action={formAction}>
          <input type="hidden" name="jobId" value={jobId} />
          <button
            type="submit"
            disabled={pending}
            className={`${BUTTON_QUIET} ${BUTTON_COMPACT}`}
          >
            {pending ? "מבטלים…" : "בטלו את הבחירה"}
          </button>
        </form>

        <p className="text-sm text-muted">
          {otherLiveCount > 0
            ? `אפשר גם לבחור באחת מ-${otherLiveCount} ההצעות האחרות ישירות.`
            : "אין כרגע הצעה אחרת פעילה על הקריאה."}
        </p>

        <Link
          href={`${CUSTOMER_ROUTES.chat(jobId)}?pro=${bid.proId}`}
          className="text-sm font-semibold text-brand underline"
        >
          שליחת הודעה
        </Link>
      </div>

      {state.error && (
        <div className="mt-3">
          <ErrorText>{state.error}</ErrorText>
        </div>
      )}
    </div>
  );
}
