import Link from "next/link";
import {
  BUTTON_COMPACT,
  BUTTON_QUIET,
  CARD_BASE,
  EmptyState,
  PAGE_LEAD,
  PAGE_TITLE,
  SECTION_TITLE,
} from "@/components/ui/primitives";
import { ClipboardIcon } from "@/components/ui/icons";
import { CategoryIcon } from "@/lib/categories";
import { CUSTOMER_ROUTES, MARKETING_ROUTES, receiptPath } from "@/lib/routes";
import { groupByPlace, listMyHomeRecord } from "@/lib/supabase/home";
import { requireRole } from "@/lib/supabase/session";
import { formatIls } from "@/lib/validation/priceUpdates";

export const metadata = { title: "תיק הבית — Handy" };

/**
 * תיק הבית (Phase 13.8) — a reason to open Handy when nothing is broken.
 *
 * Every finished job, under the saved address it happened at: what was done,
 * when, by whom and what it cost, with the receipt a tap away. Nothing here is
 * new data. The ledger has held all of it since Phase 6; what was missing was
 * a place where it reads as the history of a home rather than a list of calls.
 *
 * "הזמינו שוב" sends the call to the same pro through their own link, which is
 * Phase 13.8's directed call — the pro who knows the boiler hears about it
 * first.
 */
export default async function HomeRecordPage() {
  await requireRole("customer");
  const entries = await listMyHomeRecord();
  const groups = groupByPlace(entries);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className={PAGE_TITLE}>תיק הבית</h1>
          <p className={PAGE_LEAD}>
            כל מה שתוקן, איפה, מתי ועל ידי מי — עם הקבלה.
          </p>
        </div>
        <Link href={CUSTOMER_ROUTES.account} className={BUTTON_QUIET}>
          לקריאות שלי
        </Link>
      </header>

      {entries.length === 0 ? (
        <EmptyState
          icon={ClipboardIcon}
          title="עוד אין כאן עבודות שהסתיימו"
          body="כל עבודה שתיסגר תופיע כאן, תחת הכתובת שבה היא נעשתה. כתובת שתשמרו באזור האישי — ״בית״, ״הורים״ — תהפוך לתיקייה משלה."
          action={
            <Link href={CUSTOMER_ROUTES.newRequest} className={BUTTON_QUIET}>
              פרסום קריאה
            </Link>
          }
        />
      ) : (
        groups.map((group) => (
          <section key={group.key} className={`${CARD_BASE} p-0`}>
            <h2 className={`border-b border-line p-5 sm:p-6 ${SECTION_TITLE}`}>
              {group.label ?? "כתובות אחרות"}
            </h2>
            <ul className="divide-y divide-line">
              {group.entries.map((entry) => (
                <li
                  key={entry.jobId}
                  className="flex flex-wrap items-start gap-4 p-5 sm:p-6"
                >
                  <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-canvas text-muted">
                    <CategoryIcon
                      slug={entry.categorySlug}
                      className="size-6"
                    />
                  </span>

                  <div className="min-w-48 flex-1">
                    <p className="font-bold text-ink">
                      {entry.description.split("\n")[0]!.slice(0, 80)}
                    </p>
                    {/* One fact per line: the trade and the date, then the
                        pro, then the address — each its own bidi run. */}
                    <p className="mt-1 text-sm text-muted">
                      {entry.categoryName} ·{" "}
                      <span className="ltr-nums">
                        {new Date(entry.completedAt).toLocaleDateString(
                          "he-IL",
                          { timeZone: "Asia/Jerusalem" },
                        )}
                      </span>
                    </p>
                    {entry.proName && (
                      <p className="mt-1 text-sm text-ink">
                        {entry.proSlug ? (
                          <Link
                            href={MARKETING_ROUTES.proProfile(entry.proSlug)}
                            className="font-semibold text-brand underline-offset-2 hover:underline"
                          >
                            {entry.proName}
                          </Link>
                        ) : (
                          entry.proName
                        )}
                      </p>
                    )}
                    {group.label && (
                      <p className="mt-1 text-xs text-muted">
                        {entry.addressText}
                      </p>
                    )}
                  </div>

                  <div className="flex w-full shrink-0 flex-col gap-2 sm:w-44">
                    {entry.totalPrice !== null && (
                      <p className={SECTION_TITLE}>
                        <span className="ltr-nums">
                          {formatIls(entry.totalPrice)}
                        </span>{" "}
                        ₪
                      </p>
                    )}
                    <a
                      href={receiptPath(entry.jobId)}
                      className={`${BUTTON_QUIET} ${BUTTON_COMPACT} w-full`}
                    >
                      קבלה
                    </a>
                    <Link
                      href={
                        entry.proSlug
                          ? CUSTOMER_ROUTES.newRequestTo(entry.proSlug)
                          : CUSTOMER_ROUTES.newRequestFor(entry.categorySlug)
                      }
                      className={`${BUTTON_QUIET} ${BUTTON_COMPACT} w-full`}
                    >
                      {entry.proSlug ? "הזמנה חוזרת" : "קריאה חדשה בתחום"}
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
