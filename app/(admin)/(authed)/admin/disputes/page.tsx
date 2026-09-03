import Link from "next/link";
import { AdminShell } from "@/components/admin/AdminShell";
import { DisputeDecisionForm } from "@/components/admin/DisputeDecisionForm";
import { Badge, Card } from "@/components/ui/primitives";
import { ADMIN_ROUTES } from "@/lib/routes";
import { getTrustMetrics, listAdminDisputes } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/supabase/session";
import { formatReceiptDate } from "@/lib/validation/completion";
import {
  DISPUTE_STATUS_LABEL,
  disputeReference,
  isDisputeOpen,
} from "@/lib/validation/disputes";
import { jobReference } from "@/lib/validation/jobs";
import { USER_ROLE_LABEL } from "@/lib/routes";
import { isUserRole } from "@/lib/validation/auth";

export const metadata = { title: "מחלוקות ובקרה — Handy Admin" };

export const dynamic = "force-dynamic";

/**
 * design/screens/admin-7.4-disputes-control.png — product-spec.md 5.4 and 5.5.
 *
 * The three buttons on every card in the design are תיעוד הקריאה · התכתבות ·
 * הכרעה וזיכוי, and the first two are the reason this phase built a dossier at
 * all: product-spec.md 5.4 says a dispute is judged against the *whole* record
 * of the call — the offer, the photos, the price approvals, the conversation —
 * "לא רק גרסת הצד המתלונן". Both links land on that record; the third opens
 * the decision, which is `resolve_dispute()` in the database.
 *
 * מדדי אמון (5.5) sits beside the queue rather than on its own screen, because
 * the middle metric — the share of field price updates a customer agreed to —
 * is the number a reviewer wants in their eye while reading a complaint about
 * a price.
 */
export default async function AdminDisputesPage() {
  await requireRole("admin");

  const [disputes, trust] = await Promise.all([
    listAdminDisputes(),
    getTrustMetrics(90),
  ]);

  const open = disputes.filter((dispute) => isDisputeOpen(dispute.status));

  return (
    <AdminShell current={ADMIN_ROUTES.disputes}>
      <div className="space-y-6">
        <header>
          <h1 className="text-3xl font-bold text-ink sm:text-4xl">
            מחלוקות ובקרה
          </h1>
          <p className="mt-2 text-muted">
            {open.length === 0
              ? "אין מחלוקות פתוחות"
              : `${open.length} מחלוקות פתוחות`}{" "}
            · כל מחלוקת נבדקת מול תיעוד הקריאה: הצעה, תמונות ואישורי מחיר
          </p>
        </header>

        <div className="grid gap-4 lg:grid-cols-3">
          <div className="space-y-4 lg:order-2">
            <Card>
              <h2 className="text-lg font-bold text-ink">מדדי אמון</h2>
              <dl className="mt-3 space-y-3 text-sm">
                <Metric
                  label={`מחלוקות ל-1,000 קריאות`}
                  value={String(trust.disputesPer1000)}
                />
                <Metric
                  label="עדכוני מחיר שאושרו"
                  value={
                    trust.priceUpdatesApprovedPct === null
                      ? "—"
                      : `${trust.priceUpdatesApprovedPct}%`
                  }
                />
                <Metric
                  label="זמן הכרעה ממוצע"
                  value={
                    trust.avgResolutionHours === null
                      ? "—"
                      : `${trust.avgResolutionHours} שעות`
                  }
                />
              </dl>
              <p className="mt-4 text-xs text-muted">
                נמדד על 90 הימים האחרונים, מתוך{" "}
                <span className="ltr-nums">{trust.jobsCount}</span> קריאות ו-
                <span className="ltr-nums">
                  {trust.priceUpdatesDecided}
                </span>{" "}
                עדכוני מחיר שהוכרעו.
              </p>
            </Card>

            <section className="rounded-2xl bg-ink p-5 text-white sm:p-6">
              <h2 className="text-lg font-bold">כלי אכיפה</h2>
              <p className="mt-2 text-sm text-white/70">
                השעיית פרופיל · חסימת עדכוני מחיר · דרישת מסמכים מחודשת · זיכוי
                לקוח.
              </p>
              <p className="mt-3 text-sm text-white/70">
                שלושת הראשונים פועלים על בעל המקצוע ונמצאים בתוך תיעוד הקריאה,
                לצד הראיות שעליהן מחליטים. הזיכוי נרשם בהכרעה עצמה.
              </p>
            </section>
          </div>

          <div className="space-y-4 lg:order-1 lg:col-span-2">
            {disputes.length === 0 ? (
              <Card className="p-10 text-center">
                <p className="text-lg font-bold text-ink">אין מחלוקות</p>
                <p className="mt-2 text-muted">
                  לא נפתחה אף פנייה. פנייה חדשה תופיע כאן ברגע שלקוח או בעל
                  מקצוע יפתחו אותה על קריאה שהם צד בה.
                </p>
              </Card>
            ) : (
              disputes.map((dispute) => (
                <Card key={dispute.disputeId}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="flex flex-wrap items-center gap-2">
                        <span dir="ltr" className="text-lg font-bold text-ink">
                          {disputeReference(dispute.disputeId)}
                        </span>
                        <span className="text-sm text-muted">
                          קריאה{" "}
                          <span dir="ltr" className="font-semibold">
                            {jobReference(dispute.jobId)}
                          </span>
                        </span>
                      </p>
                      <p className="mt-1 text-sm text-muted">
                        {isUserRole(dispute.openedByRole)
                          ? USER_ROLE_LABEL[dispute.openedByRole]
                          : "משתמש"}{" "}
                        · {dispute.openedByName ?? "ללא שם"} ·{" "}
                        {dispute.categoryName}
                      </p>
                    </div>

                    <div className="flex flex-col items-end gap-1">
                      <Badge
                        tone={
                          dispute.status === "resolved"
                            ? "done"
                            : dispute.status === "rejected"
                              ? "neutral"
                              : "waiting"
                        }
                      >
                        {DISPUTE_STATUS_LABEL[dispute.status]}
                      </Badge>
                      <span className="text-xs text-muted">
                        {formatReceiptDate(dispute.createdAt)}
                      </span>
                    </div>
                  </div>

                  <p className="mt-3 text-ink">{dispute.reason}</p>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <Link
                      href={ADMIN_ROUTES.job(dispute.jobId)}
                      className="rounded-xl border border-line px-4 py-2 text-sm font-semibold text-ink hover:bg-canvas"
                    >
                      תיעוד הקריאה
                    </Link>
                    <Link
                      href={`${ADMIN_ROUTES.job(dispute.jobId)}#chat`}
                      className="rounded-xl border border-line px-4 py-2 text-sm font-semibold text-ink hover:bg-canvas"
                    >
                      התכתבות
                    </Link>
                  </div>

                  <div className="mt-4 border-t border-line pt-4">
                    <DisputeDecisionForm
                      disputeId={dispute.disputeId}
                      status={dispute.status}
                      creditAmount={dispute.creditAmount}
                      resolutionNote={dispute.resolutionNote}
                    />
                  </div>
                </Card>
              ))
            )}
          </div>
        </div>
      </div>
    </AdminShell>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-line pb-2 last:border-0 last:pb-0">
      <dt className="text-muted">{label}</dt>
      <dd className="ltr-nums font-bold text-ink">{value}</dd>
    </div>
  );
}
