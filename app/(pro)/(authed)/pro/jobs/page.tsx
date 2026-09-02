import Link from "next/link";
import { FeedJobCard } from "@/components/pro/FeedJobCard";
import { ProStatusCard } from "@/components/pro/ProStatusCard";
import { BUTTON_PRO, BUTTON_QUIET, Card } from "@/components/ui/primitives";
import { restoreDismissedJobs } from "@/lib/actions/pros";
import { getBrowserMapsKey } from "@/lib/maps/config";
import { PRO_ROUTES } from "@/lib/routes";
import { listCategories, signJobMedia } from "@/lib/supabase/jobs";
import {
  countDismissedJobs,
  getMyProProfile,
  listFeedJobs,
} from "@/lib/supabase/pros";
import { requireRole } from "@/lib/supabase/session";
import {
  SERVICE_RADIUS_LABEL,
  SERVICE_RADIUS_OPTIONS,
} from "@/lib/validation/pros";

export const metadata = { title: "קריאות בסביבה — Handy" };

// The feed is a live view of other people's jobs; caching it would be a bug.
export const dynamic = "force-dynamic";

/**
 * design/screens/pro-2.2-job-feed.png — קריאות בסביבה.
 *
 * The roadmap's definition of done for this phase is "the feed shows only jobs
 * inside the configured radius, through a real PostGIS query, not a JS
 * filter". That query is `open_jobs_for_pro` (an indexed `ST_DWithin` against
 * the pro's own `service_point`), and it runs as the caller — so the RLS policy
 * on `jobs`, which requires verified · accepting · inside both radii, is what
 * actually selects the rows. The chips below only narrow further.
 *
 * The design's left column also carries a weekly-earnings chart; that is
 * Phase 6 and is left out rather than filled with invented numbers.
 */
export default async function ProJobFeedPage({
  searchParams,
}: PageProps<"/pro/jobs">) {
  await requireRole("pro");

  const [profile, categories, params] = await Promise.all([
    getMyProProfile(),
    listCategories(),
    searchParams,
  ]);

  const requested = Number(
    Array.isArray(params.radius) ? params.radius[0] : params.radius,
  );
  const activeRadius = (SERVICE_RADIUS_OPTIONS as readonly number[]).includes(
    requested,
  )
    ? requested
    : null;

  const [jobs, dismissedCount] = await Promise.all([
    listFeedJobs(activeRadius),
    countDismissedJobs(),
  ]);

  // One batch of signed URLs for the whole page. Storage only signs a path the
  // caller's own RLS lets them read, so this is a convenience, not the gate.
  const firstPhotos = jobs
    .map((job) => job.photoPaths[0])
    .filter((path): path is string => Boolean(path));
  const signed = await signJobMedia(firstPhotos);

  const myTrades = categories
    .filter((category) => profile?.categoryIds.includes(category.id))
    .map((category) => category.nameHe);

  const mapsKey = getBrowserMapsKey();

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-ink sm:text-4xl">
            קריאות בסביבה
          </h1>
          <p className="mt-2 text-muted">
            {myTrades.length > 0 ? myTrades.join(", ") : "כל התחומים"} ·{" "}
            {activeRadius
              ? SERVICE_RADIUS_LABEL[activeRadius]
              : `עד ${profile?.radiusKm ?? 0} ק״מ`}
            {profile?.serviceAddressText
              ? ` · ${profile.serviceAddressText}`
              : ""}
          </p>
        </div>

        <nav aria-label="רדיוס חיפוש" className="flex flex-wrap gap-2">
          <RadiusChip href={PRO_ROUTES.jobs} active={activeRadius === null}>
            הרדיוס שלי
          </RadiusChip>
          {SERVICE_RADIUS_OPTIONS.map((option) => (
            <RadiusChip
              key={option}
              href={`${PRO_ROUTES.jobs}?radius=${option}`}
              active={activeRadius === option}
            >
              {SERVICE_RADIUS_LABEL[option]}
            </RadiusChip>
          ))}
        </nav>
      </header>

      <div className="grid gap-6 lg:grid-cols-[20rem_minmax(0,1fr)] lg:items-start">
        <aside className="space-y-4 lg:order-2">
          <Card className="overflow-hidden p-0">
            {mapsKey && profile?.serviceAddressText ? (
              <iframe
                title="אזור הפעילות שלך על המפה"
                loading="lazy"
                className="h-56 w-full border-0"
                src={`https://www.google.com/maps/embed/v1/place?key=${encodeURIComponent(mapsKey)}&q=${encodeURIComponent(profile.serviceAddressText)}&zoom=12&language=he&region=IL`}
              />
            ) : (
              /* No Maps key, or no base address yet. The distances beside each
                 card are the substance the map only illustrates, so this says
                 what is missing instead of showing an empty grey rectangle. */
              <div className="flex h-56 flex-col items-center justify-center gap-2 bg-canvas p-6 text-center">
                <span aria-hidden className="text-3xl">
                  🗺️
                </span>
                <p className="text-sm font-semibold text-ink">
                  {profile?.serviceAddressText
                    ? "המפה תוצג כשיוגדר מפתח Google Maps"
                    : "עוד לא הוגדרה כתובת בסיס"}
                </p>
                <p className="text-xs text-muted">
                  המרחק בכל כרטיס מחושב במסד הנתונים ולא תלוי במפה.
                </p>
              </div>
            )}
          </Card>

          <Card>
            <h2 className="font-bold text-ink">טיפ להעלאת שיעור הזכייה</h2>
            <p className="mt-2 text-sm text-muted">
              הצעה שנשלחת בתוך 10 דקות מפרסום הקריאה נבחרת ב-64% מהמקרים.
            </p>
          </Card>

          {dismissedCount > 0 && (
            <Card>
              <h2 className="font-bold text-ink">קריאות שהסתרתם</h2>
              <p className="mt-2 text-sm text-muted">
                {dismissedCount} קריאות לא מוצגות בפיד שלכם.
              </p>
              <form action={restoreDismissedJobs} className="mt-3">
                <button
                  type="submit"
                  className={`${BUTTON_QUIET} w-full px-4 py-2 text-sm`}
                >
                  החזרת כולן לפיד
                </button>
              </form>
            </Card>
          )}
        </aside>

        <div className="lg:order-1">
          {profile && profile.verificationStatus !== "verified" ? (
            <ProStatusCard profile={profile} />
          ) : jobs.length === 0 ? (
            <Card className="p-10 text-center">
              <p className="text-lg font-bold text-ink">
                אין כרגע קריאות פתוחות באזור שלך
              </p>
              <p className="mt-2 text-muted">
                {profile?.acceptingJobs
                  ? "ברגע שלקוח יפרסם קריאה בתחומים וברדיוס שהגדרתם, היא תופיע כאן."
                  : "קבלת הקריאות כבויה כרגע. הפעילו אותה כדי לקבל קריאות חדשות."}
              </p>
              <Link
                href={PRO_ROUTES.settings}
                className={`${BUTTON_PRO} mt-5 inline-flex`}
              >
                הרחבת התחומים או הרדיוס
              </Link>
            </Card>
          ) : (
            <ul className="space-y-4">
              {jobs.map((job) => (
                <FeedJobCard
                  key={job.id}
                  job={job}
                  photoUrl={
                    job.photoPaths[0]
                      ? (signed.get(job.photoPaths[0]) ?? null)
                      : null
                  }
                  justArrived={job.justArrived}
                />
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function RadiusChip({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "true" : undefined}
      className={`rounded-xl border px-4 py-2 text-sm font-semibold transition-colors ${
        active
          ? "border-ink bg-ink text-white"
          : "border-line bg-surface text-ink hover:border-pro/40"
      }`}
    >
      {children}
    </Link>
  );
}
