"use client";

import Link from "next/link";
import { useActionState } from "react";
import {
  BUTTON_CTA,
  BUTTON_QUIET,
  Badge,
  ErrorText,
  SECTION_TITLE,
} from "@/components/ui/primitives";
import { selectBid } from "@/lib/actions/bids";
import { CheckIcon, StarIcon } from "@/components/ui/icons";
import { EMPTY_SELECT_BID_STATE } from "@/lib/actions/state";
import { CUSTOMER_ROUTES } from "@/lib/routes";
import type { JobBid } from "@/lib/supabase/bids";
import {
  BID_STATUS_LABEL,
  PRICE_INCLUDES_NOTE,
  initials,
} from "@/lib/validation/bids";
import { Countdown } from "@/components/ui/Countdown";
import { ProPeekButton } from "@/components/customer/ProPeekButton";
import { describeWindow } from "@/lib/validation/arrivalWindow";

/**
 * One offer on design/screens/customer-2.2-compare-bids.png: the price large
 * on the leading edge with the two actions under it, the pro and their badges
 * on the trailing edge, and the note in a grey bubble beneath.
 *
 * "כולל ביקור וחלקים" under every price is business rule 2 — no hidden
 * call-out fees — and is written once in lib/validation/bids.ts so the two
 * screens that promise it cannot drift apart.
 *
 * Since Phase 14 the card is the pro, not two grey initials: the portrait
 * from `pro-media` (the public bucket), the reviews behind the stars, the years
 * of experience, a response time measured over at least three offers, and
 * "פרופיל וביקורות" — the public profile in a panel over the list, so opening
 * it never costs the customer the comparison. Every one of those comes from
 * `bids_for_job()`, which names each column it returns.
 */
export function BidCard({
  bid,
  jobId,
  highlights,
  decided,
  featured = false,
  now,
}: {
  bid: JobBid;
  jobId: string;
  highlights: readonly string[];
  /**
   * The first card under the "מומלץ" sort — lifted off the page so the ranking
   * the screen just performed is visible without reading three prices. Only
   * ever one per screen, and never once a decision has been made: at that point
   * the accepted offer is what matters and a recommendation is noise.
   */
  featured?: boolean;
  /**
   * True once a pro has actually taken this job: the rest go read-only.
   *
   * An offer merely *waiting* for its pro is not decided — the customer may
   * still hand the job to somebody else, and `select_bid()` will release the
   * first one in the same statement. That is the whole of "אפשר להתחרט".
   */
  decided: boolean;
  /** The server's clock at render, so "היום"/"מחר" agree across hydration. */
  now: string;
}) {
  const [state, formAction, pending] = useActionState(
    selectBid,
    EMPTY_SELECT_BID_STATE,
  );

  const live = bid.status === "pending";
  const waiting = bid.status === "selected";
  const won = bid.status === "accepted";

  const window =
    bid.arrivalWindowStart && bid.arrivalWindowEnd
      ? describeWindow(
          bid.arrivalWindowStart,
          bid.arrivalWindowEnd,
          new Date(now),
        )
      : null;

  return (
    <li
      /*
       * A lapsed offer takes the canvas as its ground instead of white. It used
       * to take `opacity-70`, and dimming a card that contains text is not a
       * style choice — it multiplies through to every colour on it. `text-muted`
       * on white is 4.51:1, which clears AA; at 70% opacity it renders #909cad
       * on #fdfdfe, which is 2.73:1, and the verified badge went from 4.65:1 to
       * 3.27:1. e2e/a11y.spec.ts catches it on this screen.
       *
       * Nothing is lost by saying it in one channel rather than all of them: the
       * card already carries BID_STATUS_LABEL in a pill, which is the honest way
       * to state a status.
       */
      className={`rounded-2xl border p-5 ${
        won
          ? "border-cta bg-surface shadow-lift ring-1 ring-cta/30"
          : waiting
            ? "border-brand bg-surface shadow-lift ring-1 ring-brand/30"
            : !live
              ? "border-line bg-canvas"
              : featured
                ? "border-line bg-surface shadow-lift"
                : "border-line bg-surface shadow-card"
      }`}
    >
      {/* The pro at the leading edge with the price and its two actions at
          the trailing one, as in customer-2.2-compare-bids.png. They stack
          in that same order on a narrow screen. */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-56 flex-1 items-start gap-3">
          {bid.proAvatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- public-bucket portrait, as ProCard draws it
            <img
              src={bid.proAvatarUrl}
              alt=""
              className="size-14 shrink-0 rounded-xl object-cover"
            />
          ) : (
            <span
              aria-hidden
              className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-canvas text-sm font-bold text-muted"
            >
              {initials(bid.proName)}
            </span>
          )}

          <div className="min-w-0 flex-1 text-start">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className={SECTION_TITLE}>{bid.proName ?? "בעל מקצוע"}</h3>
              {bid.proVerified && (
                <Badge tone="done">
                  <CheckIcon className="me-1 size-3.5" />
                  מאומת Handy
                </Badge>
              )}
              {highlights.map((label) => (
                <Badge key={label} tone="open">
                  {label}
                </Badge>
              ))}
            </div>

            <p className="mt-1 text-sm text-muted">
              {bid.proRating !== null && (
                <>
                  <StarIcon
                    filled
                    className="me-0.5 inline size-3.5 align-[-2px]"
                  />
                  <span className="ltr-nums">{bid.proRating.toFixed(1)}</span>
                  {bid.proReviewsCount > 0 && (
                    <>
                      {" "}
                      (<span className="ltr-nums">{bid.proReviewsCount}</span>)
                    </>
                  )}{" "}
                  ·{" "}
                </>
              )}
              {bid.proYearsExperience !== null && (
                <>
                  <span className="ltr-nums">{bid.proYearsExperience}</span>{" "}
                  שנות ניסיון ·{" "}
                </>
              )}
              <span className="ltr-nums">{bid.proJobsCompleted}</span> עבודות
              {!window && (
                <>
                  {" "}
                  · מגיע תוך <span className="ltr-nums">
                    {bid.etaMinutes}
                  </span>{" "}
                  דק׳
                </>
              )}
            </p>

            {/*
              The agreed hours, on a line of their own: a day in Hebrew and a
              range in digits are two bidi runs, and CLAUDE.md section 3 keeps
              such a line to one fact.
            */}
            {window && (
              <p className="mt-1 text-sm font-semibold text-ink">
                מגיע {window.day} ·{" "}
                <span className="ltr-nums">{window.hours}</span>
              </p>
            )}

            {/* Measured, never promised: the average over at least three of
                this pro's offers (pro_response_minutes()), and absent below. */}
            {bid.proResponseMinutes !== null && (
              <p className="mt-1 text-sm text-muted">
                עונה בדרך כלל תוך{" "}
                <span className="ltr-nums">{bid.proResponseMinutes}</span> דק׳
                מפרסום קריאה
              </p>
            )}

            {bid.proSlug && (
              <div className="mt-2">
                <ProPeekButton slug={bid.proSlug} proName={bid.proName} />
              </div>
            )}

            {bid.note && (
              <p className="mt-3 rounded-xl bg-canvas px-4 py-3 text-sm text-ink">
                {bid.note}
              </p>
            )}
          </div>
        </div>
        <div className="min-w-56 flex-1 sm:max-w-64">
          <p className="text-3xl font-bold text-brand">
            <span className="ltr-nums">
              {bid.price.toLocaleString("he-IL")}
            </span>{" "}
            ₪
          </p>
          <p className="mt-1 text-sm text-muted">{PRICE_INCLUDES_NOTE}</p>

          <div className="mt-4 flex flex-col gap-2 sm:max-w-56">
            {live && !decided ? (
              <form action={formAction}>
                <input type="hidden" name="bidId" value={bid.id} />
                <input type="hidden" name="jobId" value={jobId} />
                <button
                  type="submit"
                  disabled={pending}
                  className={`${BUTTON_CTA} w-full`}
                >
                  {pending ? "בוחרים…" : "בחר הצעה"}
                </button>
              </form>
            ) : (
              <p
                className={`rounded-xl px-4 py-3 text-center text-sm font-semibold ${
                  won
                    ? "bg-cta/15 text-cta-strong"
                    : waiting
                      ? "bg-brand/10 text-brand"
                      : "bg-canvas text-muted"
                }`}
              >
                {BID_STATUS_LABEL[bid.status]}
              </p>
            )}

            {/* Each live offer's own 45 minutes. Until Phase 14 only one line
                under the whole list said "some offers have under 10 minutes". */}
            {live && !decided && (
              <Countdown
                deadline={bid.expiresAt}
                urgentBelow={10}
                label="תוקף ההצעה"
                className="justify-center text-sm"
              />
            )}

            {waiting && bid.acceptDeadline && (
              <Countdown
                deadline={bid.acceptDeadline}
                className="justify-center text-sm"
              />
            )}

            <Link
              href={`${CUSTOMER_ROUTES.chat(jobId)}?pro=${bid.proId}`}
              className={`${BUTTON_QUIET} w-full`}
            >
              שלח הודעה
              {bid.unreadCount > 0 && (
                <span className="inline-flex size-5 items-center justify-center rounded-full bg-alert text-xs font-bold text-white">
                  {bid.unreadCount}
                </span>
              )}
            </Link>
          </div>

          {state.error && (
            <div className="mt-3">
              <ErrorText>{state.error}</ErrorText>
            </div>
          )}
        </div>
      </div>
    </li>
  );
}
