import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { JobMediaGallery } from "@/components/customer/JobMediaGallery";
import { SubmitBidForm } from "@/components/pro/SubmitBidForm";
import { BUTTON_QUIET, Badge, Card } from "@/components/ui/primitives";
import { PRO_ROUTES } from "@/lib/routes";
import {
  countBidsOnJob,
  getSimilarBidRange,
  listMyBids,
} from "@/lib/supabase/bids";
import { getJob } from "@/lib/supabase/jobs";
import { listFeedJobs } from "@/lib/supabase/pros";
import { requireRole } from "@/lib/supabase/session";
import { relativeTime } from "@/lib/validation/bids";
import {
  PREFERRED_TIME_LABEL,
  jobReference,
  type PreferredTime,
} from "@/lib/validation/jobs";

export const metadata = { title: "הגשת הצעה — Handy" };

export const dynamic = "force-dynamic";

/**
 * design/screens/pro-2.3-submit-bid.png — הגשת הצעה, captured at
 * handy.co.il/pro/jobs/<id>/quote.
 *
 * The job is read back out of the database rather than passed through from the
 * feed card: whether this pro may bid at all is the SELECT policy's answer
 * (verified · accepting · inside both radii), and a job that policy does not
 * return arrives here as a 404 — the correct answer either way.
 *
 * A pro who has already bid is sent to their offers list rather than shown a
 * second form: `bids` carries a unique (job_id, pro_id), so the honest action
 * on this job is now "update the offer you sent".
 */
export default async function SubmitBidPage({
  params,
}: PageProps<"/pro/jobs/[jobId]/quote">) {
  await requireRole("pro");

  const { jobId } = await params;

  const job = await getJob(jobId);
  if (!job) notFound();

  const mine = (await listMyBids()).find((bid) => bid.jobId === jobId);
  if (mine) redirect(`${PRO_ROUTES.offers}?bid=${mine.id}`);

  const [bidsCount, priceRange, feed] = await Promise.all([
    countBidsOnJob(jobId),
    getSimilarBidRange(jobId),
    // Only for the "1.2 ק״מ ממך" line: the distance is computed by PostGIS in
    // the feed query, and the card in this page is the same job.
    listFeedJobs(null),
  ]);

  const distanceKm =
    feed.find((entry) => entry.id === jobId)?.distanceKm ?? null;

  const when = job.preferredTime
    ? (PREFERRED_TIME_LABEL[job.preferredTime as PreferredTime] ??
      job.preferredTime)
    : null;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-ink sm:text-4xl">
            הגשת הצעה — {job.description.split("\n")[0]!.slice(0, 60)}
          </h1>
          <p className="mt-2 text-muted">
            {job.addressText}
            {distanceKm !== null && (
              <>
                {" · "}
                <span className="ltr-nums">{distanceKm.toFixed(1)}</span> ק״מ
                ממך
              </>
            )}{" "}
            · פורסם {relativeTime(job.createdAt)}
          </p>
        </div>

        <Link href={PRO_ROUTES.jobs} className={BUTTON_QUIET}>
          חזרה לפיד
        </Link>
      </header>

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-ink">תיאור הלקוח</h2>
            <p className="mt-1 text-sm text-muted">
              {job.categoryName ?? "קריאה"} ·{" "}
              <span dir="ltr" className="font-mono">
                {jobReference(job.id)}
              </span>
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {when && <Badge tone="waiting">{when}</Badge>}
            <Badge tone="neutral">
              {bidsCount === 0
                ? "עדיין אין הצעות"
                : bidsCount === 1
                  ? "הצעה אחת עד כה"
                  : `${bidsCount} הצעות עד כה`}
            </Badge>
          </div>
        </div>

        <p className="mt-4 whitespace-pre-line text-ink">{job.description}</p>

        <JobMediaGallery
          photoPaths={job.photoPaths}
          videoPath={job.videoPath}
          voiceNotePath={job.voiceNotePath}
        />

        <p className="mt-4 rounded-xl bg-canvas px-4 py-3 text-sm text-muted">
          הצעה שנשלחת תוך 10 דקות מפרסום הקריאה נבחרת ב-64% מהמקרים.
        </p>
      </Card>

      <SubmitBidForm jobId={jobId} priceRange={priceRange} />
    </div>
  );
}
