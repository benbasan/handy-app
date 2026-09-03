import Link from "next/link";
import { BUTTON_QUIET, Card } from "@/components/ui/primitives";
import { PRO_ROUTES, receiptPath } from "@/lib/routes";
import { getMyBidStats } from "@/lib/supabase/bids";
import {
  getMyEarningsStats,
  listMyCompletedJobs,
} from "@/lib/supabase/completion";
import { getMyProProfile } from "@/lib/supabase/pros";
import { requireRole } from "@/lib/supabase/session";
import {
  EARNINGS_RANGES,
  EARNINGS_RANGE_HEADING,
  EARNINGS_RANGE_LABEL,
  earningsByDay,
  isEarningsRange,
  rangeStart,
  type EarningsRange,
} from "@/lib/validation/completion";
import { formatIls } from "@/lib/validation/priceUpdates";
import { PAYMENT_METHOD_LABEL } from "@/lib/validation/pros";

export const metadata = { title: "ארנק והכנסות — Handy Pro" };

export const dynamic = "force-dynamic";

/**
 * design/screens/pro-4.1-earnings-wallet.png — הכנסות והיסטוריה, at /pro/wallet.
 *
 * Every number here comes out of `commission_charges` and `reviews`, which is
 * the roadmap's third definition-of-done line for this phase: the screen shows
 * what the database holds, not a shape filled with plausible figures. Where
 * there is nothing to show it says so rather than drawing an empty chart —
 * a pro's first week is a real state.
 *
 * The three cards are three different spans on purpose, and each says which:
 * earnings follow the היום/השבוע/החודש toggle, while the rating and the
 * acceptance rate are the pro's whole history — a "72% acceptance this week"
 * computed over two offers would be noise presented as a score.
 */
export default async function ProWalletPage({
  searchParams,
}: PageProps<"/pro/wallet">) {
  await requireRole("pro");

  const { range: rangeParam } = await searchParams;
  const range: EarningsRange = isEarningsRange(
    typeof rangeParam === "string" ? rangeParam : undefined,
  )
    ? (rangeParam as EarningsRange)
    : "week";

  const since = rangeStart(range);

  const [profile, stats, jobs, bidStats] = await Promise.all([
    getMyProProfile(),
    getMyEarningsStats(since),
    listMyCompletedJobs(since),
    getMyBidStats(),
  ]);

  const bars = earningsByDay(jobs, range);
  const peak = Math.max(...bars.map((bar) => bar.total), 1);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <header>
          <h1 className="text-3xl font-bold text-ink sm:text-4xl">
            הכנסות והיסטוריה
          </h1>
          <p className="mt-2 text-muted">
            {profile?.verificationStatus === "verified"
              ? "פעיל ומאומת ב-Handy"
              : "הפרופיל עדיין לא אומת"}{" "}
            · עמלה של 12% נגבית רק על עבודה שנסגרה.
          </p>
        </header>

        <nav className="flex flex-wrap gap-2" aria-label="טווח זמן">
          {EARNINGS_RANGES.map((candidate) => (
            <Link
              key={candidate}
              href={`${PRO_ROUTES.wallet}?range=${candidate}`}
              aria-current={candidate === range ? "page" : undefined}
              className={`rounded-xl px-5 py-2.5 text-sm font-bold transition-colors ${
                candidate === range
                  ? "bg-pro text-white"
                  : "border border-line bg-surface text-ink hover:bg-canvas"
              }`}
            >
              {EARNINGS_RANGE_LABEL[candidate]}
            </Link>
          ))}
        </nav>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* The dark card of the design, and the one number the pro came for. */}
        <section className="rounded-2xl bg-ink p-5 text-white sm:p-6">
          <p className="text-sm text-white/70">
            {EARNINGS_RANGE_HEADING[range]}
          </p>
          <p className="mt-2 text-4xl font-bold text-cta">
            <span className="ltr-nums">{formatIls(stats.net)}</span> ₪
          </p>
          <p className="mt-1 text-sm text-white/70">
            נטו, אחרי עמלה של{" "}
            <span className="ltr-nums">{formatIls(stats.commission)}</span> ₪ על{" "}
            <span className="ltr-nums">{stats.jobsCount}</span>{" "}
            {stats.jobsCount === 1 ? "עבודה" : "עבודות"}
          </p>

          <div
            className="mt-5 flex h-24 items-end gap-2"
            role="img"
            aria-label={`הכנסות לפי יום, ${EARNINGS_RANGE_LABEL[range]}`}
          >
            {bars.map((bar) => (
              <div key={bar.day} className="flex flex-1 flex-col items-center gap-1">
                <span
                  className={`w-full rounded-md ${
                    bar.total > 0 ? "bg-cta" : "bg-white/15"
                  }`}
                  style={{
                    height: `${Math.max(8, Math.round((bar.total / peak) * 72))}px`,
                  }}
                />
                <span className="text-[0.65rem] text-white/60">{bar.label}</span>
              </div>
            ))}
          </div>
        </section>

        <Card>
          <p className="text-sm text-muted">דירוג מאומת</p>
          {stats.ratingAvg === null ? (
            <>
              <p className="mt-2 text-2xl font-bold text-ink">אין עדיין דירוג</p>
              <p className="mt-1 text-sm text-muted">
                הדירוג הראשון מגיע אחרי שלקוח מדרג עבודה שסגרתם.
              </p>
            </>
          ) : (
            <>
              <p className="mt-2 text-4xl font-bold text-ink">
                ★ <span className="ltr-nums">{stats.ratingAvg.toFixed(2)}</span>
              </p>
              <p className="mt-1 text-sm text-muted">
                מתוך <span className="ltr-nums">{stats.ratingCount}</span>{" "}
                {stats.ratingCount === 1 ? "דירוג" : "דירוגים"} על{" "}
                <span className="ltr-nums">{stats.lifetimeJobsCount}</span>{" "}
                עבודות שהושלמו
              </p>
            </>
          )}
        </Card>

        <Card>
          <p className="text-sm text-muted">שיעור קבלת הצעות</p>
          {bidStats.acceptancePct === null ? (
            <>
              <p className="mt-2 text-2xl font-bold text-ink">עוד אין נתונים</p>
              <p className="mt-1 text-sm text-muted">
                השיעור נמדד רק על הצעות שהלקוח הכריע בהן.
              </p>
            </>
          ) : (
            <>
              <p className="mt-2 text-4xl font-bold text-ink">
                <span className="ltr-nums">{bidStats.acceptancePct}%</span>
              </p>
              <p className="mt-1 text-sm text-muted">
                מ-<span className="ltr-nums">{bidStats.total}</span> ההצעות
                שהוגשו
              </p>
            </>
          )}
        </Card>
      </div>

      <Card className="p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-5 sm:p-6">
          <h2 className="text-lg font-bold text-ink">
            עבודות שנסגרו · {EARNINGS_RANGE_LABEL[range]}
          </h2>
          <Link
            href={`${PRO_ROUTES.myJobs}?tab=history`}
            className={`${BUTTON_QUIET} px-4 py-2 text-sm`}
          >
            כל ההיסטוריה
          </Link>
        </div>

        {jobs.length === 0 ? (
          <p className="p-8 text-center text-muted">
            לא נסגרו עבודות בטווח הזה.
          </p>
        ) : (
          /* A table on a phone is a horizontal scroll or a lie about how much
             fits; this scrolls inside its own box rather than pushing the
             page sideways. */
          <div className="overflow-x-auto">
            <table className="w-full min-w-[44rem] text-sm">
              <thead>
                <tr className="border-b border-line text-muted">
                  <Th>לקוח</Th>
                  <Th>תאריך</Th>
                  <Th>כתובת</Th>
                  <Th>תחום</Th>
                  <Th>דירוג</Th>
                  <Th>סכום</Th>
                  <Th>עמלה</Th>
                  <Th>נטו</Th>
                  <Th>קבלה</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {jobs.map((job) => (
                  <tr key={job.jobId}>
                    <Td>
                      <span className="font-bold text-ink">
                        {job.customerName ?? "לקוח"}
                      </span>
                      <span className="block text-xs text-muted">
                        {PAYMENT_METHOD_LABEL[job.paymentMethod]}
                      </span>
                    </Td>
                    <Td>
                      <span className="ltr-nums">
                        {shortDate(job.chargedAt)}
                      </span>
                    </Td>
                    <Td>{job.addressText}</Td>
                    <Td>
                      <span className="font-semibold text-pro">
                        {job.categoryName}
                      </span>
                    </Td>
                    <Td>
                      {job.rating === null ? (
                        <span className="text-muted">—</span>
                      ) : (
                        <>
                          ★ <span className="ltr-nums">{job.rating}</span>
                        </>
                      )}
                    </Td>
                    <Td>
                      <span className="ltr-nums">
                        {formatIls(job.totalPrice)} ₪
                      </span>
                    </Td>
                    <Td>
                      <span className="ltr-nums text-muted">
                        {formatIls(job.commissionAmount)} ₪
                      </span>
                    </Td>
                    <Td>
                      <span className="ltr-nums font-bold text-cta-strong">
                        {formatIls(job.netAmount)} ₪
                      </span>
                    </Td>
                    <Td>
                      <a
                        href={receiptPath(job.jobId)}
                        className="font-semibold text-pro underline"
                      >
                        הורדה
                      </a>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card>
        <h2 className="font-bold text-ink">איך נגבית העמלה</h2>
        <p className="mt-2 text-sm text-muted">
          12% מכל עבודה שנסגרה, מחושבים על המחיר הסופי שסוכם — כולל עדכוני מחיר
          שהלקוח אישר, ולא כולל בקשות שלא אושרו. אין דמי הרשמה ואין תשלום על
          הצעות שלא נבחרו.
          {profile?.payoutAccountLast4 ? (
            <>
              {" "}
              הגבייה מתבצעת לחשבון שמסתיים ב-
              <span className="ltr-nums">{profile.payoutAccountLast4}</span>
              {profile.payoutBankName ? ` (${profile.payoutBankName})` : ""}.
            </>
          ) : (
            <>
              {" "}
              עוד לא הוגדר חשבון לגביית העמלה —{" "}
              <Link href={PRO_ROUTES.settings} className="underline">
                אפשר להשלים אותו בהגדרות
              </Link>
              .
            </>
          )}
        </p>
      </Card>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th scope="col" className="px-4 py-3 text-start font-semibold">
      {children}
    </th>
  );
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-4 py-3 text-start align-top">{children}</td>;
}

/** "22.8" — the date column of the design's table. */
function shortDate(iso: string): string {
  const date = new Date(iso);
  return `${date.getDate()}.${date.getMonth() + 1}`;
}
