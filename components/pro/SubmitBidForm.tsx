"use client";

import { useActionState, useState } from "react";
import { BUTTON_PRO, ErrorText, INPUT_CLASS } from "@/components/ui/primitives";
import { submitBid, updateBid } from "@/lib/actions/bids";
import { EMPTY_BID_FORM_STATE } from "@/lib/actions/state";
import type { PriceRange } from "@/lib/supabase/bids";
import {
  BID_NOTE_MAX,
  BID_VALIDITY_MINUTES,
  DEFAULT_BID_PRICE,
  DEFAULT_ETA_MINUTES,
  ETA_LABEL,
  ETA_OPTIONS,
  MAX_BID_PRICE,
  MIN_BID_PRICE,
  PRICE_STEP,
} from "@/lib/validation/bids";
import { commissionBreakdown } from "@/lib/validation/pros";

/**
 * design/screens/pro-2.3-submit-bid.png — the dark price card on the leading
 * edge, the commission breakdown under it, and the ETA chips plus note in the
 * main column.
 *
 * The commission arithmetic runs live as the pro types, because that is the
 * number the screen exists to make unmissable: 12% off the price, and what is
 * actually left. It is a *display* of business rule 3, never an input —
 * nothing here submits a commission, and the server recomputes it from the
 * price when it matters (Phase 6).
 *
 * The same component serves "עדכן הצעה" on the offers list: the two actions
 * write the same four fields, and re-pricing a live bid restarts its 45
 * minutes in the database's own trigger.
 */
export function SubmitBidForm({
  jobId,
  bidId,
  initialPrice,
  initialEta,
  initialNote,
  priceRange,
}: {
  jobId: string;
  /** Present when editing an offer already sent. */
  bidId?: string;
  initialPrice?: number;
  initialEta?: number;
  initialNote?: string | null;
  priceRange: PriceRange | null;
}) {
  const [state, formAction, pending] = useActionState(
    bidId ? updateBid : submitBid,
    EMPTY_BID_FORM_STATE,
  );

  const [price, setPrice] = useState(initialPrice ?? DEFAULT_BID_PRICE);
  const [eta, setEta] = useState(initialEta ?? DEFAULT_ETA_MINUTES);

  const { commission, net } = commissionBreakdown(price);

  // The three quick prices in the design. Anchored on what the pro has already
  // chosen, so they stay useful after a nudge rather than jumping back.
  const quickPrices = [price + PRICE_STEP * 3, price, price - PRICE_STEP * 3]
    .filter((value) => value >= MIN_BID_PRICE && value <= MAX_BID_PRICE)
    .filter((value, index, all) => all.indexOf(value) === index);

  const clamp = (value: number) =>
    Math.min(MAX_BID_PRICE, Math.max(MIN_BID_PRICE, value));

  return (
    <form
      action={formAction}
      className="grid gap-6 lg:grid-cols-[22rem_minmax(0,1fr)] lg:items-start"
    >
      {bidId ? (
        <input type="hidden" name="bidId" value={bidId} />
      ) : (
        <input type="hidden" name="jobId" value={jobId} />
      )}
      <input type="hidden" name="price" value={price} />
      <input type="hidden" name="etaMinutes" value={eta} />

      <div className="space-y-4 lg:order-1">
        <div className="rounded-2xl bg-ink p-6 text-white">
          <p className="text-center text-sm text-white/70">המחיר שלך ללקוח</p>
          <p className="mt-1 text-center text-5xl font-bold">
            <span className="ltr-nums">{price.toLocaleString("he-IL")}</span> ₪
          </p>

          <div className="mt-5 grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setPrice((value) => clamp(value + PRICE_STEP))}
              aria-label={`העלאת המחיר ב-${PRICE_STEP} שקלים`}
              className="rounded-xl bg-white/10 py-3 text-2xl font-bold hover:bg-white/20"
            >
              +
            </button>
            <button
              type="button"
              onClick={() => setPrice((value) => clamp(value - PRICE_STEP))}
              aria-label={`הורדת המחיר ב-${PRICE_STEP} שקלים`}
              className="rounded-xl bg-white/10 py-3 text-2xl font-bold hover:bg-white/20"
            >
              −
            </button>
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2">
            {quickPrices.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setPrice(value)}
                aria-pressed={value === price}
                className={`rounded-xl py-2 text-sm font-semibold transition-colors ${
                  value === price
                    ? "bg-pro text-white"
                    : "bg-white/10 text-white hover:bg-white/20"
                }`}
              >
                <span className="ltr-nums">
                  {value.toLocaleString("he-IL")}
                </span>{" "}
                ₪
              </button>
            ))}
          </div>

          <label className="mt-3 block">
            <span className="sr-only">מחיר מדויק בשקלים</span>
            <input
              type="number"
              inputMode="numeric"
              min={MIN_BID_PRICE}
              max={MAX_BID_PRICE}
              value={price}
              onChange={(event) => setPrice(Number(event.target.value) || 0)}
              onBlur={(event) =>
                setPrice(clamp(Number(event.target.value) || MIN_BID_PRICE))
              }
              className="ltr-nums block w-full rounded-xl bg-white/10 px-4 py-2 text-center text-base font-semibold text-white outline-none focus:bg-white/20"
            />
          </label>

          <p className="mt-4 text-center text-xs text-white/60">
            {priceRange ? (
              <>
                טווח מחירים לקריאות דומות באזור:{" "}
                <span className="ltr-nums">
                  {priceRange.min.toLocaleString("he-IL")}–
                  {priceRange.max.toLocaleString("he-IL")}
                </span>{" "}
                ₪ · לפי{" "}
                <span className="ltr-nums">{priceRange.sampleCount}</span> הצעות
              </>
            ) : (
              "עוד אין מספיק הצעות באזור כדי להציג טווח מחירים אמין."
            )}
          </p>
        </div>

        <div className="rounded-2xl border border-line bg-surface p-6">
          <dl className="divide-y divide-line text-sm">
            <div className="flex items-baseline justify-between gap-3 pb-3">
              <dt className="text-muted">עמלת Handy (12%)</dt>
              <dd className="font-bold text-ink">
                <span className="ltr-nums">
                  {commission.toLocaleString("he-IL")}
                </span>{" "}
                ₪
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-3 py-3">
              <dt className="text-muted">נטו אליך</dt>
              <dd className="text-xl font-bold text-cta-strong">
                <span className="ltr-nums">{net.toLocaleString("he-IL")}</span>{" "}
                ₪
              </dd>
            </div>
          </dl>

          <button
            type="submit"
            disabled={pending}
            className={`${BUTTON_PRO} mt-4 w-full`}
          >
            {pending ? "שולח…" : bidId ? "עדכון ההצעה" : "שלח הצעה ללקוח"}
          </button>

          <p className="mt-2 text-center text-xs text-muted">
            ההצעה תקפה {BID_VALIDITY_MINUTES} דקות
            {bidId ? " — עדכון מחיר מתחיל את הספירה מחדש." : "."}
          </p>

          {state.error && (
            <div className="mt-3">
              <ErrorText>{state.error}</ErrorText>
            </div>
          )}
          {state.saved && (
            <p
              role="status"
              className="mt-3 text-sm font-semibold text-cta-strong"
            >
              ✓ ההצעה עודכנה.
            </p>
          )}
        </div>
      </div>

      <div className="space-y-6 lg:order-2">
        <fieldset className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
          <legend className="px-1 text-lg font-bold text-ink">זמן הגעה</legend>

          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {ETA_OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setEta(option)}
                aria-pressed={option === eta}
                className={`rounded-xl border px-4 py-3 text-sm font-semibold transition-colors ${
                  option === eta
                    ? "border-pro bg-pro text-white"
                    : "border-line bg-surface text-ink hover:border-pro/40"
                }`}
              >
                {ETA_LABEL[option]}
              </button>
            ))}
          </div>

          {state.fieldErrors?.etaMinutes && (
            <div className="mt-2">
              <ErrorText>{state.fieldErrors.etaMinutes}</ErrorText>
            </div>
          )}
        </fieldset>

        <div className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
          <label htmlFor="bid-note" className="text-lg font-bold text-ink">
            הערה ללקוח
          </label>
          <textarea
            id="bid-note"
            name="note"
            rows={4}
            maxLength={BID_NOTE_MAX}
            defaultValue={initialNote ?? ""}
            placeholder="לדוגמה: אחריות שנה על העבודה, מביא חלקים מקוריים"
            className={`${INPUT_CLASS} mt-3 resize-y`}
          />
          {state.fieldErrors?.note && (
            <div className="mt-2">
              <ErrorText>{state.fieldErrors.note}</ErrorText>
            </div>
          )}
          <p className="mt-2 text-sm text-muted">
            המחיר שהזנתם כולל את הביקור ואת החלקים — אין דמי הגעה נפרדים.
          </p>
        </div>
      </div>
    </form>
  );
}
