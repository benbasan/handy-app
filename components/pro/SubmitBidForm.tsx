"use client";

import { useActionState, useState } from "react";
import {
  BUTTON_PRO,
  CARD_BASE,
  CARD_CLASS,
  ErrorText,
  INPUT_CLASS,
  SECTION_TITLE,
} from "@/components/ui/primitives";
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
import { ACCEPTANCE_FEE, feeBreakdown } from "@/lib/validation/pros";
import {
  ARRIVAL_SLOT_WIDTH_HOURS,
  dayLabel,
  openSlots,
  windowDayOptions,
  windowOffered,
  windowRequired,
} from "@/lib/validation/arrivalWindow";

/**
 * design/screens/pro-2.3-submit-bid.png — the dark price card on the leading
 * edge, the commission breakdown under it, and the ETA chips plus note in the
 * main column.
 *
 * The net runs live as the pro types, because that is the number the screen
 * exists to make unmissable: what is actually left after Handy's fee. The fee
 * itself no longer moves with the price — it is a flat 35 ₪ — and the line
 * under it says the thing that matters more than its size: it is charged only
 * if this offer is chosen *and* the pro then accepts. It is a *display* of
 * business rule 3, never an input.
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
  preferredTime = null,
  now,
  fee = ACCEPTANCE_FEE,
  feeReason = null,
}: {
  jobId: string;
  /** Present when editing an offer already sent. */
  bidId?: string;
  initialPrice?: number;
  initialEta?: number;
  initialNote?: string | null;
  priceRange: PriceRange | null;
  /**
   * When the customer asked for the work. Decides whether the form asks for
   * an arrival window and which days it offers. Not passed when editing: an
   * edit keeps the window the offer already has.
   */
  preferredTime?: string | null;
  /** The server's clock at render, so the open slots are the same on both sides of hydration. */
  now?: string;
  /** What accepting this job would charge this pro (`my_fee_for_job()`). */
  fee?: number;
  /** Why a zero fee is zero: the new-customer waiver, or a credit (Phase 15). */
  feeReason?: "waiver" | "credit" | null;
}) {
  const [state, formAction, pending] = useActionState(
    bidId ? updateBid : submitBid,
    EMPTY_BID_FORM_STATE,
  );

  const [price, setPrice] = useState(initialPrice ?? DEFAULT_BID_PRICE);
  const [eta, setEta] = useState(initialEta ?? DEFAULT_ETA_MINUTES);

  const { net } = feeBreakdown(price, fee);

  const clockNow = now ? new Date(now) : null;
  const askWindow = !bidId && clockNow !== null && windowOffered(preferredTime);
  const mustWindow = askWindow && windowRequired(preferredTime);
  const days = askWindow
    ? windowDayOptions(preferredTime, clockNow).filter(
        (day) => openSlots(day, clockNow).length > 0,
      )
    : [];
  const [windowDay, setWindowDay] = useState<string | null>(
    mustWindow ? (days[0] ?? null) : null,
  );
  const [windowSlot, setWindowSlot] = useState<number | null>(null);
  const slots = windowDay && clockNow ? openSlots(windowDay, clockNow) : [];

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
      /* The dark price card sits at the trailing (left, in RTL) edge and the
         job's own cards take the wide leading column — the split in
         pro-2.3-submit-bid.png. DOM order is price-first so it leads on a
         phone, where it is the thing the pro came to do. */
      className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start"
    >
      {bidId ? (
        <input type="hidden" name="bidId" value={bidId} />
      ) : (
        <input type="hidden" name="jobId" value={jobId} />
      )}
      <input type="hidden" name="price" value={price} />
      <input type="hidden" name="etaMinutes" value={eta} />
      {askWindow && windowDay !== null && windowSlot !== null && (
        <>
          <input type="hidden" name="windowDay" value={windowDay} />
          <input type="hidden" name="windowSlot" value={windowSlot} />
        </>
      )}

      <div className="order-1 space-y-4 lg:order-2">
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

        <div className={`${CARD_BASE} p-6`}>
          <dl className="divide-y divide-line text-sm">
            <div className="flex items-baseline justify-between gap-3 pb-3">
              <dt className="text-muted">דמי קבלת עבודה</dt>
              <dd className="font-bold text-ink">
                <span className="ltr-nums">{fee.toLocaleString("he-IL")}</span>{" "}
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
            disabled={pending || (mustWindow && windowSlot === null)}
            className={`${BUTTON_PRO} mt-4 w-full`}
          >
            {pending ? "שולח…" : bidId ? "עדכון ההצעה" : "שלח הצעה ללקוח"}
          </button>

          {mustWindow && windowSlot === null && (
            <p className="mt-2 text-center text-xs font-semibold text-muted">
              כדי לשלוח, בחרו מתי תגיעו.
            </p>
          )}
          <p className="mt-2 text-center text-xs text-muted">
            ההצעה תקפה {BID_VALIDITY_MINUTES} דקות
            {bidId ? " — עדכון מחיר מתחיל את הספירה מחדש." : "."}
          </p>
          <p className="mt-1 text-center text-xs text-muted">
            {fee === 0 && feeReason === "waiver"
              ? "לקוח חדש שהגיע דרך הקישור האישי שלך — העבודה הראשונה איתו בלי דמי קבלת עבודה."
              : fee === 0 && feeReason === "credit"
                ? "יש לך זיכוי מעבודה שבוטלה — הוא יכסה את דמי קבלת העבודה אם תאשר את העבודה הזו."
                : "דמי קבלת העבודה נגבים רק אם הלקוח יבחר בך ותאשר שאתה לוקח את העבודה."}
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

      <div className="order-2 space-y-6 lg:order-1">
        {/*
          The hours the pro commits to (Phase 13.7). Asked before the ETA on a
          call that is not for right now, because on such a call it is the
          answer the customer is actually waiting for. Required for today and
          tomorrow — the database refuses the offer without one — and optional
          for the rest of the week.
        */}
        {askWindow && (
          <fieldset className={`${CARD_CLASS}`}>
            <legend className={`px-1 ${SECTION_TITLE}`}>
              מתי תגיעו?{mustWindow ? "" : " (לא חובה)"}
            </legend>
            <p className="mt-1 text-sm text-muted">
              {mustWindow
                ? `הלקוח ביקש ${preferredTime === "today" ? "היום" : "מחר"}. בחרו חלון של ${ARRIVAL_SLOT_WIDTH_HOURS} שעות — הוא יופיע ללקוח בהצעה.`
                : `חלון של ${ARRIVAL_SLOT_WIDTH_HOURS} שעות עוזר ללקוח לבחור, אבל אפשר גם לתאם בצ׳אט.`}
            </p>

            {days.length === 0 ? (
              <p className="mt-3 text-sm font-semibold text-alert">
                אין כרגע חלון פתוח בימים שהלקוח ביקש.
              </p>
            ) : (
              <>
                <div
                  role="radiogroup"
                  aria-label="יום ההגעה"
                  className="mt-3 flex flex-wrap gap-2"
                >
                  {days.map((day) => (
                    <button
                      key={day}
                      type="button"
                      role="radio"
                      aria-checked={day === windowDay}
                      onClick={() => {
                        setWindowDay(
                          day === windowDay && !mustWindow ? null : day,
                        );
                        setWindowSlot(null);
                      }}
                      className={`min-h-11 rounded-xl border px-4 text-sm font-semibold transition-colors ${
                        day === windowDay
                          ? "border-pro bg-pro text-white"
                          : "border-line bg-surface text-ink hover:border-pro/40"
                      }`}
                    >
                      {dayLabel(day, clockNow!)}
                    </button>
                  ))}
                </div>

                {windowDay && (
                  <div
                    role="radiogroup"
                    aria-label="שעת ההגעה"
                    className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3"
                  >
                    {slots.map((hour) => (
                      <button
                        key={hour}
                        type="button"
                        role="radio"
                        aria-checked={hour === windowSlot}
                        onClick={() => setWindowSlot(hour)}
                        className={`min-h-11 rounded-xl border px-3 text-sm font-semibold transition-colors ${
                          hour === windowSlot
                            ? "border-pro bg-pro text-white"
                            : "border-line bg-surface text-ink hover:border-pro/40"
                        }`}
                      >
                        <span className="ltr-nums">
                          {`${String(hour).padStart(2, "0")}:00–${String(hour + ARRIVAL_SLOT_WIDTH_HOURS).padStart(2, "0")}:00`}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}

            {state.fieldErrors?.windowSlot && (
              <div className="mt-2">
                <ErrorText>{state.fieldErrors.windowSlot}</ErrorText>
              </div>
            )}
          </fieldset>
        )}

        <fieldset className={`${CARD_CLASS}`}>
          <legend className={`px-1 ${SECTION_TITLE}`}>
            {askWindow ? "כמה זמן לוקח לכם להגיע מרגע שיוצאים" : "זמן הגעה"}
          </legend>

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

        <div className={`${CARD_CLASS}`}>
          <label htmlFor="bid-note" className={SECTION_TITLE}>
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
