"use client";

import Link from "next/link";
import { useState } from "react";
import { SubmitBidForm } from "@/components/pro/SubmitBidForm";
import { Badge, BUTTON_QUIET } from "@/components/ui/primitives";
import { categoryIcon } from "@/lib/categories";
import { PRO_ROUTES } from "@/lib/routes";
import type { MyBid } from "@/lib/supabase/bids";
import {
  BID_STATUS_LABEL_PRO,
  minutesLeft,
  relativeTime,
} from "@/lib/validation/bids";

/**
 * One row of design/screens/pro-2.4-my-bids.png: the job on the leading edge,
 * the status tag, the price, and "עדכן הצעה" on the trailing edge.
 *
 * Editing expands the same form the bid was written in rather than opening a
 * second screen — it is the same four fields, and the 45-minute clock restarts
 * in the database's trigger either way.
 *
 * A lost bid says what won ("הלקוח בחר אחר · 280 ₪") and nothing about who:
 * `my_bids()` returns the price alone, which is the same trade `job_bid_count`
 * makes when it tells a pro there is competition without naming it.
 */
export function MyBidRow({
  bid,
  photoUrl,
  expandedByDefault,
}: {
  bid: MyBid;
  photoUrl: string | null;
  expandedByDefault: boolean;
}) {
  const [editing, setEditing] = useState(expandedByDefault);

  const live = bid.status === "pending";
  const left = live ? minutesLeft(bid.expiresAt) : 0;

  const tone =
    bid.status === "selected"
      ? "done"
      : bid.status === "pending"
        ? "waiting"
        : "neutral";

  return (
    <li className="rounded-2xl border border-line bg-surface">
      <div className="flex flex-wrap items-center gap-4 p-5">
        <span
          aria-hidden
          className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-canvas text-2xl"
        >
          {photoUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element -- a signed,
               expiring Storage URL: next/image would cache a URL that dies. */
            <img
              src={photoUrl}
              alt=""
              className="size-full object-cover"
              loading="lazy"
            />
          ) : (
            categoryIcon(bid.categorySlug)
          )}
        </span>

        <div className="min-w-56 flex-1">
          <h3 className="font-bold text-ink">
            {bid.jobDescription.split("\n")[0]!.slice(0, 70)}
          </h3>
          <p className="mt-1 text-sm text-muted">
            {bid.jobAddressText} · הוגש {relativeTime(bid.createdAt)}
            {live && (
              <>
                {" "}
                · נותרו <span className="ltr-nums">{left}</span> דק׳ תוקף
              </>
            )}
          </p>
        </div>

        <Badge tone={tone}>
          {BID_STATUS_LABEL_PRO[bid.status]}
          {bid.winningPrice !== null && (
            <>
              {" · "}
              <span className="ltr-nums">
                {bid.winningPrice.toLocaleString("he-IL")}
              </span>{" "}
              ₪
            </>
          )}
        </Badge>

        <p className="text-xl font-bold text-ink">
          <span className="ltr-nums">{bid.price.toLocaleString("he-IL")}</span>{" "}
          ₪
        </p>

        <div className="flex shrink-0 flex-col gap-2">
          {live ? (
            <button
              type="button"
              onClick={() => setEditing((open) => !open)}
              aria-expanded={editing}
              className={`${BUTTON_QUIET} border-pro/30 px-4 py-2 text-sm text-pro`}
            >
              {editing ? "סגירה" : "עדכן הצעה"}
            </button>
          ) : (
            <span className="px-4 py-2 text-sm text-muted">
              אין פעולה נדרשת
            </span>
          )}

          <Link
            href={`${PRO_ROUTES.messages}?job=${bid.jobId}`}
            className={`${BUTTON_QUIET} px-4 py-2 text-sm`}
          >
            הודעות
            {bid.unreadCount > 0 && (
              <span className="inline-flex size-5 items-center justify-center rounded-full bg-alert text-xs font-bold text-white">
                {bid.unreadCount}
              </span>
            )}
          </Link>
        </div>
      </div>

      {editing && live && (
        <div className="border-t border-line p-5">
          <SubmitBidForm
            jobId={bid.jobId}
            bidId={bid.id}
            initialPrice={bid.price}
            initialEta={bid.etaMinutes}
            initialNote={bid.note}
            priceRange={null}
          />
        </div>
      )}
    </li>
  );
}
