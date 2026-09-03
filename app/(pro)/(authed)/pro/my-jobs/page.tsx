import Link from "next/link";
import {
  Badge,
  BUTTON_PRO,
  BUTTON_QUIET,
  Card,
} from "@/components/ui/primitives";
import { RealtimeRefresh } from "@/components/ui/RealtimeRefresh";
import { PRO_ROUTES } from "@/lib/routes";
import { requireRole } from "@/lib/supabase/session";
import { listMyActiveJobs } from "@/lib/supabase/tracking";
import { relativeTime } from "@/lib/validation/bids";
import { formatIls } from "@/lib/validation/priceUpdates";
import { JOB_PROGRESS_LABEL_PRO } from "@/lib/validation/tracking";

export const metadata = { title: "העבודות שלי — Handy Pro" };

export const dynamic = "force-dynamic";

/**
 * design/screens/pro-3.2-my-jobs.png — העבודות שלי, the "פעילות" tab.
 *
 * The design puts a "היסטוריה" tab beside it, with completed jobs, receipts
 * and a total-earnings summary. That is Phase 6 (סיום עבודה, תשלום, עמלה
 * וקבלה) and CLAUDE.md's one-phase-at-a-time rule says not to build it early,
 * so the tab is named where the design names it and says when it arrives
 * rather than rendering an empty list that looks like a bug.
 *
 * The summary card is the same story: "סה״כ הכנסות" and "ביטולים" are numbers
 * about finished work. What can honestly be counted today is what is on the
 * table right now, so that is what it counts.
 */
export default async function ProMyJobsPage() {
  const user = await requireRole("pro");

  const jobs = await listMyActiveJobs();

  const openValue = jobs.reduce((sum, job) => sum + job.currentPrice, 0);
  const awaitingDecision = jobs.filter(
    (job) => job.pendingUpdateCount > 0,
  ).length;

  return (
    <div className="space-y-6">
      {/* A customer answering a price update, or a new job being assigned,
          both change this list without the pro touching anything. */}
      <RealtimeRefresh
        table="bids"
        filter={`pro_id=eq.${user.id}`}
        label="המסך מתעדכן מעצמו"
      />

      <header>
        <h1 className="text-3xl font-bold text-ink sm:text-4xl">העבודות שלי</h1>
        <p className="mt-2 text-muted">
          העבודות שנבחרת אליהן ועדיין לא הסתיימו.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[20rem_minmax(0,1fr)] lg:items-start">
        <aside className="space-y-4">
          <Card>
            <h2 className="text-lg font-bold text-ink">סיכום פעילות</h2>
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted">עבודות פעילות</dt>
                <dd className="ltr-nums text-lg font-bold text-ink">
                  {jobs.length}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted">שווי העבודות הפתוחות</dt>
                <dd className="ltr-nums text-lg font-bold text-ink">
                  {formatIls(openValue)} ₪
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted">ממתינות לאישור מחיר</dt>
                <dd className="ltr-nums text-lg font-bold text-alert">
                  {awaitingDecision}
                </dd>
              </div>
            </dl>
          </Card>

          <Card>
            <h2 className="font-bold text-ink">היסטוריה</h2>
            <p className="mt-2 text-sm text-muted">
              עבודות שהושלמו, קבלות וסיכום הכנסות ועמלות — יגיעו יחד עם מסך
              הארנק בשלב הבא.
            </p>
          </Card>
        </aside>

        {jobs.length === 0 ? (
          <Card className="p-10 text-center">
            <p className="text-lg font-bold text-ink">
              אין לך כרגע עבודה פעילה
            </p>
            <p className="mt-2 text-muted">
              עבודה מגיעה לכאן ברגע שלקוח בוחר בהצעה שלך.
            </p>
            <Link
              href={PRO_ROUTES.jobs}
              className={`${BUTTON_PRO} mt-5 inline-flex`}
            >
              לפיד הקריאות
            </Link>
          </Card>
        ) : (
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
                      <Badge
                        tone={job.status === "in_progress" ? "pro" : "open"}
                      >
                        {
                          JOB_PROGRESS_LABEL_PRO[
                            job.status === "in_progress"
                              ? "in_progress"
                              : "assigned"
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
                    <span className="ltr-nums">
                      {formatIls(job.currentPrice)}
                    </span>{" "}
                    ₪
                  </p>
                </div>

                {job.pendingUpdateCount > 0 && (
                  <p className="mt-3 rounded-xl bg-alert-soft p-3 text-sm font-semibold text-alert">
                    בקשת עדכון מחיר ממתינה להחלטת הלקוח. עד שיאשר — העבודה במחיר
                    המקורי,{" "}
                    <span className="ltr-nums">
                      {formatIls(job.agreedPrice)}
                    </span>{" "}
                    ₪.
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
        )}
      </div>
    </div>
  );
}
