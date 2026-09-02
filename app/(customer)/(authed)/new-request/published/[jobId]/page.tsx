import Link from "next/link";
import { notFound } from "next/navigation";
import { JobMediaGallery } from "@/components/customer/JobMediaGallery";
import { BUTTON_BRAND, BUTTON_QUIET, Card } from "@/components/ui/primitives";
import { getBrowserMapsKey } from "@/lib/maps/config";
import { getJob } from "@/lib/supabase/jobs";
import {
  PREFERRED_TIME_LABEL,
  jobReference,
  type PreferredTime,
} from "@/lib/validation/jobs";

export const metadata = { title: "הקריאה פורסמה — Handy" };

/**
 * "הקריאה פורסמה" — the confirmation the roadmap calls for at the end of
 * Phase 2. Static in the sense that matters: it reports what was saved, and
 * does not yet show bids. Bids arrive in Phase 4 and this screen is where they
 * will land.
 *
 * The job is fetched back out of the database rather than passed through from
 * the action, so what the customer sees is what was actually stored — the
 * geocoded coordinates included.
 */
export default async function JobPublishedPage({
  params,
}: PageProps<"/new-request/published/[jobId]">) {
  const { jobId } = await params;
  const job = await getJob(jobId);

  // RLS returns nothing for someone else's job, which reaches here as "no such
  // job" — the correct answer either way.
  if (!job) notFound();

  const mapsKey = getBrowserMapsKey();
  const hasPoint = job.latitude !== null && job.longitude !== null;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="text-center">
        <span
          aria-hidden
          className="mx-auto flex size-14 items-center justify-center rounded-full bg-cta/15 text-3xl"
        >
          ✅
        </span>
        <h1 className="mt-4 text-3xl font-bold text-ink">הקריאה פורסמה!</h1>
        <p className="mt-2 text-muted">
          הקריאה נשלחת לבעלי מקצוע מאומתים ברדיוס {job.searchRadiusKm} ק״מ.
          ההצעות הראשונות מגיעות תוך דקות.
        </p>
      </header>

      <Card>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-bold text-ink">
            {job.categoryName ?? "קריאה"}
          </h2>
          <span dir="ltr" className="font-mono text-sm text-muted">
            {jobReference(job.id)}
          </span>
        </div>

        <p className="mt-3 whitespace-pre-line text-ink">{job.description}</p>

        <dl className="mt-5 divide-y divide-line text-sm">
          <Row label="כתובת">{job.addressText}</Row>
          <Row label="מועד">
            {job.preferredTime
              ? (PREFERRED_TIME_LABEL[job.preferredTime as PreferredTime] ??
                job.preferredTime)
              : "—"}
          </Row>
          <Row label="רדיוס חיפוש">{job.searchRadiusKm} ק״מ</Row>
          <Row label="מיקום שנשמר">
            {hasPoint ? (
              <span dir="ltr" className="font-mono">
                {job.latitude!.toFixed(5)}, {job.longitude!.toFixed(5)}
              </span>
            ) : (
              "—"
            )}
          </Row>
          <Row label="סטטוס">ממתין להצעות</Row>
        </dl>

        <JobMediaGallery
          photoPaths={job.photoPaths}
          videoPath={job.videoPath}
          voiceNotePath={job.voiceNotePath}
        />
      </Card>

      {hasPoint && mapsKey && (
        <Card className="overflow-hidden p-0">
          <iframe
            title="מיקום הקריאה על המפה"
            loading="lazy"
            className="h-72 w-full border-0"
            src={`https://www.google.com/maps/embed/v1/place?key=${encodeURIComponent(mapsKey)}&q=${job.latitude},${job.longitude}&language=he&region=IL`}
          />
        </Card>
      )}

      <div className="flex flex-wrap gap-3">
        <Link href="/account" className={BUTTON_BRAND}>
          לאזור האישי
        </Link>
        <Link href="/new-request" className={BUTTON_QUIET}>
          פרסום קריאה נוספת
        </Link>
      </div>
    </div>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-3">
      <dt className="text-muted">{label}</dt>
      <dd className="text-end font-semibold text-ink">{children}</dd>
    </div>
  );
}
