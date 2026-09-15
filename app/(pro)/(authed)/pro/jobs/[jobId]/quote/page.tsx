import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { JobMediaGallery } from "@/components/customer/JobMediaGallery";
import { QuickBidButton } from "@/components/pro/QuickBidButton";
import { SubmitBidForm } from "@/components/pro/SubmitBidForm";
import {
  BUTTON_QUIET,
  Badge,
  Card,
  PAGE_LEAD,
  PAGE_TITLE,
  SECTION_TITLE,
} from "@/components/ui/primitives";
import { PRO_ROUTES } from "@/lib/routes";
import {
  countBidsOnJob,
  getSimilarBidRange,
  listMyBids,
  getMyBaseFeeForJob,
  getMyFeeForJob,
  recordJobView,
} from "@/lib/supabase/bids";
import { getJob } from "@/lib/supabase/jobs";
import { listFeedJobs } from "@/lib/supabase/pros";
import { requireRole } from "@/lib/supabase/session";
import { windowRequired } from "@/lib/validation/arrivalWindow";
import { BID_SPEED_NOTE, relativeTime } from "@/lib/validation/bids";
import { lastOfferByTrade, recentNotes } from "@/lib/validation/feed";
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

  const myBids = await listMyBids();
  const mine = myBids.find((bid) => bid.jobId === jobId);
  if (mine) redirect(`${PRO_ROUTES.offers}?bid=${mine.id}`);

  // Phase 18: the "קריאה חדשה" push lands on this page, so the feed's quick
  // offer is repeated here — one tap from the lock screen to an offer, with
  // the call's description above it. The same rule as the feed: never on a
  // call for today or tomorrow, which needs hours a quick offer cannot pick.
  const quickBid =
    job.categorySlug && !windowRequired(job.preferredTime)
      ? (lastOfferByTrade(myBids).get(job.categorySlug) ?? null)
      : null;

  const [bidsCount, priceRange, feed, , fee, baseFee] = await Promise.all([
    countBidsOnJob(jobId),
    getSimilarBidRange(jobId),
    // Only for the "1.2 ק״מ ממך" line: the distance is computed by PostGIS in
    // the feed query, and the card in this page is the same job.
    listFeedJobs(null),
    // "N בעלי מקצוע צפו בקריאה" on the customer's side (Phase 13.7). A no-op
    // for a job outside this pro's radius or no longer collecting offers, and
    // its failure is never this page's problem — it is a statistic.
    recordJobView(jobId),
    getMyFeeForJob(jobId),
    getMyBaseFeeForJob(jobId),
  ]);

  const feeReason = fee === 0 ? (baseFee === 0 ? "waiver" : "credit") : null;

  // Read once, on the server, and handed to the form: which arrival slots are
  // still open has to be the same answer on both sides of hydration.
  const renderedAt = new Date().toISOString();

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
          <h1 className={PAGE_TITLE}>
            הגשת הצעה — {job.description.split("\n")[0]!.slice(0, 60)}
          </h1>
          <p className={PAGE_LEAD}>
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
            <h2 className={SECTION_TITLE}>תיאור הלקוח</h2>
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
          {BID_SPEED_NOTE}
        </p>
      </Card>

      {quickBid && (
        <Card>
          <h2 className={SECTION_TITLE}>הצעה מהירה</h2>
          <p className="mt-1 text-sm text-muted">
            אותו מחיר ואותו זמן הגעה כמו בהצעה האחרונה שלך בתחום. אפשר לערוך
            אותה אחרי השליחה, כמו כל הצעה.
          </p>
          <div className="mt-4 sm:max-w-sm">
            <QuickBidButton
              jobId={jobId}
              price={quickBid.price}
              etaMinutes={quickBid.etaMinutes}
            />
          </div>
        </Card>
      )}

      <SubmitBidForm
        recentNotes={recentNotes(myBids)}
        jobId={jobId}
        priceRange={priceRange}
        preferredTime={job.preferredTime}
        now={renderedAt}
        fee={fee ?? undefined}
        feeReason={feeReason}
      />
    </div>
  );
}
