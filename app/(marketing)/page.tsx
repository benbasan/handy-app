import Link from "next/link";
import { AppShell } from "@/components/ui/AppShell";
import { BUTTON_CTA, BUTTON_QUIET } from "@/components/ui/primitives";
import { categoryIcon } from "@/lib/categories";
import { PRO_ROUTES } from "@/lib/routes";
import { listCategories } from "@/lib/supabase/jobs";
import { getCurrentUser } from "@/lib/supabase/session";

// Identity and the category list are per-request facts, not build-time ones.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Handy — בעל מקצוע אמין ליד הבית, היום",
  description:
    "פרסמו קריאה בחינם וקבלו הצעות מחיר מבעלי מקצוע מאומתים באזור שלכם, תוך דקות. כל שינוי מחיר בשטח מחייב תמונה ואישור שלכם.",
};

/**
 * design/screens/customer-1.1-landing.png — the customer landing page.
 *
 * Two departures from the mock, both deliberate:
 *
 *  * The design's hero statistics (+4,200 jobs closed, 12 min to first bid,
 *    4.9 rating) are prototype filler. Presenting invented metrics as fact on
 *    a public page is not a design detail to copy, so the same three-up strip
 *    carries the product's actual, checkable promises instead.
 *  * The hero photo is a placeholder in the mock too; until there is artwork
 *    it is a panel stating the transparency rule rather than an empty frame.
 *
 * The category strip is real data from `categories`, which is the one table
 * anonymous visitors can read.
 */
export default async function LandingPage() {
  const [user, categories] = await Promise.all([
    getCurrentUser(),
    listCategories(),
  ]);

  return (
    <AppShell user={user}>
      <section className="grid items-center gap-10 lg:grid-cols-2">
        <div>
          <p className="inline-flex items-center gap-2 rounded-full bg-cta/15 px-4 py-2 text-sm font-semibold text-cta-strong">
            ✓ כל בעל מקצוע עובר אימות זהות וביטוח
          </p>

          <h1 className="mt-5 text-4xl leading-tight font-bold text-ink sm:text-5xl">
            בעל מקצוע אמין
            <br />
            <span className="text-brand">ליד הבית, היום</span>
          </h1>

          <p className="mt-4 max-w-lg text-lg text-muted">
            מפרסמים קריאה אחת, מקבלים הצעות מחיר אמיתיות מבעלי מקצוע מאומתים
            בסביבה, ובוחרים לפי מחיר, דירוג וזמן הגעה.
          </p>

          <div className="mt-7 flex flex-wrap gap-3">
            <Link href="/new-request" className={BUTTON_CTA}>
              פרסם קריאה — חינם
            </Link>
            <Link href={PRO_ROUTES.landing} className={BUTTON_QUIET}>
              אני בעל מקצוע
            </Link>
          </div>

          <dl className="mt-8 grid max-w-lg grid-cols-3 gap-4 text-center">
            <Stat value="0 ₪" label="עלות פרסום קריאה" />
            <Stat value="12%" label="עמלה — מבעל המקצוע בלבד" />
            <Stat value="100%" label="בעלי מקצוע מאומתים" />
          </dl>
        </div>

        <div className="rounded-3xl bg-ink p-8 text-white sm:p-10">
          <p className="text-sm font-semibold text-cta-bright">
            כלל השקיפות של Handy
          </p>
          <p className="mt-3 text-2xl leading-snug font-bold">
            שינוי מחיר בשטח מחייב תמונה של התקלה ואישור מפורש שלכם.
          </p>
          <p className="mt-4 text-white/75">
            בלי אישור — העבודה ממשיכה במחיר שסוכם מראש. גם דמי ההגעה כלולים
            בהצעה, תמיד.
          </p>
        </div>
      </section>

      <section className="mt-14">
        <h2 className="text-center text-2xl font-bold text-ink sm:text-3xl">
          מה צריך לתקן?
        </h2>

        <ul className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {categories.map((category) => (
            <li key={category.id}>
              <Link
                href="/new-request"
                className="flex flex-col items-center gap-2 rounded-2xl border border-line bg-surface p-6 text-sm font-bold text-ink transition-colors hover:border-brand hover:text-brand"
              >
                <span aria-hidden className="text-3xl">
                  {categoryIcon(category.slug)}
                </span>
                {category.nameHe}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </AppShell>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <dt className="sr-only">{label}</dt>
      <dd>
        <span className="block text-2xl font-bold text-ink">{value}</span>
        <span className="mt-1 block text-xs text-muted">{label}</span>
      </dd>
    </div>
  );
}
