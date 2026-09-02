import Link from "next/link";
import { Badge, BUTTON_CTA, BUTTON_QUIET } from "@/components/ui/primitives";
import { categoryIcon } from "@/lib/categories";
import { dismissJob } from "@/lib/actions/pros";
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
        <span
          aria-hidden
          className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-canvas text-3xl"
        >
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
            categoryIcon(job.categorySlug)
          )}
        </span>

        <div className="min-w-56 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-bold text-ink">
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
        </div>

        <div className="flex w-full shrink-0 flex-col gap-2 sm:w-52">
          <Link
            href={PRO_ROUTES.quote(job.id)}
            className={`${BUTTON_CTA} w-full`}
          >
            הגש הצעת מחיר
          </Link>

          <form action={dismissJob}>
            <input type="hidden" name="jobId" value={job.id} />
            <button type="submit" className={`${BUTTON_QUIET} w-full`}>
              לא מתאים לי
            </button>
          </form>
        </div>
      </div>
    </li>
  );
}
