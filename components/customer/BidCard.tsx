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

/**
 * One offer on design/screens/customer-2.2-compare-bids.png: the price large
 * on the leading edge with the two actions under it, the pro and their badges
 * on the trailing edge, and the note in a grey bubble beneath.
 *
 * "כולל ביקור וחלקים" under every price is business rule 2 — no hidden
 * call-out fees — and is written once in lib/validation/bids.ts so the two
 * screens that promise it cannot drift apart.
 *
 * The avatar is initials rather than a photo, and the reason has expired.
 * This comment used to say a photo was impossible because the only one lived
 * in the private `verification-docs` bucket — but Phase 8 built `pro-media`,
 * the public bucket, and `components/marketing/ProCard.tsx` has been drawing a
 * real portrait from it ever since. So the trust decision is the one screen in
 * the product still showing two grey letters.
 *
 * Fixing it is Phase 14's, not Phase 13.5's: `bids_for_job()` already joins
 * `pro_profiles`, so it is a `create or replace` that adds `avatar_path` and
 * `public_slug` — a migration, and this phase deliberately has none.
 */
export function BidCard({
  bid,
  jobId,
  highlights,
  decided,
  featured = false,
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
}) {
  const [state, formAction, pending] = useActionState(
    selectBid,
    EMPTY_SELECT_BID_STATE,
  );

  const live = bid.status === "pending";
  const waiting = bid.status === "selected";
  const won = bid.status === "accepted";

  return (
    <li
      className={`animate-enter rounded-2xl border bg-surface p-5 ${
        won
          ? "border-cta shadow-lift ring-1 ring-cta/30"
          : waiting
            ? "border-brand shadow-lift ring-1 ring-brand/30"
            : featured
              ? "border-line shadow-lift"
              : "border-line shadow-card"
      } ${live || won || waiting ? "" : "opacity-70"}`}
    >
      {/* The pro at the leading edge with the price and its two actions at
          the trailing one, as in customer-2.2-compare-bids.png. They stack
          in that same order on a narrow screen. */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-56 flex-1 items-start gap-3">
          <span
            aria-hidden
            className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-canvas text-sm font-bold text-muted"
          >
            {initials(bid.proName)}
          </span>

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
                  <span className="ltr-nums">{bid.proRating.toFixed(1)}</span>{" "}
                  ·{" "}
                </>
              )}
              <span className="ltr-nums">{bid.proJobsCompleted}</span> עבודות ·
              מגיע תוך <span className="ltr-nums">{bid.etaMinutes}</span> דק׳
            </p>

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
