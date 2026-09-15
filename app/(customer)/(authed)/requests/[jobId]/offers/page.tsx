import Link from "next/link";
import { notFound } from "next/navigation";
import { AddJobDetails } from "@/components/customer/AddJobDetails";
import { CancelJobForm } from "@/components/customer/CancelJobForm";
import { DisputeOpener } from "@/components/ui/DisputeOpener";
import { listJobDisputes } from "@/lib/supabase/disputes";
import { CANCEL_REASON_LABEL } from "@/lib/validation/cancellation";
import { BidCard } from "@/components/customer/BidCard";
import { OpenToAllButton } from "@/components/customer/OpenToAllButton";
import { NoProsNearby } from "@/components/customer/NoProsNearby";
import { WaitingForProCard } from "@/components/customer/WaitingForProCard";
import { JobMediaGallery } from "@/components/customer/JobMediaGallery";
import {
  BUTTON_COMPACT,
  BUTTON_CTA,
  BUTTON_QUIET,
  Card,
  CARD_BASE,
  EmptyState,
  SECTION_TITLE,
} from "@/components/ui/primitives";
import { RealtimeRefresh } from "@/components/ui/RealtimeRefresh";
import { CheckIcon, ClockIcon, MapIcon } from "@/components/ui/icons";
import { getBrowserMapsKey } from "@/lib/maps/config";
import { CUSTOMER_ROUTES } from "@/lib/routes";
import {
  bidHighlights,
  countJobViews,
  countProsInRange,
  listBidsForJob,
  sortBids,
  sweepExpiredBids,
} from "@/lib/supabase/bids";
import { getJob, getRequestedPro } from "@/lib/supabase/jobs";
import { requireRole } from "@/lib/supabase/session";
import {
  BID_SORTS,
  BID_SORT_LABEL,
  isBidSort,
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
 * says so instead, and the count beside it — "נשלחה ל-N בעלי מקצוע מאומתים" —
 * is a real PostGIS count either way, which is the part that carries meaning.
 */
export default async function JobOffersPage({
  params,
  searchParams,
}: PageProps<"/requests/[jobId]/offers">) {
  const user = await requireRole("customer");

  const [{ jobId }, query] = await Promise.all([params, searchParams]);

  // Housekeeping before reading, so a lapsed offer is never rendered as live
  // on a stack with no scheduler. Nothing depends on it: the read below
  // reports a lapsed bid as expired whether or not this ran.
  await sweepExpiredBids();

  const job = await getJob(jobId);
  // RLS returns nothing for someone else's job, which arrives here as "no such
  // job" — the correct answer either way.
  if (!job) notFound();

  // Phase 15: a cancelled call has nothing left to compare. It says who
  // cancelled and why, and — when it was not the customer — offers the dispute
  // that is the check on a pro reporting a cancellation that never happened.
  if (job.status === "cancelled") {
    const disputes =
      job.cancelledBy === "customer" ? [] : await listJobDisputes(jobId);
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <EmptyState
          title="הקריאה בוטלה"
          body={
            job.cancelledBy === "customer"
              ? `ביטלתם אותה${
                  job.cancelReason
                    ? ` — ${CANCEL_REASON_LABEL[job.cancelReason as keyof typeof CANCEL_REASON_LABEL] ?? ""}`
                    : ""
                }. כל ההצעות שהתקבלו נסגרו, ולא נגבה דבר מאף אחד.`
              : job.cancelledBy === "pro"
                ? "בעל המקצוע דיווח שביקשתם לבטל אחרי שהעבודה אושרה. לא ביקשתם? ספרו לנו כאן למטה."
                : "צוות Handy ביטל את העבודה. אם יש שאלה, אפשר לפנות אלינו כאן למטה."
          }
          action={
            <Link
              href={CUSTOMER_ROUTES.newRequestFor(job.categorySlug)}
              className={BUTTON_QUIET}
            >
              פרסום קריאה חדשה
            </Link>
          }
        />
        {job.cancelledBy !== "customer" && (
          <DisputeOpener
            jobId={jobId}
            existingStatus={disputes[0]?.status}
            resolutionNote={disputes[0]?.resolutionNote ?? null}
            creditAmount={disputes[0]?.creditAmount ?? null}
          />
        )}
      </div>
    );
  }

  // A call directed at one pro through their personal link (Phase 13.8), and
  // still waiting on them alone.
  const directed = job.requestedProId !== null && job.openedToAllAt === null;

  const [bids, prosNearby, views, requestedPro] = await Promise.all([
    listBidsForJob(jobId),
    countProsInRange(jobId),
    countJobViews(jobId),
    job.requestedProId ? getRequestedPro(jobId) : Promise.resolve(null),
  ]);

  // Read once, on the server, so "היום"/"מחר" on a window is the same answer
  // on both sides of hydration.
  const now = new Date().toISOString();

  // Adding to a call is possible until a pro takes it (add_job_details()).
  const collecting = job.status === "open" || job.status === "bidding";

  const requestedSort = Array.isArray(query.sort) ? query.sort[0] : query.sort;
  const sort: BidSort = isBidSort(requestedSort)
    ? requestedSort
    : "recommended";

  const ordered = sortBids(bids, sort);
  const highlights = bidHighlights(bids);
  // Three states now, not two: nobody chosen, chosen but unanswered, taken.
  const chosen = bids.find((bid) => bid.status === "accepted") ?? null;
  const waiting = bids.find((bid) => bid.status === "selected") ?? null;
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
                : waiting
                  ? "ממתינים לאישור בעל המקצוע"
                  : "הקריאה פורסמה — Handy מחפשת בעלי מקצוע בסביבה"}
            </h1>
            <p className="mt-2 text-white/85">
              {job.categoryName ?? "קריאה"} · {job.addressText} ·{" "}
              {/* "נמצאו 0 בעלי מקצוע" is the default answer on a thin market,
                  and reads as a bug rather than as a fact. Zero gets its own
                  sentence — and the card below explains it. No radius in
                  either: the customer has not had one since 11.9.2026, and a
                  number they never chose is not theirs to be told. */}
              {directed ? (
                <>
                  הקריאה נשלחה רק אל{" "}
                  {requestedPro?.fullName ?? "בעל המקצוע שביקשתם"}
                </>
              ) : prosNearby === 0 ? (
                <>אין כרגע בעל מקצוע מאומת שמכסה את הכתובת</>
              ) : (
                <>
                  הקריאה נשלחה ל-
                  <span className="ltr-nums">{prosNearby}</span> בעלי מקצוע
                  מאומתים באזור
                </>
              )}
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
                <MapIcon className="size-8 text-muted" />
                <p className="text-sm font-semibold text-ink">
                  המפה תוצג כשיוגדר מפתח Google Maps
                </p>
                <p className="text-xs text-muted">
                  מספר בעלי המקצוע בסביבה מחושב במסד הנתונים ואינו תלוי במפה.
                </p>
              </div>
            )}
            <p className="border-t border-line p-4 text-sm text-muted">
              כל ההצעות מבעלי מקצוע מאומתים שהגדירו אזור פעילות שכולל את הכתובת
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
            {/* With offers already on the screen the pulse card is gone, so
                adding to the call lives here instead. */}
            {collecting && (bids.length > 0 || directed) && (
              <AddJobDetails
                jobId={jobId}
                userId={user.id}
                photoCount={job.photoPaths.length}
              />
            )}
          </Card>

          {/* Phase 15: until a pro accepts, cancelling is the customer's own,
              and free. After that it goes through the pro or support. */}
          {!chosen &&
            (job.status === "open" ||
              job.status === "bidding" ||
              job.status === "awaiting_pro") && (
              <Card>
                <CancelJobForm jobId={jobId} />
              </Card>
            )}
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

            {/* A segmented control, not three loose chips: one border around
                the set says these are the three states of one choice.
                `min-h-11` because 34px was under the floor a thumb can hit, and
                a focus ring because until Phase 13.5 there was none — on the
                screen where the next press assigns work. */}
            {bids.length > 1 && !chosen && !waiting && (
              <nav
                aria-label="מיון הצעות"
                className="inline-flex overflow-hidden rounded-xl border border-line bg-surface"
              >
                {BID_SORTS.map((option) => (
                  <Link
                    key={option}
                    href={`${CUSTOMER_ROUTES.offers(jobId)}?sort=${option}`}
                    aria-current={option === sort ? "true" : undefined}
                    className={`inline-flex min-h-11 items-center px-4 text-sm font-semibold transition-colors not-first:border-s not-first:border-line focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none focus-visible:ring-inset ${
                      option === sort
                        ? "bg-ink text-white"
                        : "text-ink hover:bg-canvas"
                    }`}
                  >
                    {BID_SORT_LABEL[option]}
                  </Link>
                ))}
              </nav>
            )}
          </div>

          {chosen ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-cta bg-cta/10 p-4">
              <p className="text-sm font-semibold text-cta-strong">
                ✓ ההצעה של {chosen.proName ?? "בעל המקצוע"} על סך{" "}
                <span className="ltr-nums">
                  {chosen.price.toLocaleString("he-IL")}
                </span>{" "}
                ₪ אושרה. המחיר נעול — כל שינוי בשטח יחייב תמונה ואישור שלכם.
              </p>
              <Link
                href={CUSTOMER_ROUTES.track(jobId)}
                className={`${BUTTON_CTA} ${BUTTON_COMPACT}`}
              >
                מעקב חי
              </Link>
            </div>
          ) : waiting ? (
            <WaitingForProCard
              bid={waiting}
              jobId={jobId}
              otherLiveCount={liveCount}
            />
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

          {/*
            Waiting on the one pro the customer asked for. Stated, with the
            way out beside it: the call stays theirs until they pass (decided
            14.9.2026), and this button is what keeps "until" from meaning
            "for ever".
          */}
          {directed && collecting && (
            <div className={`${CARD_BASE} p-6`}>
              <h3 className={SECTION_TITLE}>
                ממתינים ל{requestedPro?.fullName ?? "בעל המקצוע שביקשתם"}
              </h3>
              <p className="mt-2 text-sm text-muted">
                ביקשתם בעל מקצוע מסוים, ולכן הקריאה נשלחה רק אליו. אם לא יתאים
                לו, היא תיפתח מעצמה לכל בעלי המקצוע המאומתים באזור. לא רוצים
                לחכות? אפשר לפתוח אותה עכשיו.
              </p>
              <div className="mt-4">
                <OpenToAllButton jobId={jobId} />
              </div>
            </div>
          )}

          {bids.length === 0 && directed ? null : bids.length === 0 ? (
            prosNearby === 0 ? (
              <NoProsNearby />
            ) : (
              /*
               * What is happening while nothing has arrived (Phase 13.7). Every
               * line is counted from rows — the pros covering the address, the
               * ones who opened the call — and the views line exists only in
               * this state: once an offer is on the screen, "5 צפו" beside one
               * offer teaches the customer to distrust the only one they have.
               */
              <div className={`${CARD_BASE} p-6`}>
                <div className="flex items-center gap-3">
                  <ClockIcon className="size-7 shrink-0 text-brand" />
                  <h3 className={SECTION_TITLE}>
                    ההצעות הראשונות מגיעות תוך דקות
                  </h3>
                </div>

                <ol className="mt-5 space-y-3 text-sm">
                  <li className="flex items-start gap-2 text-ink">
                    <CheckIcon className="mt-0.5 size-4 shrink-0 text-cta-strong" />
                    <span>
                      הקריאה נשלחה ל-
                      <span className="ltr-nums">{prosNearby}</span> בעלי מקצוע
                      מאומתים באזור
                    </span>
                  </li>
                  <li
                    className={`flex items-start gap-2 ${views ? "text-ink" : "text-muted"}`}
                  >
                    {views ? (
                      <CheckIcon className="mt-0.5 size-4 shrink-0 text-cta-strong" />
                    ) : (
                      <span
                        aria-hidden
                        className="mt-1.5 size-2 shrink-0 rounded-full bg-line"
                      />
                    )}
                    <span>
                      {views === null || views === 0 ? (
                        "עוד אף בעל מקצוע לא פתח אותה"
                      ) : views === 1 ? (
                        "בעל מקצוע אחד כבר צפה בה"
                      ) : (
                        <>
                          <span className="ltr-nums">{views}</span> בעלי מקצוע
                          כבר צפו בה
                        </>
                      )}
                    </span>
                  </li>
                  <li className="flex items-start gap-2 text-muted">
                    <span
                      aria-hidden
                      className="mt-1.5 size-2 shrink-0 rounded-full bg-line"
                    />
                    <span>הצעה ראשונה תופיע כאן מעצמה — אין צורך לרענן</span>
                  </li>
                </ol>

                {collecting && (
                  <div className="mt-6 border-t border-line pt-5">
                    <p className="text-sm text-muted">
                      תמונה או עוד כמה פרטים עוזרים לבעלי מקצוע לתמחר מהר יותר.
                    </p>
                    <AddJobDetails
                      jobId={jobId}
                      userId={user.id}
                      photoCount={job.photoPaths.length}
                      prominent
                    />
                  </div>
                )}

                <Link
                  href={CUSTOMER_ROUTES.account}
                  className={`${BUTTON_QUIET} ${BUTTON_COMPACT} mt-4 w-full`}
                >
                  לאזור האישי
                </Link>
              </div>
            )
          ) : (
            <ul className="space-y-4">
              {ordered.map((bid, index) => (
                <BidCard
                  key={bid.id}
                  bid={bid}
                  jobId={jobId}
                  highlights={highlights.get(bid.id) ?? []}
                  decided={chosen !== null}
                  /* Only under "מומלץ", and only while the choice is still
                     open: lifting a card under a price sort would be the
                     screen recommending something the sort did not. */
                  now={now}
                  featured={
                    index === 0 &&
                    sort === "recommended" &&
                    !chosen &&
                    !waiting &&
                    ordered.length > 1
                  }
                />
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
