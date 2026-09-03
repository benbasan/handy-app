import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PriceUpdateDecision } from "@/components/customer/PriceUpdateDecision";
import { ChatDock } from "@/components/ui/ChatDock";
import { ChatPanel } from "@/components/ui/ChatPanel";
import { LiveMap } from "@/components/ui/LiveMap";
import { MarkThreadRead } from "@/components/ui/MarkThreadRead";
import { BUTTON_QUIET, Badge, Card } from "@/components/ui/primitives";
import { RealtimeRefresh } from "@/components/ui/RealtimeRefresh";
import { CUSTOMER_ROUTES } from "@/lib/routes";
import { listBidsForJob } from "@/lib/supabase/bids";
import { getJob } from "@/lib/supabase/jobs";
import { listMyThreads, listThreadMessages } from "@/lib/supabase/messages";
import {
  listPriceUpdates,
  pendingUpdate,
  signPriceUpdatePhotos,
} from "@/lib/supabase/priceUpdates";
import { requireRole } from "@/lib/supabase/session";
import { getJobContact, getJobLocation } from "@/lib/supabase/tracking";
import { jobReference } from "@/lib/validation/jobs";
import {
  formatIls,
  PRICE_UPDATE_STATUS_LABEL,
} from "@/lib/validation/priceUpdates";

export const metadata = { title: "מעקב אחרי הקריאה — Handy" };

// A pin that moves and a price change that may arrive at any second.
export const dynamic = "force-dynamic";

/**
 * design/screens/customer-3.1-tracking-chat.png — מעקב + צ׳אט, plus the price
 * update modal state of product-spec.md 3.5.
 *
 * Three live things share this screen, and each has its own Realtime
 * subscription: the pin on the map (`job_locations`), the approval card
 * (`price_updates`) and the job's own status (`jobs`). None of them carries
 * data into the page — the subscription only tells the router the server's
 * answer is stale, and the server re-reads under this customer's own RLS. What
 * lands on screen is exactly what a reload would have shown, which for a
 * screen that decides money is the only acceptable arrangement.
 *
 * "מחיר מאושר" is the whole point of the right-hand card: it is
 * `job_effective_price()` — the chosen bid plus every *approved* update — and
 * a request the customer has not answered is nowhere in it.
 */
export default async function JobTrackingPage({
  params,
}: PageProps<"/requests/[jobId]/track">) {
  await requireRole("customer");

  const { jobId } = await params;

  const job = await getJob(jobId);
  // RLS returns nothing for someone else's job, which arrives here as "no such
  // job" — the correct answer either way.
  if (!job) notFound();

  const bids = await listBidsForJob(jobId);
  const chosen = bids.find((bid) => bid.status === "selected") ?? null;

  // Nothing to track until somebody has been chosen; the offers screen is
  // where that happens.
  if (!chosen) redirect(CUSTOMER_ROUTES.offers(jobId));

  // The pro pressed "סיימתי — עדכן גבייה". The `jobs` subscription below wakes
  // this page the moment that lands, and there is nothing left to track: the
  // summary, the receipt and the rating are where the call now lives.
  if (job.status === "completed") redirect(CUSTOMER_ROUTES.summary(jobId));

  const [contact, location, updates, threads] = await Promise.all([
    getJobContact(jobId),
    getJobLocation(jobId),
    listPriceUpdates(jobId),
    listMyThreads(),
  ]);

  const pending = pendingUpdate(updates);
  const decided = updates.filter((update) => update.status !== "pending");

  const photos = await signPriceUpdatePhotos(
    updates.map((update) => update.photoPath),
  );

  // The live price, computed exactly where the database computes it: the
  // chosen bid, replaced by the newest approved update.
  const approved = updates.find((update) => update.status === "approved");
  const currentPrice = approved ? approved.newPrice : chosen.price;

  const thread =
    threads.find(
      (candidate) =>
        candidate.jobId === jobId && candidate.proId === chosen.proId,
    ) ?? null;

  const messages = thread
    ? await listThreadMessages(thread.jobId, thread.proId)
    : [];

  const enRoute = job.status === "assigned";

  return (
    <div className="space-y-6 pb-24">
      <RealtimeRefresh table="job_locations" filter={`job_id=eq.${jobId}`} />
      <RealtimeRefresh table="price_updates" filter={`job_id=eq.${jobId}`} />
      <RealtimeRefresh table="jobs" filter={`id=eq.${jobId}`} />

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-ink">מעקב אחרי הקריאה</h1>
          <p className="mt-2 text-muted">
            {job.categoryName ?? "קריאה"} ·{" "}
            <span dir="ltr" className="font-mono">
              {jobReference(job.id)}
            </span>{" "}
            · {job.addressText}
          </p>
        </div>

        <Link href={CUSTOMER_ROUTES.offers(jobId)} className={BUTTON_QUIET}>
          חזרה להצעות
        </Link>
      </header>

      {/* The sidebar leads (right, in RTL) and the map fills the rest — the
          split in customer-3.1-tracking-chat.png. Pinned at every breakpoint:
          stacked on a phone the status list still comes first. */}
      <div className="grid gap-6 lg:grid-cols-[20rem_minmax(0,1fr)] lg:items-start">
        <aside className="space-y-4">
          <Card>
            <h2 className="text-lg font-bold text-ink">סטטוס הקריאה</h2>
            <ol className="mt-4 space-y-3">
              <StatusTick done>
                ההצעה אושרה ·{" "}
                <span className="ltr-nums">{formatIls(chosen.price)}</span> ₪
              </StatusTick>
              <StatusTick done>בעל המקצוע בדרך</StatusTick>
              <StatusTick done={job.status === "in_progress"}>
                ביצוע העבודה
              </StatusTick>
              <StatusTick done={false}>תשלום וקבלה</StatusTick>
            </ol>
          </Card>

          {pending ? (
            <p className="rounded-2xl border-2 border-alert bg-alert-soft p-4 text-sm font-bold text-alert">
              יש בקשת עדכון מחיר שממתינה להחלטה שלך — היא מופיעה בצד.
            </p>
          ) : (
            <p className="rounded-2xl border border-line bg-surface p-4 text-sm text-muted">
              אין כרגע בקשה לשינוי מחיר. כל שינוי יגיע לכאן עם תמונה מהשטח,
              ויחכה לאישור שלך.
            </p>
          )}

          <Card className="bg-ink text-white">
            <h2 className="font-bold">התראות</h2>
            <ul className="mt-3 space-y-2 text-sm text-white/80">
              <li>· המסך מתעדכן מעצמו — אין צורך לרענן.</li>
              <li>· שינוי מחיר לא ייכנס לתוקף בלי אישור שלך.</li>
              <li>· קבלה דיגיטלית תונפק ברגע שהעבודה תיסגר.</li>
            </ul>
          </Card>
        </aside>

        <div className="space-y-4">
          <p
            className={`rounded-2xl p-4 text-center font-bold ${
              enRoute ? "bg-cta/10 text-cta-strong" : "bg-brand-soft text-brand"
            }`}
          >
            <span
              aria-hidden
              className={`me-2 inline-block size-2 rounded-full align-middle ${
                enRoute ? "bg-cta" : "bg-brand"
              }`}
            />
            {enRoute ? (
              <>
                {chosen.proName ?? "בעל המקצוע"} מ-Handy בדרך אליך
                {location?.etaMinutes !== null &&
                location?.etaMinutes !== undefined ? (
                  <>
                    {" · "}הגעה משוערת{" "}
                    <span className="ltr-nums">{location.etaMinutes}</span> דק׳
                  </>
                ) : (
                  <>
                    {" · "}זמן הגעה שנמסר בהצעה{" "}
                    <span className="ltr-nums">{chosen.etaMinutes}</span> דק׳
                  </>
                )}
              </>
            ) : (
              <>{chosen.proName ?? "בעל המקצוע"} התחיל בעבודה</>
            )}
          </p>

          <LiveMap
            location={location}
            destination={
              job.latitude !== null && job.longitude !== null
                ? { lat: job.latitude, lng: job.longitude }
                : null
            }
            caption="live map · handyman en route"
          />

          {pending && (
            <PriceUpdateDecision
              update={pending}
              photoUrl={photos.get(pending.photoPath) ?? null}
              proName={chosen.proName}
            />
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <Card>
              <div className="flex items-center gap-3">
                <span
                  aria-hidden
                  className="flex size-12 shrink-0 items-center justify-center rounded-full bg-canvas text-lg font-bold text-brand"
                >
                  {(chosen.proName ?? "??").slice(0, 1)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-ink">
                    {chosen.proName ?? "בעל מקצוע"}
                    {job.categoryName ? ` · ${job.categoryName}` : ""}
                  </p>
                  <p className="mt-1 text-sm text-muted">
                    {chosen.proRating !== null && (
                      <>
                        ★{" "}
                        <span className="ltr-nums">
                          {chosen.proRating.toFixed(1)}
                        </span>{" "}
                      </>
                    )}
                    {chosen.proVerified && "· מאומת Handy"}
                  </p>
                </div>

                {contact && (
                  <a
                    href={`tel:+${contact.phone}`}
                    className="shrink-0 rounded-xl bg-ink px-4 py-2 text-sm font-bold text-white"
                  >
                    ☎ חיוג
                  </a>
                )}
              </div>
            </Card>

            <Card>
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-sm font-semibold text-muted">מחיר מאושר</p>
                <p className="text-2xl font-bold text-ink">
                  <span className="ltr-nums">{formatIls(currentPrice)}</span> ₪
                </p>
              </div>
              <p className="mt-2 text-sm text-muted">
                כל שינוי במחיר יופיע כאן ויחייב את אישורך.
              </p>
            </Card>
          </div>

          {decided.length > 0 && (
            <Card>
              <h2 className="font-bold text-ink">היסטוריית עדכוני מחיר</h2>
              <ul className="mt-3 space-y-3">
                {decided.map((update) => (
                  <li
                    key={update.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line p-3 text-sm"
                  >
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
                      {PRICE_UPDATE_STATUS_LABEL[update.status]}
                    </Badge>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>

      {thread && (
        <ChatDock
          title={`צ׳אט עם ${thread.counterpartName ?? "בעל המקצוע"}`}
          unreadCount={thread.unreadCount}
          tone="brand"
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
            tone="brand"
          />
        </ChatDock>
      )}
    </div>
  );
}

/** One line of "סטטוס הקריאה" — a filled tick or a hollow circle. */
function StatusTick({
  done,
  children,
}: {
  done: boolean;
  children: React.ReactNode;
}) {
  return (
    <li className="flex items-center gap-3">
      <span
        aria-hidden
        className={`flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
          done ? "bg-cta text-white" : "border-2 border-line text-transparent"
        }`}
      >
        ✓
      </span>
      <span
        className={`text-sm font-semibold ${done ? "text-ink" : "text-muted"}`}
      >
        {children}
      </span>
    </li>
  );
}
