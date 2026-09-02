"use client";

import Link from "next/link";
import { useActionState } from "react";
import {
  Badge,
  BUTTON_CTA,
  BUTTON_QUIET,
  ErrorText,
} from "@/components/ui/primitives";
import { selectBid } from "@/lib/actions/bids";
import { EMPTY_SELECT_BID_STATE } from "@/lib/actions/state";
import { CUSTOMER_ROUTES } from "@/lib/routes";
import type { JobBid } from "@/lib/supabase/bids";
import {
  BID_STATUS_LABEL,
  PRICE_INCLUDES_NOTE,
  initials,
} from "@/lib/validation/bids";

/**
 * One offer on design/screens/customer-2.2-compare-bids.png: the price large
 * on the leading edge with the two actions under it, the pro and their badges
 * on the trailing edge, and the note in a grey bubble beneath.
 *
 * "כולל ביקור וחלקים" under every price is business rule 2 — no hidden
 * call-out fees — and is written once in lib/validation/bids.ts so the two
 * screens that promise it cannot drift apart.
 *
 * The avatar is initials rather than a photo: the pro's profile picture lives
 * in the private verification-docs bucket, which no customer can read, and
 * the design's own card shows initials too. A public bucket for profile photos
 * belongs to the phase that builds the public profile (CLAUDE.md section 9).
 */
export function BidCard({
  bid,
  jobId,
  highlights,
  decided,
}: {
  bid: JobBid;
  jobId: string;
  highlights: readonly string[];
  /** True once any offer on this job has been chosen: the rest are read-only. */
  decided: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    selectBid,
    EMPTY_SELECT_BID_STATE,
  );

  const live = bid.status === "pending";
  const won = bid.status === "selected";

  return (
    <li
      className={`rounded-2xl border bg-surface p-5 ${
        won ? "border-cta ring-1 ring-cta/30" : "border-line"
      } ${live || won ? "" : "opacity-70"}`}
    >
      <div className="flex flex-wrap-reverse items-start justify-between gap-4">
        <div className="min-w-56 flex-1">
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
                  won ? "bg-cta/15 text-cta-strong" : "bg-canvas text-muted"
                }`}
              >
                {BID_STATUS_LABEL[bid.status]}
              </p>
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

        <div className="flex min-w-56 flex-1 items-start gap-3">
          <div className="min-w-0 flex-1 text-end">
            <div className="flex flex-wrap items-center justify-end gap-2">
              <h3 className="text-lg font-bold text-ink">
                {bid.proName ?? "בעל מקצוע"}
              </h3>
              {bid.proVerified && <Badge tone="done">✓ מאומת Handy</Badge>}
              {highlights.map((label) => (
                <Badge key={label} tone="open">
                  {label}
                </Badge>
              ))}
            </div>

            <p className="mt-1 text-sm text-muted">
              {bid.proRating !== null && (
                <>
                  <span className="ltr-nums">★ {bid.proRating.toFixed(1)}</span>{" "}
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

          <span
            aria-hidden
            className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-canvas text-sm font-bold text-muted"
          >
            {initials(bid.proName)}
          </span>
        </div>
      </div>
    </li>
  );
}
