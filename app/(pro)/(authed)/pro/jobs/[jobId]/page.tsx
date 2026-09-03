import Link from "next/link";
import { notFound } from "next/navigation";
import { JobProgressPanel } from "@/components/pro/JobProgressPanel";
import { LocationReporter } from "@/components/pro/LocationReporter";
import { CompleteJobForm } from "@/components/pro/CompleteJobForm";
import { PriceUpdateForm } from "@/components/pro/PriceUpdateForm";
import { ChatDock } from "@/components/ui/ChatDock";
import { ChatPanel } from "@/components/ui/ChatPanel";
import { LiveMap } from "@/components/ui/LiveMap";
import { MarkThreadRead } from "@/components/ui/MarkThreadRead";
import { Badge, BUTTON_QUIET, Card } from "@/components/ui/primitives";
import { RealtimeRefresh } from "@/components/ui/RealtimeRefresh";
import { PRO_ROUTES } from "@/lib/routes";
import { getJob } from "@/lib/supabase/jobs";
import { getMyProProfile } from "@/lib/supabase/pros";
import { listMyThreads, listThreadMessages } from "@/lib/supabase/messages";
import {
  listPriceUpdates,
  pendingUpdate,
  signPriceUpdatePhotos,
} from "@/lib/supabase/priceUpdates";
import { requireRole } from "@/lib/supabase/session";
import {
  getJobContact,
  getJobLocation,
  listMyActiveJobs,
} from "@/lib/supabase/tracking";
import { jobReference } from "@/lib/validation/jobs";
import { isPaymentMethod } from "@/lib/validation/completion";
import {
  formatIls,
  PRICE_UPDATE_STATUS_LABEL_PRO,
} from "@/lib/validation/priceUpdates";

export const metadata = { title: "ניהול עבודה — Handy Pro" };

export const dynamic = "force-dynamic";

/**
 * design/screens/pro-3.1-manage-job-price-update.png — ניהול עבודה + עדכון
 * מחיר, the pro's half of product-spec.md 4.5.
 *
 * The orange card leads the sidebar because it is the reason this screen
 * exists: everything else here (the route, the phone number, the progress bar)
 * is convenience, and the price-update flow is the product's central rule.
 *
 * The job is fetched through `my_active_jobs()` rather than by reading the row
 * and trusting it: that function already answers "is this job assigned to *me*
 * and still live", and a job that is not in its result is one this screen has
 * no business rendering. The 404 is therefore the RLS answer, not a guess.
 */
export default async function ProManageJobPage({
  params,
}: PageProps<"/pro/jobs/[jobId]">) {
  const user = await requireRole("pro");

  const { jobId } = await params;

  const active = (await listMyActiveJobs()).find(
    (candidate) => candidate.jobId === jobId,
  );
  if (!active) notFound();

  const [job, contact, location, updates, threads, profile] = await Promise.all([
    getJob(jobId),
    getJobContact(jobId),
    getJobLocation(jobId),
    listPriceUpdates(jobId),
    listMyThreads(),
    getMyProProfile(),
  ]);
  if (!job) notFound();

  const pending = pendingUpdate(updates);
  const settled = updates.filter((update) => update.status !== "pending");

  const photos = await signPriceUpdatePhotos(
    updates.map((update) => update.photoPath),
  );

  // The methods this pro ticked in onboarding, ordered first on the closing
  // form. A hint, never a gate: a customer can hand over cash to a pro who
  // only listed Bit, and the receipt has to be able to say so.
  const acceptedMethods = (profile?.paymentMethods ?? []).filter(
    isPaymentMethod,
  );

  const thread =
    threads.find(
      (candidate) => candidate.jobId === jobId && candidate.proId === user.id,
    ) ?? null;

  const messages = thread
    ? await listThreadMessages(thread.jobId, thread.proId)
    : [];

  const destination =
    job.latitude !== null && job.longitude !== null
      ? { lat: job.latitude, lng: job.longitude }
      : null;

  return (
    <div className="space-y-6 pb-24">
      {/* The customer's decision on a price update lands on this screen
          without a reload — it is the answer the pro is standing there
          waiting for. */}
      <RealtimeRefresh table="price_updates" filter={`job_id=eq.${jobId}`} />
      <RealtimeRefresh table="jobs" filter={`id=eq.${jobId}`} />

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-ink">ניהול עבודה</h1>
          <p className="mt-2 text-muted">
            {active.categoryName} ·{" "}
            <span dir="ltr" className="font-mono">
              {jobReference(jobId)}
            </span>
          </p>
        </div>

        <Link href={PRO_ROUTES.myJobs} className={BUTTON_QUIET}>
          לכל העבודות שלי
        </Link>
      </header>

      {/* The sidebar leads (right, in RTL), as in the design; the map and the
          progress bar fill the rest. */}
      <div className="grid gap-6 lg:grid-cols-[22rem_minmax(0,1fr)] lg:items-start">
        <aside className="space-y-4">
          {pending ? (
            <section className="rounded-2xl border-2 border-alert bg-surface p-5">
              <h2 className="text-lg font-bold text-ink">
                בקשת עדכון מחיר נשלחה
              </h2>
              <p className="mt-2 text-sm text-ink">
                ממתין להחלטת הלקוח:{" "}
                <span className="ltr-nums text-muted line-through">
                  {formatIls(pending.originalPrice)}
                </span>{" "}
                →{" "}
                <span className="ltr-nums font-bold text-alert">
                  {formatIls(pending.newPrice)}
                </span>{" "}
                ₪
              </p>
              <p className="mt-3 rounded-xl bg-alert-soft p-3 text-sm text-ink">
                עד שהלקוח יאשר, העבודה במחיר המקורי —{" "}
                <span className="ltr-nums font-bold">
                  {formatIls(active.agreedPrice)}
                </span>{" "}
                ₪. אי אפשר לגבות יותר מזה בלי אישור.
              </p>
            </section>
          ) : (
            <PriceUpdateForm
              jobId={jobId}
              proId={user.id}
              originalPrice={active.currentPrice}
            />
          )}

          <div className="space-y-2">
            <p className="rounded-xl bg-canvas p-3 text-sm text-muted">
              {active.currentPrice === active.agreedPrice
                ? "המחיר שסוכם בהצעה שנבחרה."
                : `כולל עדכון מחיר שהלקוח אישר (מחיר מקורי ${formatIls(active.agreedPrice)} ₪).`}
            </p>

            {pending && (
              <p className="rounded-xl bg-alert-soft p-3 text-sm text-ink">
                אם תסגרו את העבודה עכשיו, בקשת עדכון המחיר שממתינה תיסגר
                כ&quot;לא אושרה&quot; והגבייה תהיה על{" "}
                <span className="ltr-nums font-bold">
                  {formatIls(active.currentPrice)}
                </span>{" "}
                ₪.
              </p>
            )}

            <CompleteJobForm
              jobId={jobId}
              totalPrice={active.currentPrice}
              acceptedMethods={acceptedMethods}
            />
          </div>

          {settled.length > 0 && (
            <Card>
              <h2 className="font-bold text-ink">עדכוני מחיר קודמים</h2>
              <ul className="mt-3 space-y-3">
                {settled.map((update) => (
                  <li
                    key={update.id}
                    className="rounded-xl border border-line p-3 text-sm"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-ink">
                        <span className="ltr-nums text-muted line-through">
                          {formatIls(update.originalPrice)}
                        </span>{" "}
                        →{" "}
                        <span className="ltr-nums font-bold">
                          {formatIls(update.newPrice)}
                        </span>{" "}
                        ₪
                      </span>
                      <Badge
                        tone={update.status === "approved" ? "done" : "neutral"}
                      >
                        {PRICE_UPDATE_STATUS_LABEL_PRO[update.status]}
                      </Badge>
                    </div>
                    {photos.get(update.photoPath) && (
                      /* eslint-disable-next-line @next/next/no-img-element --
                         a signed, expiring Storage URL: next/image would cache
                         a URL that dies. */
                      <img
                        src={photos.get(update.photoPath)!}
                        alt="התמונה שצולמה בשטח"
                        className="mt-2 max-h-32 w-full rounded-lg object-cover"
                      />
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </aside>

        <div className="space-y-4">
          <p className="rounded-2xl bg-cta/10 p-4 text-center font-bold text-cta-strong">
            <span
              aria-hidden
              className="me-2 inline-block size-2 rounded-full bg-cta align-middle"
            />
            הלקוח בחר בהצעה שלך —{" "}
            <span className="ltr-nums">{formatIls(active.agreedPrice)}</span> ₪
          </p>

          <LiveMap
            location={location}
            destination={destination}
            caption="route map · הנסיעה ללקוח"
          />

          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-48">
                <p className="font-bold text-ink">
                  {active.customerName ?? "הלקוח"}
                </p>
                <p className="mt-1 text-sm text-muted">{active.addressText}</p>
              </div>

              <div className="flex flex-wrap gap-2">
                {destination && (
                  <a
                    href={`https://www.google.com/maps/dir/?api=1&destination=${destination.lat},${destination.lng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-xl bg-pro px-4 py-2 text-sm font-bold text-white hover:bg-pro-strong"
                  >
                    פתח ניווט
                  </a>
                )}
                {contact && (
                  <a
                    href={`tel:+${contact.phone}`}
                    className={`${BUTTON_QUIET} px-4 py-2 text-sm`}
                  >
                    ☎ חיוג
                  </a>
                )}
              </div>
            </div>

            <p className="mt-4 border-t border-line pt-4 text-sm whitespace-pre-line text-ink">
              {job.description}
            </p>
          </Card>

          <LocationReporter
            jobId={jobId}
            live={
              active.status === "assigned" || active.status === "in_progress"
            }
          />

          <JobProgressPanel jobId={jobId} status={active.status} />
        </div>
      </div>

      {thread && (
        <ChatDock
          title={`צ׳אט עם ${thread.counterpartName ?? "הלקוח"}`}
          unreadCount={thread.unreadCount}
          tone="pro"
        >
          <MarkThreadRead
            jobId={thread.jobId}
            proId={thread.proId}
            unreadCount={thread.unreadCount}
          />
          <ChatPanel
            jobId={thread.jobId}
            proId={thread.proId}
            messages={messages}
            tone="pro"
          />
        </ChatDock>
      )}
    </div>
  );
}
