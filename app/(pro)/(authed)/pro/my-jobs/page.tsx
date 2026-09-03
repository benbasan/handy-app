import Link from "next/link";
import {
  Badge,
  BUTTON_PRO,
  BUTTON_QUIET,
  Card,
} from "@/components/ui/primitives";
import { RealtimeRefresh } from "@/components/ui/RealtimeRefresh";
import { PRO_ROUTES, receiptPath } from "@/lib/routes";
import {
  getMyEarningsStats,
  listMyCompletedJobs,
} from "@/lib/supabase/completion";
import { requireRole } from "@/lib/supabase/session";
import { listMyActiveJobs } from "@/lib/supabase/tracking";
import { relativeTime } from "@/lib/validation/bids";
import { formatIls } from "@/lib/validation/priceUpdates";
import { PAYMENT_METHOD_LABEL } from "@/lib/validation/pros";
import { JOB_PROGRESS_LABEL_PRO } from "@/lib/validation/tracking";

export const metadata = { title: "העבודות שלי — Handy Pro" };

export const dynamic = "force-dynamic";

/**
 * design/screens/pro-3.2-my-jobs.png — העבודות שלי, both tabs.
 *
 * Phase 5 built פעילות and named היסטוריה without building it, because a
 * finished job did not exist yet. It does now: the history tab lists what
 * `my_completed_jobs()` returns, each row with the receipt the customer can
 * also download.
 *
 * The design's summary card counts "עבודות · סה״כ הכנסות · ביטולים". The first
 * two are real numbers now and are shown. ביטולים is not: nothing in the
 * product can cancel an assigned job yet, so the count would be a permanent
 * zero dressed as a metric — the same reason Phase 2 and 3 dropped the
 * prototype's invented figures. What replaces it is the one number a pro
 * actually wants beside their earnings: what Handy took.
 */
export default async function ProMyJobsPage({
  searchParams,
}: PageProps<"/pro/my-jobs">) {
  const user = await requireRole("pro");

  const { tab } = await searchParams;
  const showingHistory = tab === "history";

  const [active, completed, stats] = await Promise.all([
    listMyActiveJobs(),
    listMyCompletedJobs(),
    getMyEarningsStats(),
  ]);

  const openValue = active.reduce((sum, job) => sum + job.currentPrice, 0);
  const awaitingDecision = active.filter(
    (job) => job.pendingUpdateCount > 0,
  ).length;

  return (
    <div className="space-y-6">
      {/* A customer answering a price update, or a new job being assigned,
          both change these lists without the pro touching anything. */}
      <RealtimeRefresh
        table="bids"
        filter={`pro_id=eq.${user.id}`}
        label="המסך מתעדכן מעצמו"
      />

      <header>
        <h1 className="text-3xl font-bold text-ink sm:text-4xl">העבודות שלי</h1>
        <p className="mt-2 text-muted">
          {showingHistory
            ? "עבודות שהושלמו, עם הקבלה והעמלה של כל אחת."
            : "העבודות שנבחרת אליהן ועדיין לא הסתיימו."}
        </p>
      </header>

      <nav className="flex flex-wrap gap-2" aria-label="לשוניות">
        <TabLink href={PRO_ROUTES.myJobs} current={!showingHistory}>
          פעילות
          <Count>{active.length}</Count>
        </TabLink>
        <TabLink
          href={`${PRO_ROUTES.myJobs}?tab=history`}
          current={showingHistory}
        >
          היסטוריה
          <Count>{completed.length}</Count>
        </TabLink>
      </nav>

      <div className="grid gap-6 lg:grid-cols-[20rem_minmax(0,1fr)] lg:items-start">
        <aside className="space-y-4">
          <Card>
            <h2 className="text-lg font-bold text-ink">סיכום פעילות</h2>
            <dl className="mt-4 space-y-3 text-sm">
              <SummaryRow label="עבודות פעילות" value={`${active.length}`} />
              <SummaryRow
                label="שווי העבודות הפתוחות"
                value={`${formatIls(openValue)} ₪`}
              />
              <SummaryRow
                label="ממתינות לאישור מחיר"
                value={`${awaitingDecision}`}
                tone={awaitingDecision > 0 ? "alert" : undefined}
              />
            </dl>
          </Card>

          <Card>
            <h2 className="text-lg font-bold text-ink">מאז שהצטרפת</h2>
            <dl className="mt-4 space-y-3 text-sm">
              <SummaryRow
                label="עבודות שהושלמו"
                value={`${stats.lifetimeJobsCount}`}
              />
              <SummaryRow
                label="סה״כ הכנסות"
                value={`${formatIls(stats.lifetimeGross)} ₪`}
              />
              <SummaryRow
                label="עמלות Handy"
                value={`${formatIls(stats.lifetimeCommission)} ₪`}
              />
            </dl>
            <Link
              href={PRO_ROUTES.wallet}
              className={`${BUTTON_QUIET} mt-4 w-full px-4 py-2 text-sm`}
            >
              לארנק ולהכנסות
            </Link>
          </Card>
        </aside>

        {showingHistory ? (
          <HistoryList jobs={completed} />
        ) : (
          <ActiveList jobs={active} />
        )}
      </div>
    </div>
  );
}

function TabLink({
  href,
  current,
  children,
}: {
  href: string;
  current: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={current ? "page" : undefined}
      className={`inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold transition-colors ${
        current
          ? "bg-pro text-white"
          : "border border-line bg-surface text-ink hover:bg-canvas"
      }`}
    >
      {children}
    </Link>
  );
}

function Count({ children }: { children: React.ReactNode }) {
  return <span className="ltr-nums text-xs opacity-80">({children})</span>;
}

function SummaryRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "alert";
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd
        className={`ltr-nums text-lg font-bold ${
          tone === "alert" ? "text-alert" : "text-ink"
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

function ActiveList({
  jobs,
}: {
  jobs: Awaited<ReturnType<typeof listMyActiveJobs>>;
}) {
  if (jobs.length === 0) {
    return (
      <Card className="p-10 text-center">
        <p className="text-lg font-bold text-ink">אין לך כרגע עבודה פעילה</p>
        <p className="mt-2 text-muted">
          עבודה מגיעה לכאן ברגע שלקוח בוחר בהצעה שלך.
        </p>
        <Link href={PRO_ROUTES.jobs} className={`${BUTTON_PRO} mt-5 inline-flex`}>
          לפיד הקריאות
        </Link>
      </Card>
    );
  }

  return (
    <ul className="space-y-4">
      {jobs.map((job) => (
        <li
          key={job.jobId}
          className={`rounded-2xl border bg-surface p-5 ${
            job.pendingUpdateCount > 0
              ? "border-alert"
              : job.status === "in_progress"
                ? "border-pro"
                : "border-line"
          }`}
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-56 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-bold text-ink">
                  {job.description.split("\n")[0]!.slice(0, 70)}
                </h2>
                <Badge tone={job.status === "in_progress" ? "pro" : "open"}>
                  {
                    JOB_PROGRESS_LABEL_PRO[
                      job.status === "in_progress" ? "in_progress" : "assigned"
                    ]
                  }
                </Badge>
              </div>
              <p className="mt-1 text-sm text-muted">
                {job.customerName ?? "לקוח"} · {job.addressText} · שובץ{" "}
                {relativeTime(job.assignedAt)}
              </p>
            </div>

            <p className="text-xl font-bold text-cta-strong">
              <span className="ltr-nums">{formatIls(job.currentPrice)}</span> ₪
            </p>
          </div>

          {job.pendingUpdateCount > 0 && (
            <p className="mt-3 rounded-xl bg-alert-soft p-3 text-sm font-semibold text-alert">
              בקשת עדכון מחיר ממתינה להחלטת הלקוח. עד שיאשר — העבודה במחיר
              המקורי,{" "}
              <span className="ltr-nums">{formatIls(job.agreedPrice)}</span> ₪.
            </p>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href={PRO_ROUTES.manageJob(job.jobId)}
              className={`${BUTTON_PRO} px-4 py-2 text-sm`}
            >
              {job.status === "in_progress" ? "המשך עבודה" : "פרטי עבודה"}
            </Link>

            <Link
              href={`${PRO_ROUTES.messages}?job=${job.jobId}`}
              className={`${BUTTON_QUIET} px-4 py-2 text-sm`}
            >
              הודעות
              {job.unreadCount > 0 && (
                <span className="inline-flex size-5 items-center justify-center rounded-full bg-alert text-xs font-bold text-white">
                  {job.unreadCount}
                </span>
              )}
            </Link>
          </div>
        </li>
      ))}
    </ul>
  );
}

function HistoryList({
  jobs,
}: {
  jobs: Awaited<ReturnType<typeof listMyCompletedJobs>>;
}) {
  if (jobs.length === 0) {
    return (
      <Card className="p-10 text-center">
        <p className="text-lg font-bold text-ink">עוד לא סגרת עבודה</p>
        <p className="mt-2 text-muted">
          עבודה עוברת לכאן ברגע שתלחצו &quot;סיימתי — עדכן גבייה&quot;, יחד עם
          הקבלה והעמלה שלה.
        </p>
      </Card>
    );
  }

  return (
    <ul className="space-y-4">
      {jobs.map((job) => (
        <li
          key={job.jobId}
          className="rounded-2xl border border-line bg-surface p-5"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-56 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-bold text-ink">
                  {job.description.split("\n")[0]!.slice(0, 70)}
                </h2>
                <Badge tone="done">הושלם</Badge>
              </div>
              <p className="mt-1 text-sm text-muted">
                {job.customerName ?? "לקוח"} · {job.addressText} ·{" "}
                {job.categoryName} · נסגר {relativeTime(job.chargedAt)}
              </p>
              <p className="mt-1 text-sm text-muted">
                שולם ב{PAYMENT_METHOD_LABEL[job.paymentMethod]} ·{" "}
                {job.rating === null ? (
                  "ממתין לדירוג"
                ) : (
                  <>
                    ★ <span className="ltr-nums">{job.rating}</span>
                  </>
                )}
              </p>
            </div>

            <div className="text-end">
              <p className="text-xl font-bold text-cta-strong">
                <span className="ltr-nums">{formatIls(job.netAmount)}</span> ₪
              </p>
              <p className="mt-1 text-xs text-muted">
                מתוך <span className="ltr-nums">{formatIls(job.totalPrice)}</span>{" "}
                ₪, עמלה{" "}
                <span className="ltr-nums">{formatIls(job.commissionAmount)}</span>{" "}
                ₪
              </p>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <a
              href={receiptPath(job.jobId)}
              className={`${BUTTON_PRO} px-4 py-2 text-sm`}
            >
              הורד קבלה
            </a>
            <Link
              href={`${PRO_ROUTES.messages}?job=${job.jobId}`}
              className={`${BUTTON_QUIET} px-4 py-2 text-sm`}
            >
              הודעות
            </Link>
          </div>
        </li>
      ))}
    </ul>
  );
}
