import Link from "next/link";
import { notFound } from "next/navigation";
import { BidCard } from "@/components/customer/BidCard";
import { JobMediaGallery } from "@/components/customer/JobMediaGallery";
import { BUTTON_QUIET, Card } from "@/components/ui/primitives";
import { RealtimeRefresh } from "@/components/ui/RealtimeRefresh";
import { getBrowserMapsKey } from "@/lib/maps/config";
import { CUSTOMER_ROUTES } from "@/lib/routes";
import {
  bidHighlights,
  countProsInRange,
  listBidsForJob,
  sortBids,
  sweepExpiredBids,
} from "@/lib/supabase/bids";
import { getJob } from "@/lib/supabase/jobs";
import { requireRole } from "@/lib/supabase/session";
import {
  BID_SORTS,
  BID_SORT_LABEL,
  isBidSort,
  minutesLeft,
  type BidSort,
} from "@/lib/validation/bids";
import { jobReference } from "@/lib/validation/jobs";

export const metadata = { title: "ההצעות שהתקבלו — Handy" };

// Offers arrive from other people, continuously. Caching this would be a bug.
export const dynamic = "force-dynamic";

/**
 * design/screens/customer-2.2-compare-bids.png — השוואת הצעות.
 *
 * This screen is the phase's definition of done: a new offer has to appear
 * here without a reload. `RealtimeRefresh` subscribes to Postgres changes on
 * `bids` filtered to this job and asks the router to re-render; the server
 * then re-reads under this customer's own RLS, so what lands on screen is
 * exactly what a reload would have shown.
 *
 * The design's left column carries a map of nearby pros. With no Maps key it
 * says so instead, and the count beside it — "נמצאו N בעלי מקצוע ברדיוס X" —
 * is a real PostGIS count either way, which is the part that carries meaning.
 */
export default async function JobOffersPage({
  params,
  searchParams,
}: PageProps<"/requests/[jobId]/offers">) {
  await requireRole("customer");

  const [{ jobId }, query] = await Promise.all([params, searchParams]);

  // Housekeeping before reading, so a lapsed offer is never rendered as live
  // on a stack with no scheduler. Nothing depends on it: the read below
  // reports a lapsed bid as expired whether or not this ran.
  await sweepExpiredBids();

  const job = await getJob(jobId);
  // RLS returns nothing for someone else's job, which arrives here as "no such
  // job" — the correct answer either way.
  if (!job) notFound();

  const [bids, prosNearby] = await Promise.all([
    listBidsForJob(jobId),
    countProsInRange(jobId),
  ]);

  const requestedSort = Array.isArray(query.sort) ? query.sort[0] : query.sort;
  const sort: BidSort = isBidSort(requestedSort)
    ? requestedSort
    : "recommended";

  const ordered = sortBids(bids, sort);
  const highlights = bidHighlights(bids);
  const chosen = bids.find((bid) => bid.status === "selected") ?? null;
  const liveCount = bids.filter((bid) => bid.status === "pending").length;

  const mapsKey = getBrowserMapsKey();

  return (
    <div className="space-y-6">
      <RealtimeRefresh table="bids" filter={`job_id=eq.${jobId}`} />

      <header
        className={`rounded-2xl p-6 text-white ${chosen ? "bg-cta-strong" : "bg-brand"}`}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold sm:text-3xl">
              {chosen
                ? "בחרתם בעל מקצוע — הקריאה שובצה"
                : "הקריאה פורסמה — Handy מחפשת בעלי מקצוע בסביבה"}
            </h1>
            <p className="mt-2 text-white/85">
              {job.categoryName ?? "קריאה"} · {job.addressText} · נמצאו{" "}
              <span className="ltr-nums">{prosNearby}</span> בעלי מקצוע ברדיוס{" "}
              <span className="ltr-nums">{job.searchRadiusKm}</span> ק״מ
            </p>
          </div>
          <span dir="ltr" className="font-mono text-sm text-white/80">
            {jobReference(job.id)}
          </span>
        </div>
      </header>

      {/* The offers take the wide, leading (right, in RTL) column and the map
          column sits at the end — the split in customer-2.2-compare-bids.png.
          The order is pinned at every breakpoint, not only at lg: stacked on
          a phone the offers still have to come first, which is what the
          customer opened the page for. */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <aside className="order-2 space-y-4">
          <Card className="overflow-hidden p-0">
            {mapsKey && job.latitude !== null && job.longitude !== null ? (
              <iframe
                title="בעלי מקצוע בסביבת הכתובת שלך"
                loading="lazy"
                className="h-56 w-full border-0"
                src={`https://www.google.com/maps/embed/v1/place?key=${encodeURIComponent(mapsKey)}&q=${job.latitude},${job.longitude}&zoom=13&language=he&region=IL`}
              />
            ) : (
              <div className="flex h-56 flex-col items-center justify-center gap-2 bg-canvas p-6 text-center">
                <span aria-hidden className="text-3xl">
                  🗺️
                </span>
                <p className="text-sm font-semibold text-ink">
                  המפה תוצג כשיוגדר מפתח Google Maps
                </p>
                <p className="text-xs text-muted">
                  מספר בעלי המקצוע בסביבה מחושב במסד הנתונים ואינו תלוי במפה.
                </p>
              </div>
            )}
            <p className="border-t border-line p-4 text-sm text-muted">
              כל ההצעות מבעלי מקצוע מאומתים ברדיוס{" "}
              <span className="ltr-nums">{job.searchRadiusKm}</span> ק״מ מהכתובת
              שלך.
            </p>
          </Card>

          <Card>
            <h2 className="font-bold text-ink">איך לבחור נכון</h2>
            <ul className="mt-3 space-y-2 text-sm text-muted">
              <li>· המחיר כולל ביקור — אין דמי הגעה נפרדים.</li>
              <li>· בדקו דירוג מול מספר עבודות, לא רק את המחיר.</li>
              <li>· שאלו בצ׳אט מה בדיוק כלול לפני שבוחרים.</li>
            </ul>
          </Card>

          <Card>
            <h2 className="font-bold text-ink">הקריאה שלכם</h2>
            <p className="mt-2 text-sm whitespace-pre-line text-ink">
              {job.description}
            </p>
            <JobMediaGallery
              photoPaths={job.photoPaths}
              videoPath={job.videoPath}
              voiceNotePath={job.voiceNotePath}
            />
          </Card>
        </aside>

        <div className="order-1 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-bold text-ink">
              {bids.length === 0
                ? "עדיין לא התקבלו הצעות"
                : bids.length === 1
                  ? "התקבלה הצעה אחת"
                  : `${bids.length} הצעות התקבלו`}
            </h2>

            {bids.length > 1 && !chosen && (
              <nav aria-label="מיון הצעות" className="flex flex-wrap gap-2">
                {BID_SORTS.map((option) => (
                  <Link
                    key={option}
                    href={`${CUSTOMER_ROUTES.offers(jobId)}?sort=${option}`}
                    aria-current={option === sort ? "true" : undefined}
                    className={`rounded-xl border px-4 py-2 text-sm font-semibold transition-colors ${
                      option === sort
                        ? "border-ink bg-ink text-white"
                        : "border-line bg-surface text-ink hover:border-brand/40"
                    }`}
                  >
                    {BID_SORT_LABEL[option]}
                  </Link>
                ))}
              </nav>
            )}
          </div>

          {chosen ? (
            <p className="rounded-2xl border border-cta bg-cta/10 p-4 text-sm font-semibold text-cta-strong">
              ✓ ההצעה של {chosen.proName ?? "בעל המקצוע"} על סך{" "}
              <span className="ltr-nums">
                {chosen.price.toLocaleString("he-IL")}
              </span>{" "}
              ₪ אושרה. המחיר נעול — כל שינוי בשטח יחייב תמונה ואישור שלכם.
            </p>
          ) : (
            liveCount > 0 && (
              <p className="text-sm text-muted">
                {liveCount === 1
                  ? "הצעה אחת פעילה"
                  : `${liveCount} הצעות פעילות`}{" "}
                · כל הצעה תקפה 45 דקות מרגע שליחתה.
              </p>
            )
          )}

          {bids.length === 0 ? (
            <Card className="p-10 text-center">
              <p className="text-lg font-bold text-ink">
                ההצעות הראשונות מגיעות תוך דקות
              </p>
              <p className="mt-2 text-muted">
                הקריאה נשלחה ל-<span className="ltr-nums">{prosNearby}</span>{" "}
                בעלי מקצוע מאומתים בסביבה. אין צורך לרענן — הצעה חדשה תופיע כאן
                מעצמה.
              </p>
              <Link
                href={CUSTOMER_ROUTES.account}
                className={`${BUTTON_QUIET} mt-5 inline-flex`}
              >
                לאזור האישי
              </Link>
            </Card>
          ) : (
            <ul className="space-y-4">
              {ordered.map((bid) => (
                <BidCard
                  key={bid.id}
                  bid={bid}
                  jobId={jobId}
                  highlights={highlights.get(bid.id) ?? []}
                  decided={chosen !== null}
                />
              ))}
            </ul>
          )}

          {!chosen &&
            ordered.some(
              (bid) =>
                bid.status === "pending" && minutesLeft(bid.expiresAt) <= 10,
            ) && (
              <p className="text-sm font-semibold text-alert">
                לשים לב: לחלק מההצעות נותרו פחות מ-10 דקות תוקף.
              </p>
            )}
        </div>
      </div>
    </div>
  );
}
