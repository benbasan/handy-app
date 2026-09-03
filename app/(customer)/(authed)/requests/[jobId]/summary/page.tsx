import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { RatingForm } from "@/components/customer/RatingForm";
import { SaveProButton } from "@/components/customer/SaveProButton";
import { DisputeOpener } from "@/components/ui/DisputeOpener";
import { BUTTON_CTA, BUTTON_QUIET, Card } from "@/components/ui/primitives";
import { CUSTOMER_ROUTES, receiptPath } from "@/lib/routes";
import { listJobDisputes } from "@/lib/supabase/disputes";
import { getJobReceipt, hasSavedPro } from "@/lib/supabase/completion";
import { getJob } from "@/lib/supabase/jobs";
import { listPriceUpdates } from "@/lib/supabase/priceUpdates";
import { requireRole } from "@/lib/supabase/session";
import {
  PAYMENT_METHODS,
  receiptLines,
  receiptTimestamp,
} from "@/lib/validation/completion";
import { jobReference } from "@/lib/validation/jobs";
import { formatIls } from "@/lib/validation/priceUpdates";
import { PAYMENT_METHOD_LABEL } from "@/lib/validation/pros";

export const metadata = { title: "סיכום, קבלה ודירוג — Handy" };

export const dynamic = "force-dynamic";

/**
 * design/screens/customer-4.1-summary-receipt-rating.png — where a call ends.
 *
 * Everything on this page is a fact about a job that is already closed, which
 * is why there is no "confirm payment" button anywhere on it: Handy is not a
 * party to the payment (business rule 4). The four chips are what the pro
 * recorded when they pressed "סיימתי — עדכן גבייה", shown so the customer can
 * see it agrees with what actually happened — and a receipt that disagreed
 * with the money is a dispute, which is Phase 7's.
 *
 * "סיכום חיוב" is built out of the approved `price_updates` rows themselves.
 * Base plus every approved delta *is* the total, by construction, which is the
 * same reason `jobs` has never had a price column: two ways to know what a job
 * cost is one way too many.
 */
export default async function JobSummaryPage({
  params,
}: PageProps<"/requests/[jobId]/summary">) {
  await requireRole("customer");

  const { jobId } = await params;

  const job = await getJob(jobId);
  // RLS returns nothing for someone else's job, which arrives here as "no such
  // job" — the correct answer either way.
  if (!job) notFound();

  const receipt = await getJobReceipt(jobId);
  // Not closed yet. The tracking screen is where the job actually is, and
  // sending them there beats a page that explains why this one is empty.
  if (!receipt) redirect(CUSTOMER_ROUTES.track(jobId));

  const [updates, saved, disputes] = await Promise.all([
    listPriceUpdates(jobId),
    hasSavedPro(receipt.proId),
    listJobDisputes(jobId),
  ]);

  const approved = updates.filter((update) => update.status === "approved");
  const lines = receiptLines(receipt.basePrice, approved);
  const refused = updates.filter((update) => update.status === "rejected");

  return (
    <div className="space-y-6">
      {/* The content column leads (right, in RTL) and the billing card trails,
          which is the split in the design. */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <div className="space-y-6">
          <header>
            <span
              aria-hidden
              className="flex size-16 items-center justify-center rounded-2xl bg-cta text-3xl font-bold text-white"
            >
              ✓
            </span>
            <h1 className="mt-5 text-4xl font-bold text-ink">העבודה הושלמה</h1>
            <p className="mt-2 text-muted">
              קריאה{" "}
              <span dir="ltr" className="font-mono">
                {jobReference(jobId)}
              </span>{" "}
              · {receipt.categoryName} · {receipt.proName ?? "בעל המקצוע"} ·{" "}
              <span className="ltr-nums">
                {receiptTimestamp(receipt.chargedAt)}
              </span>
            </p>
          </header>

          <RatingForm
            jobId={jobId}
            existingRating={receipt.rating}
            existingComment={receipt.reviewComment}
            proName={receipt.proName}
          />

          <section className="rounded-2xl border border-cta bg-surface p-5 sm:p-6">
            <h2 className="text-lg font-bold text-cta-strong">
              התשלום מתבצע ישירות לבעל המקצוע
            </h2>
            <p className="mt-2 text-sm text-muted">
              Handy אינה מעבדת את התשלום ואינה צד לו.{" "}
              {receipt.proName ?? "בעל המקצוע"} דיווח שהתשלום נגבה ב
              {PAYMENT_METHOD_LABEL[receipt.paymentMethod]}.
            </p>

            <ul className="mt-4 flex flex-wrap gap-2">
              {PAYMENT_METHODS.map((method) => {
                const used = method === receipt.paymentMethod;
                return (
                  <li
                    key={method}
                    className={`rounded-xl border px-4 py-2 text-sm font-semibold ${
                      used
                        ? "border-cta bg-cta/10 text-cta-strong"
                        : "border-line bg-canvas text-muted"
                    }`}
                  >
                    {PAYMENT_METHOD_LABEL[method]}
                    {used && <span className="ms-2">✓</span>}
                  </li>
                );
              })}
            </ul>
          </section>

          {refused.length > 0 && (
            <Card>
              <h2 className="font-bold text-ink">בקשות שלא אושרו</h2>
              <p className="mt-2 text-sm text-muted">
                הבקשות האלה לא נכנסו לחיוב. העבודה נסגרה במחיר שסוכם, כולל רק
                עדכונים שאישרתם.
              </p>
              <ul className="mt-3 space-y-2">
                {refused.map((update) => (
                  <li
                    key={update.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line p-3 text-sm"
                  >
                    <span className="text-muted">
                      התבקש{" "}
                      <span className="ltr-nums">
                        {formatIls(update.newPrice)}
                      </span>{" "}
                      ₪ במקום{" "}
                      <span className="ltr-nums">
                        {formatIls(update.originalPrice)}
                      </span>{" "}
                      ₪
                    </span>
                    <span className="font-semibold text-ink">לא אושר</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        <aside className="space-y-4">
          <Card>
            <h2 className="text-lg font-bold text-ink">סיכום חיוב</h2>

            <dl className="mt-4 space-y-3 text-sm">
              {lines.map((line, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between gap-3"
                >
                  <dt className="text-muted">{line.label}</dt>
                  <dd className="ltr-nums font-semibold text-ink">
                    {line.delta ? "+" : ""}
                    {formatIls(line.amount)} ₪
                  </dd>
                </div>
              ))}
            </dl>

            <div className="mt-4 flex items-baseline justify-between gap-3 border-t border-line pt-4">
              <p className="text-lg font-bold text-ink">סה״כ</p>
              <p className="text-2xl font-bold text-brand">
                <span className="ltr-nums">
                  {formatIls(receipt.totalPrice)}
                </span>{" "}
                ₪
              </p>
            </div>

            <a
              href={receiptPath(jobId)}
              className={`${BUTTON_QUIET} mt-5 w-full`}
            >
              הורד קבלה PDF
            </a>

            <Link
              href={CUSTOMER_ROUTES.account}
              className={`${BUTTON_CTA} mt-3 w-full`}
            >
              סגור קריאה
            </Link>
          </Card>

          <SaveProButton
            jobId={jobId}
            proId={receipt.proId}
            proName={receipt.proName}
            alreadySaved={saved}
          />

          {/*
            The gap between the payment chips above and what the customer
            actually remembers is a dispute, not a button — Phase 6 said so and
            left it to Phase 7. This is that door.
          */}
          <DisputeOpener jobId={jobId} existingStatus={disputes[0]?.status} />

          <Card>
            <h2 className="font-bold text-ink">מה שילמתם, ולמה</h2>
            <p className="mt-2 text-sm text-muted">
              {approved.length === 0
                ? "לא היו עדכוני מחיר בשטח — שילמתם בדיוק את ההצעה שבחרתם."
                : "כל תוספת בחשבון הזה אושרה על ידכם באתר, לצד תמונה שצולמה בשטח. ללא אישור — העבודה נשארת במחיר המקורי."}
            </p>
          </Card>
        </aside>
      </div>
    </div>
  );
}
