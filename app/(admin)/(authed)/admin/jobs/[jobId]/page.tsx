import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
import { DisputeDecisionForm } from "@/components/admin/DisputeDecisionForm";
import { ProEnforcementPanel } from "@/components/admin/ProEnforcementPanel";
import { Badge, Card } from "@/components/ui/primitives";
import { ADMIN_ROUTES, receiptPath } from "@/lib/routes";
import { getProEnforcement } from "@/lib/supabase/admin";
import { listJobDisputes } from "@/lib/supabase/disputes";
import { listBidsForJob } from "@/lib/supabase/bids";
import { getJobReceipt } from "@/lib/supabase/completion";
import { getJob, signJobMedia } from "@/lib/supabase/jobs";
import { listThreadMessages } from "@/lib/supabase/messages";
import {
  listPriceUpdates,
  signPriceUpdatePhotos,
} from "@/lib/supabase/priceUpdates";
import { requireRole } from "@/lib/supabase/session";
import {
  DISPUTE_STATUS_LABEL,
  disputeReference,
} from "@/lib/validation/disputes";
import { formatReceiptDate } from "@/lib/validation/completion";
import { jobReference, PREFERRED_TIME_LABEL } from "@/lib/validation/jobs";
import {
  formatIls,
  PRICE_UPDATE_STATUS_LABEL,
} from "@/lib/validation/priceUpdates";
import { PAYMENT_METHOD_LABEL } from "@/lib/validation/pros";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: PageProps<"/admin/jobs/[jobId]">) {
  const { jobId } = await params;
  return { title: `קריאה ${jobReference(jobId)} — Handy Admin` };
}

/**
 * תיעוד הקריאה המלא — product-spec.md 5.4: "כל מחלוקת נבדקת מול תיעוד הקריאה
 * המלא (הצעה, תמונות, אישורי מחיר, התכתבות) — לא רק גרסת הצד המתלונן".
 *
 * This screen is that sentence. Everything on it is read as plain rows under
 * the admin's own RLS — `jobs`, `bids`, `price_updates`, `messages`,
 * `commission_charges` — through the very modules the customer and the pro use
 * for the same data. There is no admin-only projection of a job anywhere in
 * this codebase, which is what makes "the admin sees what happened" and "the
 * two sides see what happened" the same sentence rather than two.
 *
 * The private media is signed the same way it is for the two sides: Storage
 * only signs what the caller's own policies let them select, so the signature
 * is a convenience and `is_admin()` inside `can_read_job_media()` is the
 * access control.
 */
export default async function AdminJobDossierPage({
  params,
}: PageProps<"/admin/jobs/[jobId]">) {
  await requireRole("admin");

  const { jobId } = await params;
  const job = await getJob(jobId);
  if (!job) notFound();

  const [bids, priceUpdates, disputes, receipt] = await Promise.all([
    listBidsForJob(jobId),
    listPriceUpdates(jobId),
    listJobDisputes(jobId),
    getJobReceipt(jobId),
  ]);

  const selectedBid = bids.find((bid) => bid.status === "selected") ?? null;

  const [media, faultPhotos, threads, assignedPro] = await Promise.all([
    signJobMedia(
      [job.videoPath, job.voiceNotePath, ...job.photoPaths].filter(
        (path): path is string => Boolean(path),
      ),
    ),
    signPriceUpdatePhotos(priceUpdates.map((update) => update.photoPath)),
    // One conversation per pro who bid — a thread is (job, pro), never (job),
    // which is exactly why the dossier has to ask for each of them by name.
    Promise.all(
      bids.map(async (bid) => ({
        proId: bid.proId,
        proName: bid.proName,
        messages: await listThreadMessages(jobId, bid.proId),
      })),
    ),
    selectedBid ? getProEnforcement(selectedBid.proId) : null,
  ]);

  return (
    <AdminShell current={ADMIN_ROUTES.jobs}>
      <div className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <header>
            <h1 className="text-3xl font-bold text-ink sm:text-4xl">
              תיעוד הקריאה
            </h1>
            <p className="mt-2 text-muted">
              <span dir="ltr" className="font-bold text-ink">
                {jobReference(job.id)}
              </span>{" "}
              · {job.categoryName ?? "ללא תחום"} · {job.addressText}
            </p>
          </header>

          <Link
            href={ADMIN_ROUTES.jobs}
            className="text-sm font-semibold text-brand hover:underline"
          >
            חזרה לטבלת הקריאות
          </Link>
        </div>

        {/* ---------------------------------------------------------------- */}
        {/* The call itself                                                  */}
        {/* ---------------------------------------------------------------- */}
        <Card>
          <h2 className="text-lg font-bold text-ink">הקריאה</h2>
          <p className="mt-2 whitespace-pre-line text-ink">{job.description}</p>

          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <Fact label="סטטוס" value={job.status} />
            <Fact
              label="מתי נוח"
              value={
                job.preferredTime
                  ? (PREFERRED_TIME_LABEL[
                      job.preferredTime as keyof typeof PREFERRED_TIME_LABEL
                    ] ?? job.preferredTime)
                  : "לא צוין"
              }
            />
            <Fact label="רדיוס חיפוש" value={`${job.searchRadiusKm} ק״מ`} ltr />
            <Fact label="נפתחה" value={formatReceiptDate(job.createdAt)} ltr />
          </dl>

          {media.size > 0 && (
            <ul className="mt-4 flex flex-wrap gap-3">
              {[...media.entries()].map(([path, url]) => (
                <li key={path}>
                  <a
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center rounded-full border border-line px-3 py-1.5 text-xs font-semibold text-ink hover:border-ink"
                  >
                    מדיה שצורפה לקריאה
                  </a>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* ---------------------------------------------------------------- */}
        {/* Every offer, not only the one that won                            */}
        {/* ---------------------------------------------------------------- */}
        <Card>
          <h2 className="text-lg font-bold text-ink">
            הצעות שהוגשו ({bids.length})
          </h2>

          {bids.length === 0 ? (
            <p className="mt-2 text-muted">
              אף בעל מקצוע לא הגיש הצעה על הקריאה הזו.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-line">
              {bids.map((bid) => (
                <li
                  key={bid.id}
                  className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3"
                >
                  <span className="min-w-40 font-bold text-ink">
                    {bid.proName ?? "בעל מקצוע"}
                  </span>
                  <span className="text-ink">
                    <span className="ltr-nums">{formatIls(bid.price)}</span> ₪
                  </span>
                  <span className="text-muted">
                    הגעה תוך <span className="ltr-nums">{bid.etaMinutes}</span>{" "}
                    דק׳
                  </span>
                  {bid.status === "selected" ? (
                    <Badge tone="done">נבחרה</Badge>
                  ) : (
                    <Badge tone="neutral">
                      {bid.status === "expired" ? "פגה" : "לא נבחרה"}
                    </Badge>
                  )}
                  {bid.note && (
                    <span className="w-full text-sm text-muted">
                      {bid.note}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* ---------------------------------------------------------------- */}
        {/* The transparency rule's own evidence                              */}
        {/* ---------------------------------------------------------------- */}
        <Card>
          <h2 className="text-lg font-bold text-ink">
            עדכוני מחיר בשטח ({priceUpdates.length})
          </h2>
          <p className="mt-1 text-sm text-muted">
            כל עדכון מחיר מחייב תמונה מהשטח ואישור מפורש של הלקוח. בלי אישור,
            המחיר המקורי הוא זה שחל.
          </p>

          {priceUpdates.length === 0 ? (
            <p className="mt-3 text-muted">
              לא התבקש עדכון מחיר על הקריאה הזו.
            </p>
          ) : (
            <ul className="mt-4 space-y-4">
              {priceUpdates.map((update) => {
                const photoUrl = faultPhotos.get(update.photoPath);
                return (
                  <li
                    key={update.id}
                    className="rounded-xl border border-line p-4"
                  >
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="font-bold text-ink">
                        <span className="ltr-nums">
                          {formatIls(update.originalPrice)}
                        </span>{" "}
                        ₪ →{" "}
                        <span className="ltr-nums">
                          {formatIls(update.newPrice)}
                        </span>{" "}
                        ₪
                      </span>
                      <Badge
                        tone={
                          update.status === "approved"
                            ? "done"
                            : update.status === "pending"
                              ? "waiting"
                              : "neutral"
                        }
                      >
                        {PRICE_UPDATE_STATUS_LABEL[update.status]}
                      </Badge>
                      <span className="text-sm text-muted">
                        {formatReceiptDate(update.createdAt)}
                      </span>
                    </div>

                    {update.note && (
                      <p className="mt-2 text-sm text-ink">{update.note}</p>
                    )}

                    <p className="mt-2 text-sm">
                      {photoUrl ? (
                        <a
                          href={photoUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="font-semibold text-brand hover:underline"
                        >
                          תמונת התקלה שצורפה
                        </a>
                      ) : (
                        <span className="text-muted">
                          התמונה רשומה על הבקשה אך הקובץ אינו זמין כרגע.
                        </span>
                      )}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        {/* ---------------------------------------------------------------- */}
        {/* Every conversation on the call                                    */}
        {/* ---------------------------------------------------------------- */}
        <Card>
          <h2 id="chat" className="scroll-mt-24 text-lg font-bold text-ink">
            התכתבות
          </h2>
          <p className="mt-1 text-sm text-muted">
            שיחה נפרדת מול כל בעל מקצוע שהגיש הצעה. אף בעל מקצוע לא רואה את
            השיחה של האחרים.
          </p>

          {threads.every((thread) => thread.messages.length === 0) ? (
            <p className="mt-3 text-muted">לא הוחלפו הודעות על הקריאה הזו.</p>
          ) : (
            <div className="mt-4 space-y-5">
              {threads
                .filter((thread) => thread.messages.length > 0)
                .map((thread) => (
                  <section key={thread.proId}>
                    <h3 className="text-sm font-bold text-ink">
                      {thread.proName ?? "בעל מקצוע"}
                    </h3>
                    <ul className="mt-2 space-y-2">
                      {thread.messages.map((message) => (
                        <li
                          key={message.id}
                          className="rounded-xl bg-canvas px-4 py-2 text-sm"
                        >
                          <p className="font-semibold text-ink">
                            {message.senderName ?? "משתמש"}
                          </p>
                          <p className="mt-1 text-ink">{message.body}</p>
                          <p className="mt-1 text-xs text-muted">
                            {formatReceiptDate(message.createdAt)}
                          </p>
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
            </div>
          )}
        </Card>

        {/* ---------------------------------------------------------------- */}
        {/* What was actually charged                                         */}
        {/* ---------------------------------------------------------------- */}
        {receipt && (
          <Card>
            <h2 className="text-lg font-bold text-ink">סיכום חיוב</h2>
            <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
              <Fact
                label="מחיר בסיס"
                value={`${formatIls(receipt.basePrice)} ₪`}
                ltr
              />
              <Fact
                label="סה״כ"
                value={`${formatIls(receipt.totalPrice)} ₪`}
                ltr
              />
              <Fact
                label="עמלת Handy"
                value={
                  receipt.commissionAmount === null
                    ? "—"
                    : `${formatIls(receipt.commissionAmount)} ₪`
                }
                ltr
              />
              <Fact
                label="אמצעי תשלום שנרשם"
                value={PAYMENT_METHOD_LABEL[receipt.paymentMethod]}
              />
            </dl>

            <a
              href={receiptPath(job.id)}
              className="mt-4 inline-block text-sm font-semibold text-brand hover:underline"
            >
              הורד את הקבלה
            </a>
          </Card>
        )}

        {/* ---------------------------------------------------------------- */}
        {/* The cases opened on this call, and the tools that answer them      */}
        {/* ---------------------------------------------------------------- */}
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            <Card>
              <h2 className="text-lg font-bold text-ink">
                מחלוקות על הקריאה ({disputes.length})
              </h2>

              {disputes.length === 0 ? (
                <p className="mt-2 text-muted">
                  לא נפתחה מחלוקת על הקריאה הזו.
                </p>
              ) : (
                <ul className="mt-4 space-y-4">
                  {disputes.map((dispute) => (
                    <li
                      key={dispute.disputeId}
                      className="rounded-xl border border-line p-4"
                    >
                      <div className="flex flex-wrap items-center gap-3">
                        <span dir="ltr" className="font-bold text-ink">
                          {disputeReference(dispute.disputeId)}
                        </span>
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
                        <span className="text-sm text-muted">
                          {formatReceiptDate(dispute.createdAt)}
                        </span>
                      </div>

                      <p className="mt-2 text-ink">{dispute.reason}</p>

                      <div className="mt-4">
                        <DisputeDecisionForm
                          disputeId={dispute.disputeId}
                          status={dispute.status}
                          creditAmount={dispute.creditAmount}
                          resolutionNote={dispute.resolutionNote}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          {assignedPro && selectedBid && (
            <ProEnforcementPanel
              pro={assignedPro}
              proName={selectedBid.proName}
            />
          )}
        </div>
      </div>
    </AdminShell>
  );
}

function Fact({
  label,
  value,
  ltr = false,
}: {
  label: string;
  value: string;
  ltr?: boolean;
}) {
  return (
    <div>
      <dt className="text-muted">{label}</dt>
      <dd className={`mt-0.5 font-semibold text-ink ${ltr ? "ltr-nums" : ""}`}>
        {value}
      </dd>
    </div>
  );
}
