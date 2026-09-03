import Link from "next/link";
import { ProLogo } from "@/components/pro/ProLogo";
import { BUTTON_PRO, Card } from "@/components/ui/primitives";
import { PRO_ROUTES, ROLE_LOGIN } from "@/lib/routes";
import { getCurrentUser } from "@/lib/supabase/session";
import { COMMISSION_RATE } from "@/lib/validation/pros";

// Identity is a per-request fact, not a build-time one.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Handy Pro — עבודות אמיתיות, בסביבה שלך",
  description:
    "קריאות מלקוחות מאומתים ברדיוס שאתם בוחרים. עמלה של 12% רק על עבודה שנסגרה, ללא דמי הרשמה וללא תשלום על הצעות שלא נבחרו.",
};

/**
 * design/screens/pro-1.1-landing.png — the pro landing page, at `/pro`, which
 * is the URL the design itself was captured at.
 *
 * That is why the signed-in pro home moved to `/pro/dashboard` (also the
 * design's own URL for it): a route group adds no path segment, so `/pro`
 * could not be both an anonymous marketing page and a gated home. See
 * lib/routes.ts.
 *
 * One deliberate departure, the same one the customer landing page makes: the
 * mock's hero figure (₪2,450 median weekly income) is prototype filler.
 * Publishing an invented earnings figure to people deciding whether to work
 * here is not a design detail worth copying, so the three-up strip carries the
 * commercial terms instead, which are facts.
 */
export default async function ProLandingPage() {
  const user = await getCurrentUser();

  // A signed-in pro gets "לדשבורד"; anyone else gets the sign-up path. A
  // customer who lands here is not bounced — this page is public, and the
  // sign-in screen will place them correctly.
  const primaryHref =
    user?.role === "pro" ? PRO_ROUTES.dashboard : ROLE_LOGIN.pro;
  const primaryLabel =
    user?.role === "pro" ? "לדשבורד שלי" : "הצטרף כבעל מקצוע";

  return (
    <>
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-4 sm:px-6">
          <ProLogo />
          <div className="ms-auto flex items-center gap-3">
            <Link
              href="/"
              className="text-sm font-medium text-muted hover:text-ink"
            >
              ללקוחות
            </Link>
            <Link
              href={primaryHref}
              className={`${BUTTON_PRO} px-4 py-2 text-sm`}
            >
              {primaryLabel}
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <section className="bg-ink text-white">
          <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-14 sm:px-6 sm:py-20 lg:grid-cols-2">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full bg-cta/15 px-4 py-2 text-sm font-semibold text-cta-bright">
                ללא דמי מנוי · עמלה רק על עבודה שנסגרה
              </p>

              <h1 className="mt-5 text-4xl leading-tight font-bold sm:text-5xl">
                עבודות אמיתיות,
                <br />
                <span className="text-pro-soft">בסביבה שלך</span>
              </h1>

              <p className="mt-4 max-w-lg text-lg text-white/75">
                קריאות מלקוחות מאומתים ברדיוס שאתה בוחר. אתה מגיש מחיר וזמן
                הגעה, הלקוח בוחר, והתשלום נגבה בשטח — ישירות אליך.
              </p>

              <div className="mt-7 flex flex-wrap gap-3">
                <Link href={primaryHref} className={BUTTON_PRO}>
                  {primaryLabel}
                </Link>
                <Link
                  href={ROLE_LOGIN.pro}
                  className="inline-flex items-center justify-center rounded-xl border border-white/25 px-5 py-3 text-base font-semibold text-white transition-colors hover:bg-white/10"
                >
                  כניסה לחשבון
                </Link>
              </div>

              <dl className="mt-8 grid max-w-lg grid-cols-3 gap-4">
                <Stat value="0 ₪" label="דמי הרשמה" />
                <Stat
                  value={`${Math.round(COMMISSION_RATE * 100)}%`}
                  label="עמלה בלבד"
                />
                <Stat value="0 ₪" label="על הצעה שלא נבחרה" />
              </dl>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/5 p-8 sm:p-10">
              <p className="text-sm font-semibold text-cta-bright">
                השקיפות עובדת גם לטובתך
              </p>
              <p className="mt-3 text-2xl leading-snug font-bold">
                עדכון מחיר בשטח מגובה בתמונה ובאישור של הלקוח — בכתב.
              </p>
              <p className="mt-4 text-white/75">
                כשהמחיר משתנה בצורה מתועדת, אין ויכוח בסוף העבודה ואין מחלוקת על
                מה שסוכם.
              </p>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
          <h2 className="text-center text-2xl font-bold text-ink sm:text-3xl">
            איך זה עובד עבורך
          </h2>

          <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Step
              index={1}
              title="פרופיל מאומת"
              body="ת.ז, רישיון ותמונה — אישור תוך 24 שעות."
            />
            <Step
              index={2}
              title="קריאות בסביבה"
              body="רק בתחומים ובאזור שבחרת, לפי רדיוס אמיתי על המפה."
            />
            <Step
              index={3}
              title="מחיר וזמן הגעה"
              body="אתה קובע. ההצעה כוללת את הביקור — אין דמי הגעה נפרדים."
            />
            <Step
              index={4}
              title="גבייה בשטח"
              body="מזומן, ביט, פייבוקס או העברה — ישירות אליך."
            />
          </ol>
        </section>

        <section className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
          <Card className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-ink">
                מוכן לקבל את הקריאה הראשונה?
              </h2>
              <p className="mt-1 text-muted">
                ההרשמה לוקחת כ-8 דקות, ואפשר לעצור ולהמשיך בכל רגע.
              </p>
            </div>
            <Link href={primaryHref} className={BUTTON_PRO}>
              {primaryLabel}
            </Link>
          </Card>
        </section>
      </main>

      <footer className="border-t border-line bg-surface">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-6 text-sm text-muted sm:px-6">
          <p>Handy Pro · עמלה של 12% — רק על עבודה שנסגרה.</p>
          <Link href="/" className="hover:text-ink">
            לאזור הלקוחות
          </Link>
        </div>
      </footer>
    </>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <dt className="sr-only">{label}</dt>
      <dd>
        <span className="block text-2xl font-bold text-cta-bright">
          {value}
        </span>
        <span className="mt-1 block text-xs text-white/60">{label}</span>
      </dd>
    </div>
  );
}

function Step({
  index,
  title,
  body,
}: {
  index: number;
  title: string;
  body: string;
}) {
  return (
    <li className="rounded-2xl border border-line bg-surface p-5">
      <span
        aria-hidden
        className="flex size-8 items-center justify-center rounded-full bg-pro-soft text-sm font-bold text-pro"
      >
        {index}
      </span>
      <h3 className="mt-3 font-bold text-ink">{title}</h3>
      <p className="mt-1 text-sm text-muted">{body}</p>
    </li>
  );
}
