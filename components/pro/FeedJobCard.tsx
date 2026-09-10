import Link from "next/link";
import { BUTTON_CTA, Badge, SECTION_TITLE } from "@/components/ui/primitives";
import { DismissJobButton } from "@/components/pro/DismissJobButton";
import { CategoryIcon } from "@/lib/categories";
import { PRO_ROUTES } from "@/lib/routes";
import type { FeedJob } from "@/lib/supabase/pros";
import {
  PREFERRED_TIME_LABEL,
  jobReference,
  type PreferredTime,
} from "@/lib/validation/jobs";

/**
 * One card in the pro's feed — design/screens/pro-2.2-job-feed.png.
 *
 * The design's primary action is "הגש הצעת מחיר", and since Phase 4 it leads
 * to the real bid screen. The card around it — distance, area, how many bids
 * are already in, the orange ribbon on something that just arrived — is all
 * real data from `open_jobs_for_pro`.
 */

export function FeedJobCard({
  job,
  photoUrl,
  justArrived,
}: {
  job: FeedJob;
  photoUrl: string | null;
  /** Decided once per request on the page, not per render: "now" is not pure. */
  justArrived: boolean;
}) {
  const when = job.preferredTime
    ? (PREFERRED_TIME_LABEL[job.preferredTime as PreferredTime] ??
      job.preferredTime)
    : null;

  const urgent = job.preferredTime === "asap";

  return (
    <li
      className={`overflow-hidden rounded-2xl border bg-surface ${
        justArrived ? "border-alert" : "border-line"
      }`}
    >
      {justArrived && (
        <p className="bg-alert px-5 py-2 text-sm font-bold text-white">
          קריאה חדשה נכנסה עכשיו
        </p>
      )}

      <div className="flex flex-wrap items-center gap-4 p-5">
        <span className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-canvas text-muted">
          {photoUrl ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element -- a signed,
                  expiring Storage URL: next/image would cache a URL that dies. */}
              <img
                src={photoUrl}
                alt=""
                className="size-full object-cover"
                loading="lazy"
              />
            </>
          ) : (
            <CategoryIcon slug={job.categorySlug} className="size-9" />
          )}
        </span>

        <div className="min-w-56 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className={SECTION_TITLE}>
              {job.description.split("\n")[0]!.slice(0, 70)}
            </h3>
            {when && (
              <Badge tone={urgent ? "waiting" : "neutral"}>{when}</Badge>
            )}
          </div>

          <p className="mt-1 text-sm text-muted">
            {job.categoryName} ·{" "}
            <span dir="ltr" className="font-mono">
              {jobReference(job.id)}
            </span>
          </p>

          <p className="mt-2 text-sm font-semibold text-pro">
            <span className="ltr-nums">{job.distanceKm.toFixed(1)}</span> ק״מ
            ממך · {job.addressText} ·{" "}
            {job.bidsCount === 0
              ? "עדיין אין הצעות"
              : job.bidsCount === 1
                ? "הצעה אחת עד כה"
                : `${job.bidsCount} הצעות עד כה`}
          </p>

          {/* Shown rather than hidden: a pro bidding into somebody else's
              open acceptance window is spending their time on a long shot,
              and they are entitled to know that before they price it. How
              long the other pro has been thinking is not their business, so
              this is a flag and not a clock. */}
          {job.awaitingAnswer && (
            <p className="mt-2 text-sm font-semibold text-alert">
              הלקוח כבר בחר הצעה וממתין לאישור בעל המקצוע. אפשר להגיש הצעה — היא
              תיכנס לתמונה אם הוא לא יאשר.
            </p>
          )}
        </div>

        <div className="flex w-full shrink-0 flex-col gap-2 sm:w-52">
          <Link
            href={PRO_ROUTES.quote(job.id)}
            className={`${BUTTON_CTA} w-full`}
          >
            הגש הצעת מחיר
          </Link>

          <DismissJobButton jobId={job.id} />
        </div>
      </div>
    </li>
  );
}
