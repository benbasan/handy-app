"use client";

import { useActionState } from "react";
import { submitBid } from "@/lib/actions/bids";
import { EMPTY_BID_FORM_STATE } from "@/lib/actions/state";
import { BUTTON_QUIET, ErrorText } from "@/components/ui/primitives";
import { formatIls } from "@/lib/validation/priceUpdates";

/**
 * "הצעה מהירה" (Phase 16) — the pro's own last offer in this trade, sent in one
 * tap from the feed. The feed's speed note says the customer chooses from the
 * offers already on the table; this is the answer to it rather than a repeat of
 * the advice.
 *
 * It goes through `submitBid`, so everything a full offer is held to holds
 * here: the insert policy, `can_bid_on_job()`, and the arrival-window trigger —
 * which is why the card never offers this on a call for today or tomorrow. The
 * offer can be edited afterwards like any other.
 */
export function QuickBidButton({
  jobId,
  price,
  etaMinutes,
}: {
  jobId: string;
  price: number;
  etaMinutes: number;
}) {
  const [state, formAction, pending] = useActionState(
    submitBid,
    EMPTY_BID_FORM_STATE,
  );

  if (state.saved) {
    return (
      <p
        role="status"
        className="text-center text-sm font-semibold text-cta-strong"
      >
        ✓ ההצעה נשלחה
      </p>
    );
  }

  return (
    <form action={formAction} className="space-y-1">
      <input type="hidden" name="jobId" value={jobId} />
      <input type="hidden" name="price" value={price} />
      <input type="hidden" name="etaMinutes" value={etaMinutes} />
      <input type="hidden" name="note" value="" />
      <input type="hidden" name="quick" value="1" />
      <button
        type="submit"
        disabled={pending}
        className={`${BUTTON_QUIET} w-full`}
      >
        {pending ? (
          "שולח…"
        ) : (
          <>
            הצעה מהירה · <span className="ltr-nums">{formatIls(price)}</span> ₪
          </>
        )}
      </button>
      <p className="text-center text-xs text-muted">
        כמו ההצעה האחרונה שלך בתחום ·{" "}
        <span className="ltr-nums">{etaMinutes}</span> דק׳
      </p>
      {state.error && <ErrorText>{state.error}</ErrorText>}
    </form>
  );
}
