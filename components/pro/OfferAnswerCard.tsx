"use client";

import { useActionState } from "react";
import {
  BUTTON_PRO,
  BUTTON_QUIET,
  ErrorText,
  SECTION_TITLE,
} from "@/components/ui/primitives";
import { acceptOffer, declineOffer } from "@/lib/actions/acceptance";
import { EMPTY_ANSWER_OFFER_STATE } from "@/lib/actions/state";
import type { PendingAcceptance } from "@/lib/supabase/bids";
import { Countdown } from "@/components/ui/Countdown";
import { formatIls } from "@/lib/validation/priceUpdates";

/**
 * "נבחרת" — the card a pro answers, and the one place in the product where
 * pressing a button charges them money.
 *
 * Three things are on it before either button: the price they offered, the fee
 * accepting will cost, and how long is left. The fee comes from the database
 * through `my_pending_acceptances()` rather than from the constant, so the
 * number under the button is the number `accept_job()` will write.
 *
 * The deadline is rendered from the row, not from a ticking timer. A countdown
 * that runs in the browser drifts from the database the moment a tab is
 * backgrounded, and the only clock that decides anything is the one inside
 * `accept_job()` — a stale minute here is refused there, which is the right way
 * round for a screen that cannot be trusted with money.
 */
export function OfferAnswerCard({ offer }: { offer: PendingAcceptance }) {
  const [state, formAction, pending] = useActionState(
    acceptOffer,
    EMPTY_ANSWER_OFFER_STATE,
  );
  const [declineState, declineAction, declining] = useActionState(
    declineOffer,
    EMPTY_ANSWER_OFFER_STATE,
  );

  const error = state.error ?? declineState.error;
  const busy = pending || declining;

  return (
    <section className="animate-attention rounded-2xl border-2 border-pro bg-pro-soft p-5 shadow-lift">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-56 flex-1">
          <p className="text-sm font-bold text-pro">
            הלקוח בחר בך — צריך את האישור שלך
          </p>
          <h2 className={`mt-1 ${SECTION_TITLE}`}>
            {offer.description.split("\n")[0]!.slice(0, 70)}
          </h2>
          {/* text-ink/75 rather than text-muted: #64748b on this card's
              tinted ground is 4.2:1, and axe is right that it fails AA. */}
          <p className="mt-1 text-sm text-ink/75">
            {offer.customerName ?? "לקוח"} · {offer.addressText} ·{" "}
            {offer.categoryName}
          </p>
        </div>

        <div className="text-end">
          <p className="text-2xl font-bold text-ink">
            <span className="ltr-nums">{formatIls(offer.price)}</span> ₪
          </p>
          {/* Ticks. See components/ui/Countdown.tsx for why that reverses the
              comment that used to be at the top of this file, and for the half
              of it that still stands: accept_job() re-reads this deadline and
              is the only thing that decides. */}
          <Countdown deadline={offer.acceptDeadline} className="mt-1 text-sm" />
        </div>
      </div>

      {/* One fact per line: a price, a fee and a deadline in one sentence is
          three bidi runs and reads in the wrong order. */}
      <p className="mt-4 rounded-xl bg-surface p-3 text-sm text-ink">
        אישור מחייב אותך להגיע ולבצע את העבודה, וגובה{" "}
        <span className="ltr-nums font-bold">{formatIls(offer.feeAmount)}</span>{" "}
        ₪ דמי קבלת עבודה. ויתור לא עולה כלום.
      </p>

      <div className="mt-4 flex flex-wrap gap-3">
        <form action={formAction} className="flex-1">
          <input type="hidden" name="bidId" value={offer.bidId} />
          <button
            type="submit"
            disabled={busy}
            className={`${BUTTON_PRO} w-full`}
          >
            {pending
              ? "מאשר…"
              : `אשר וקח את העבודה · ${formatIls(offer.feeAmount)} ₪`}
          </button>
        </form>

        <form action={declineAction}>
          <input type="hidden" name="bidId" value={offer.bidId} />
          <button
            type="submit"
            disabled={busy}
            className={`${BUTTON_QUIET} text-muted hover:text-ink`}
          >
            {declining ? "מוותר…" : "ויתור"}
          </button>
        </form>
      </div>

      {error && (
        <div className="mt-3">
          <ErrorText>{error}</ErrorText>
        </div>
      )}
    </section>
  );
}
