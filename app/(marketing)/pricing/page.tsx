import Link from "next/link";
import { AppShell } from "@/components/ui/AppShell";
import { BUTTON_CTA, BUTTON_QUIET } from "@/components/ui/primitives";
import { categoryCopy } from "@/lib/content/categories";
import { MARKETING_ROUTES } from "@/lib/routes";
import { JsonLd, breadcrumbJsonLd, pageMetadata } from "@/lib/seo";
import { getPricingGuide } from "@/lib/supabase/publicProfiles";
import { getCurrentUser } from "@/lib/supabase/session";

export const dynamic = "force-dynamic";

export const metadata = pageMetadata({
  title: "מדריך עלויות",
  description:
    "כמה באמת עולה אינסטלטור, חשמלאי או טכנאי מזגנים? טווחי מחירים אמיתיים, מחושבים מתוך עבודות שנסגרו ב-Handy. אין דמי הגעה נפרדים.",
  path: MARKETING_ROUTES.pricing,
});

const shekel = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});

/**
 * design/screens/content-6.2-pricing-guide.png.
 *
 * One departure from the mock, and it is the honest one. The design's table
 * lists individual tasks ("החלפת ברז מטבח") with a typical price, a range and
 * a duration; this product records neither a task nor a duration — a job is
 * free text in a category, and nothing times the work. So the table is per
 * category, the duration column is gone rather than invented, and every number
 * in it comes out of `commission_charges`: jobs that actually closed.
 *
 * A category with nothing closed yet says so. product-spec.md 3.8 asks for a
 * guide "מבוסס נתונים אמיתיים", and a plausible-looking placeholder would be
 * the one thing on this site that could mislead somebody into a bad quote.
 */
export default async function PricingPage() {
  const [user, rows] = await Promise.all([getCurrentUser(), getPricingGuide()]);

  const withData = rows.filter((row) => row.jobsClosed > 0);
  const withoutData = rows.filter((row) => row.jobsClosed === 0);
  const sampleSize = rows.reduce((total, row) => total + row.jobsClosed, 0);

  return (
    <AppShell user={user}>
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "Handy", path: MARKETING_ROUTES.home },
          { name: "מדריך עלויות", path: MARKETING_ROUTES.pricing },
        ])}
      />

      <section className="mx-auto max-w-3xl text-center">
        <h1 className="text-3xl font-bold text-ink sm:text-5xl">
          מדריך עלויות
        </h1>
        <p className="mt-4 text-lg text-muted">
          {sampleSize > 0 ? (
            <>
              טווחי מחירים אמיתיים, מחושבים מתוך{" "}
              <span className="ltr-nums font-semibold text-ink">
                {sampleSize.toLocaleString("he-IL")}
              </span>{" "}
              עבודות שנסגרו ב-Handy. המחיר הסופי נקבע בהצעה של בעל המקצוע.
            </>
          ) : (
            <>
              המדריך הזה מחושב מתוך עבודות שנסגרו ב-Handy. עדיין לא נסגרו מספיק
              עבודות כדי להציג טווחים — הוא יתמלא מעצמו.
            </>
          )}
        </p>
      </section>

      {withData.length > 0 && (
        <section className="mt-10 overflow-x-auto rounded-2xl border border-line bg-surface">
          <table className="w-full min-w-xl border-collapse text-start">
            <caption className="sr-only">
              טווחי מחירים לפי תחום, מתוך עבודות שנסגרו ב-Handy
            </caption>
            <thead>
              <tr className="border-b border-line text-sm text-muted">
                <th scope="col" className="px-5 py-4 text-start font-medium">
                  תחום
                </th>
                <th scope="col" className="px-5 py-4 text-start font-medium">
                  מחיר נפוץ
                </th>
                <th scope="col" className="px-5 py-4 text-start font-medium">
                  טווח
                </th>
                <th scope="col" className="px-5 py-4 text-start font-medium">
                  עבודות שנסגרו
                </th>
              </tr>
            </thead>
            <tbody>
              {withData.map((row) => (
                <tr key={row.categorySlug} className="border-b border-line/70">
                  <th scope="row" className="px-5 py-4 text-start">
                    <Link
                      href={MARKETING_ROUTES.category(row.categorySlug)}
                      className="font-bold text-ink hover:text-brand"
                    >
                      {row.categoryName}
                    </Link>
                    <span className="mt-0.5 block text-xs font-normal text-muted">
                      {categoryCopy(row.categorySlug).professionalPlural}
                    </span>
                  </th>
                  <td className="px-5 py-4 font-bold text-brand">
                    <span className="ltr-nums">
                      {row.priceTypical === null
                        ? "—"
                        : shekel.format(row.priceTypical)}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-muted">
                    <span className="ltr-nums">
                      {row.priceLow === null || row.priceHigh === null
                        ? "—"
                        : `${shekel.format(row.priceLow)}–${shekel.format(row.priceHigh)}`}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-muted">
                    <span className="ltr-nums">{row.jobsClosed}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {withoutData.length > 0 && (
        <section className="mt-4 rounded-2xl border border-line bg-surface p-5 sm:p-6">
          <h2 className="text-base font-bold text-ink">
            תחומים שעדיין אין בהם מספיק נתונים
          </h2>
          <p className="mt-1 text-sm text-muted">
            לא נסגרו בהם מספיק עבודות ב-Handy כדי להציג טווח מחירים. אפשר לפרסם
            קריאה ולקבל הצעות אמיתיות תוך דקות.
          </p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {withoutData.map((row) => (
              <li key={row.categorySlug}>
                <Link
                  href={MARKETING_ROUTES.category(row.categorySlug)}
                  className="inline-flex rounded-full border border-line px-3 py-1.5 text-sm font-medium text-ink hover:border-brand hover:text-brand"
                >
                  {row.categoryName}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl bg-ink p-5 text-white sm:p-6">
          <h2 className="text-lg font-bold">עמלת Handy</h2>
          <p className="mt-2 text-sm text-white/75">
            12% נגבים מבעל המקצוע על עבודה שנסגרה. הלקוח לא משלם ל-Handy כלום.
          </p>
        </div>
        <div className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
          <h2 className="text-lg font-bold text-ink">אין דמי הגעה נפרדים</h2>
          <p className="mt-2 text-sm text-muted">
            כל הצעה ב-Handy כוללת את הביקור. לא תתבקשו לשלם על אבחון בלבד.
          </p>
        </div>
        <div className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
          <h2 className="text-lg font-bold text-ink">מה משפיע על המחיר</h2>
          <p className="mt-2 text-sm text-muted">
            שעת הקריאה, מורכבות הגישה, חלקים מקוריים וקומה ללא מעלית.
          </p>
        </div>
      </section>

      <section className="mt-10 text-center">
        <Link href="/new-request" className={BUTTON_CTA}>
          פרסם קריאה וקבל מחיר אמיתי
        </Link>
        <Link href={MARKETING_ROUTES.guides} className={`${BUTTON_QUIET} ms-3`}>
          מדריכי תחזוקה
        </Link>
      </section>
    </AppShell>
  );
}
