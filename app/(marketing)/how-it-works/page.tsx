import Link from "next/link";
import { AppShell } from "@/components/ui/AppShell";
import { BUTTON_CTA, BUTTON_QUIET, Card } from "@/components/ui/primitives";
import { MARKETING_ROUTES, PRO_ROUTES } from "@/lib/routes";
import { JsonLd, organizationJsonLd, pageMetadata } from "@/lib/seo";
import { getCurrentUser } from "@/lib/supabase/session";

export const dynamic = "force-dynamic";

export const metadata = pageMetadata({
  title: "איך זה עובד",
  description:
    "Handy מאמתת כל בעל מקצוע, מציגה מחירים לפני שמישהו נכנס אליכם הביתה, ומחייבת תמונה ואישור על כל שינוי מחיר בשטח. כך זה עובד — משני הצדדים.",
  path: MARKETING_ROUTES.howItWorks,
});

/**
 * design/screens/content-6.1-about-how-it-works.png.
 *
 * Two columns of numbered steps under one headline — the customer's three on
 * the leading side, the pro's four on the trailing one. The mock's headline is
 * kept verbatim; it is the clearest sentence anybody wrote about this product.
 */
const CUSTOMER_STEPS = [
  {
    title: "מתארים את התקלה",
    text: "תחום, תיאור, תמונה או סרטון — שתי דקות.",
  },
  {
    title: "מקבלים הצעות",
    text: "בעלי מקצוע מאומתים בסביבה שולחים מחיר וזמן הגעה.",
  },
  {
    title: "בוחרים ועוקבים",
    text: "מעקב בזמן אמת, קבלה דיגיטלית ודירוג בסיום.",
  },
];

const PRO_STEPS = [
  {
    title: "פרופיל מאומת",
    text: "ת.ז, רישיון ותמונה — אישור תוך 24 שעות.",
  },
  { title: "קריאות בסביבה", text: "רק בתחומים ובאזור שבחרת." },
  { title: "מחיר וזמן הגעה", text: "אתה קובע. הלקוח בוחר." },
  {
    title: "גבייה בשטח",
    text: "מזומן, ביט, פייבוקס או העברה — ישירות אליך.",
  },
];

export default async function HowItWorksPage() {
  const user = await getCurrentUser();

  return (
    <AppShell user={user}>
      <JsonLd data={organizationJsonLd()} />

      <section className="mx-auto max-w-3xl text-center">
        <h1 className="text-3xl leading-tight font-bold text-ink sm:text-5xl">
          Handy קיימת כדי שלא תצטרכו לחפש הנדימן בקבוצות ווטסאפ
        </h1>
        <p className="mt-5 text-lg text-muted">
          אנחנו מאמתים כל בעל מקצוע, מציגים מחירים לפני שמישהו נכנס אליכם הביתה,
          ומחייבים תמונה ואישור על כל שינוי מחיר בשטח.
        </p>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <Link href="/new-request" className={BUTTON_CTA}>
            פרסם קריאה — חינם
          </Link>
          <Link href={PRO_ROUTES.landing} className={BUTTON_QUIET}>
            אני בעל מקצוע
          </Link>
        </div>
      </section>

      <section className="mt-14 grid gap-8 lg:grid-cols-2">
        <div>
          <h2 className="text-2xl font-bold text-ink">בשביל הלקוח</h2>
          <ol className="mt-5 space-y-3">
            {CUSTOMER_STEPS.map((step, index) => (
              <li key={step.title}>
                <StepCard
                  step={index + 1}
                  title={step.title}
                  text={step.text}
                />
              </li>
            ))}
          </ol>
        </div>

        <div>
          <h2 className="text-2xl font-bold text-ink">בשביל בעל המקצוע</h2>
          <ol className="mt-5 space-y-3">
            {PRO_STEPS.map((step, index) => (
              <li key={step.title}>
                <StepCard
                  step={index + 1}
                  title={step.title}
                  text={step.text}
                  tone="pro"
                />
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="mt-14 grid gap-4 sm:grid-cols-3">
        <Card>
          <h3 className="text-lg font-bold text-ink">אין דמי הגעה נסתרים</h3>
          <p className="mt-2 text-sm text-muted">
            כל הצעה כוללת את הביקור. אין תשלום נפרד על אבחון.
          </p>
        </Card>
        <Card>
          <h3 className="text-lg font-bold text-ink">
            עמלה רק על עבודה שנסגרה
          </h3>
          <p className="mt-2 text-sm text-muted">
            12% מבעל המקצוע. הלקוח לא משלם ל-Handy כלום, ואין דמי הרשמה.
          </p>
        </Card>
        <div className="rounded-2xl bg-ink p-5 text-white sm:p-6">
          <h3 className="text-lg font-bold">שינוי מחיר = תמונה + אישור</h3>
          <p className="mt-2 text-sm text-white/75">
            בלי אישור מפורש שלכם, העבודה ממשיכה במחיר שסוכם. זו התנהגות המערכת,
            לא הבטחה.
          </p>
        </div>
      </section>

      <section className="mt-12 rounded-2xl border border-line bg-surface p-6 text-center sm:p-8">
        <h2 className="text-2xl font-bold text-ink">
          רוצים לדעת כמה זה אמור לעלות?
        </h2>
        <p className="mt-2 text-muted">
          מדריך העלויות שלנו בנוי מטווחי מחירים של עבודות שנסגרו בפועל ב-Handy.
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-3">
          <Link href={MARKETING_ROUTES.pricing} className={BUTTON_CTA}>
            מדריך מחירים
          </Link>
          <Link href={MARKETING_ROUTES.services} className={BUTTON_QUIET}>
            כל תחומי השירות
          </Link>
        </div>
      </section>
    </AppShell>
  );
}

function StepCard({
  step,
  title,
  text,
  tone = "brand",
}: {
  step: number;
  title: string;
  text: string;
  tone?: "brand" | "pro";
}) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-line bg-surface p-5">
      <span
        aria-hidden
        className={`mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
          tone === "pro" ? "bg-pro-soft text-pro" : "bg-brand-soft text-brand"
        }`}
      >
        {step}
      </span>
      <div>
        <h3 className="font-bold text-ink">{title}</h3>
        <p className="mt-1 text-sm text-muted">{text}</p>
      </div>
    </div>
  );
}
