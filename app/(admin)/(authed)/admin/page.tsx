import Link from "next/link";
import { AdminShell } from "@/components/admin/AdminShell";
import { JobsPerDayChart } from "@/components/admin/JobsPerDayChart";
import { StatCard } from "@/components/admin/StatCard";
import { BUTTON_BASE } from "@/components/ui/primitives";
import { ADMIN_ROUTES } from "@/lib/routes";
import {
  getAdminOverview,
  listCategoryMix,
  listJobsPerDay,
} from "@/lib/supabase/admin";
import { requireRole } from "@/lib/supabase/session";
import { percentChange } from "@/lib/validation/admin";
import { formatIls } from "@/lib/validation/priceUpdates";

export const metadata = { title: "סקירה כללית — Handy Admin" };

// An operations console reading a queue other people are pushing into. A
// cached copy of "2 מחלוקות פתוחות" is worse than no number at all.
export const dynamic = "force-dynamic";

/**
 * design/screens/admin-7.1-overview.png — product-spec.md 5.1.
 *
 * Every figure comes out of `admin_overview()`, in one row and one instant:
 * the header pills, the four cards, the revenue card and the red alert list
 * are one glance at one moment, and eight separate queries could show a state
 * that never existed.
 *
 * Where a comparison has nothing to compare against — a first month, a week
 * with no offers yet — the footnote says so rather than printing "+100%". The
 * design's own "ללא שינוי" is that same idea.
 */
export default async function AdminOverviewPage() {
  await requireRole("admin");

  const [overview, days, mix] = await Promise.all([
    getAdminOverview(),
    listJobsPerDay(7),
    listCategoryMix(7),
  ]);

  const jobsChange = percentChange(overview.jobs24h, overview.jobsPrev24h);
  const commissionChange = percentChange(
    overview.commissionMonth,
    overview.commissionPrevMonth,
  );

  const alerts = [
    overview.jobsWithoutBids > 0
      ? `${overview.jobsWithoutBids} קריאות ללא הצעות מעל שעה`
      : null,
    overview.prosWithManyPriceUpdates > 0
      ? `${overview.prosWithManyPriceUpdates} בעלי מקצוע עם 3 עדכוני מחיר ביום`
      : null,
    overview.unreviewedDocs > 0
      ? `${overview.unreviewedDocs} מסמכי אימות שלא נבדקו`
      : null,
  ].filter((line): line is string => line !== null);

  const today = new Date();

  return (
    <AdminShell current={ADMIN_ROUTES.home}>
      <div className="space-y-6">
        <div className="flex flex-wrap-reverse items-end justify-between gap-4">
          <div className="flex flex-wrap gap-3">
            <Link
              href={ADMIN_ROUTES.pros}
              className={`${BUTTON_BASE} bg-admin px-5 py-2.5 text-sm text-white hover:bg-admin-strong`}
            >
              {overview.pendingPros} ממתינים לאישור
            </Link>
            <Link
              href={ADMIN_ROUTES.disputes}
              className={`${BUTTON_BASE} border border-line bg-surface px-5 py-2.5 text-sm text-ink hover:bg-canvas`}
            >
              {overview.openDisputes} מחלוקות פתוחות
            </Link>
          </div>

          <header className="text-start">
            <h1 className="text-3xl font-bold text-ink sm:text-4xl">
              סקירה כללית
            </h1>
            {/*
              An all-digit date on one line and the window on another: a
              sentence that mixes a Hebrew month name with numbers on both
              sides is three bidi runs, and the reordering it produces is
              correct by the Unicode algorithm and unreadable to a person.
            */}
            <p className="mt-2 text-muted">
              <span className="ltr-nums">
                {today.getDate()}.{today.getMonth() + 1}.{today.getFullYear()}
              </span>{" "}
              · נתוני 24 השעות האחרונות
            </p>
          </header>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="קריאות חדשות"
            value={overview.jobs24h}
            foot={
              jobsChange === null
                ? "אין יום קודם להשוות אליו"
                : `${jobsChange >= 0 ? "+" : ""}${jobsChange}% מאתמול`
            }
            tone={
              jobsChange === null ? "neutral" : jobsChange >= 0 ? "good" : "bad"
            }
          />
          <StatCard
            label="אחוז קריאות שנסגרו"
            value={
              overview.closedRatePct === null ? "—" : overview.closedRatePct
            }
            suffix={overview.closedRatePct === null ? undefined : "%"}
            foot="יעד: 80%"
            tone={
              overview.closedRatePct !== null && overview.closedRatePct >= 80
                ? "good"
                : "neutral"
            }
          />
          <StatCard
            label="זמן להצעה ראשונה"
            value={
              overview.minutesToFirstBid === null
                ? "—"
                : overview.minutesToFirstBid
            }
            suffix={overview.minutesToFirstBid === null ? undefined : "דק׳"}
            foot={
              overview.minutesToFirstBid === null
                ? "טרם התקבלה הצעה בשבוע האחרון"
                : "ממוצע בשבוע האחרון"
            }
          />
          <StatCard
            label="קריאות ללא הצעות"
            value={overview.jobsWithoutBids}
            foot={overview.jobsWithoutBids > 0 ? "דורש טיפול" : "אין"}
            tone={overview.jobsWithoutBids > 0 ? "bad" : "good"}
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <JobsPerDayChart
              days={days}
              mix={mix}
              rangeLabel="7 ימים אחרונים"
            />
          </div>

          <div className="space-y-4">
            <section className="rounded-2xl bg-ink p-5 text-white sm:p-6">
              <p className="text-sm text-white/70">הכנסות עמלה החודש</p>
              <p className="mt-2 text-4xl font-bold text-cta">
                <span className="ltr-nums">
                  {formatIls(overview.commissionMonth)}
                </span>{" "}
                ₪
              </p>
              <p className="mt-2 text-sm text-white/70">
                מ-
                <span className="ltr-nums">
                  {overview.commissionMonthJobs}
                </span>{" "}
                עבודות שנסגרו
              </p>
              <p className="mt-1 text-sm text-white/70">
                {commissionChange === null
                  ? "אין חודש קודם להשוות אליו"
                  : `${commissionChange >= 0 ? "+" : ""}${commissionChange}% מהחודש הקודם`}
              </p>
            </section>

            <section
              className={`rounded-2xl border bg-surface p-5 sm:p-6 ${
                alerts.length > 0 ? "border-danger" : "border-line"
              }`}
            >
              <h2 className="text-lg font-bold text-ink">התראות בקרה</h2>

              {alerts.length === 0 ? (
                <p className="mt-2 text-sm text-muted">
                  אין התראות פתוחות. התור נקי.
                </p>
              ) : (
                <>
                  <ul className="mt-3 space-y-1.5 text-sm text-muted">
                    {alerts.map((alert) => (
                      <li key={alert}>· {alert}</li>
                    ))}
                  </ul>
                  <Link
                    href={ADMIN_ROUTES.jobs}
                    className={`${BUTTON_BASE} mt-4 w-full bg-danger px-5 py-2.5 text-sm text-white hover:bg-danger-strong`}
                  >
                    בדוק עכשיו
                  </Link>
                </>
              )}
            </section>
          </div>
        </div>
      </div>
    </AdminShell>
  );
}
