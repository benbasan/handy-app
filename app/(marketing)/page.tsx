import Link from "next/link";
import { AppShell } from "@/components/ui/AppShell";
import {
  BUTTON_BASE,
  BUTTON_CTA,
  BUTTON_QUIET,
  CARD_BASE,
  HERO_TITLE,
  INPUT_CLASS,
  SECTION_TITLE,
} from "@/components/ui/primitives";
import { CheckIcon } from "@/components/ui/icons";
import { DemoLoginPanel } from "@/components/marketing/DemoLoginPanel";
import {
  OffersPhoneMockup,
  PriceUpdateMockup,
  StepPicture,
} from "@/components/marketing/ProductMockups";
import { CategoryIcon } from "@/lib/categories";
import { CITIES } from "@/lib/content/cities";
import { demoKeyForPhone, demoLoginsEnabled } from "@/lib/demo";
import { CUSTOMER_ROUTES, MARKETING_ROUTES, PRO_ROUTES } from "@/lib/routes";
import { listCategories } from "@/lib/supabase/jobs";
import { getCurrentUser } from "@/lib/supabase/session";

// Identity and the category list are per-request facts, not build-time ones.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Handy — נזילה? קצר? בעל מקצוע מאומת מהאזור, עם מחיר מראש",
  description:
    "מתארים מה קרה, מקבלים הצעות מחיר מבעלי מקצוע מאומתים באזור, ובוחרים. פרסום קריאה בחינם, וכל שינוי מחיר בשטח מחייב תמונה ואישור שלכם.",
};

/**
 * The customer landing page.
 *
 * Rebuilt in Phase 19, when the user said the site "feels generic" before
 * marketing it. The first version followed design/screens/customer-1.1-landing
 * faithfully — a hero, three figures and a category grid — and was one screen
 * long with no picture on it. What changed, and why:
 *
 *  * **"מה קרה?" moved into the hero.** It is the fastest way into the product
 *    (a sentence becomes a chosen trade and a written description), and on a
 *    phone it used to sit below the fold, under a dark panel of text.
 *  * **The picture is the product.** An example of the offers screen and of a
 *    field price update, each tagged "דוגמה" — the user chose mock-ups drawn in
 *    code over photographs. See components/marketing/ProductMockups.tsx for why
 *    those numbers are allowed on a public page.
 *  * **The page now makes the argument** the product exists for: how it works,
 *    the price rule as something you can see, and the WhatsApp group it
 *    replaces — a line that had been buried on /how-it-works.
 *  * **Every claim is one the code keeps.** Identity is the one document
 *    `submit_pro_for_approval()` requires, so identity is what is promised;
 *    licence and insurance are shown where a pro uploaded them, and said so.
 *
 * The category strip is real data from `categories`, which is the one table
 * anonymous visitors can read.
 */

/** Tel Aviv and the centre: where Handy is marketed first (15.9.2026). */
const LAUNCH_AREA = [
  "tel-aviv",
  "ramat-gan",
  "givatayim",
  "bnei-brak",
  "holon",
  "bat-yam",
  "petah-tikva",
  "herzliya",
  "rishon-lezion",
  "raanana",
  "kfar-saba",
] as const;

const STEPS = [
  {
    step: 1,
    title: "מתארים מה קרה",
    body: "משפט אחד במילים שלכם, ואם אפשר גם תמונה. לא צריך להירשם כדי להתחיל.",
  },
  {
    step: 2,
    title: "מקבלים הצעות מחיר",
    body: "בעלי מקצוע מאומתים באזור שולחים מחיר מלא וחלון הגעה, והביקור כלול בו.",
  },
  {
    step: 3,
    title: "בוחרים, והוא בדרך",
    body: "משווים מחיר, ביקורות וזמן הגעה, מדברים בצ׳אט, ומשלמים לו ישירות בסוף.",
  },
] as const;

const VERSUS: ReadonlyArray<{ topic: string; group: string; handy: string }> = [
  {
    topic: "מי מגיע",
    group: "מישהו שחבר של חבר המליץ עליו",
    handy: "בעל מקצוע שתעודת הזהות שלו נבדקה לפני שקיבל קריאה",
  },
  {
    topic: "המחיר",
    group: "״נראה כשאגיע״",
    handy: "הצעת מחיר מלאה לפני שהוא יוצא, כולל הביקור",
  },
  {
    topic: "אם המחיר משתנה",
    group: "ויכוח בסוף העבודה",
    handy: "רק עם תמונה של התקלה ואישור שלכם",
  },
  {
    topic: "השוואה",
    group: "מי שענה ראשון",
    handy: "כמה הצעות זו לצד זו, עם ביקורות מלקוחות אמיתיים",
  },
  {
    topic: "אחרי העבודה",
    group: "הודעות שנבלעות בקבוצה",
    handy: "שיחה, קבלה ודירוג, שמורים לכל עבודה",
  },
];

export default async function LandingPage() {
  const [user, categories] = await Promise.all([
    getCurrentUser(),
    listCategories(),
  ]);

  const launchCities = LAUNCH_AREA.flatMap((slug) => {
    const city = CITIES.find((candidate) => candidate.slug === slug);
    return city ? [city] : [];
  });

  return (
    <AppShell user={user}>
      {/* Above the hero, not below it. Below, a developer tool sits inside the
          marketing narrative and reads as a product section; above, it reads as
          environment chrome — and it is reachable without scrolling, which is
          the point when identities are being switched live. Absent entirely
          unless the flag is set; see lib/demo.ts. */}
      {demoLoginsEnabled() && (
        <DemoLoginPanel
          currentKey={demoKeyForPhone(user?.phone)}
          currentName={user?.fullName ?? null}
        />
      )}

      {/* ── Hero ───────────────────────────────────────────────────────── */}
      <section className="relative grid items-center gap-10 lg:grid-cols-[1.15fr_0.85fr]">
        <div>
          <p className="inline-flex items-center gap-2 rounded-full bg-brand-soft px-4 py-2 text-sm font-semibold text-brand-strong">
            <CheckIcon className="size-4" />
            כל בעל מקצוע עובר אימות זהות לפני הקריאה הראשונה
          </p>

          <h1 className={`mt-5 text-balance ${HERO_TITLE} sm:text-6xl`}>
            נזילה? קצר?
            <br />
            <span className="text-brand">מזגן שמטפטף?</span>
          </h1>

          <p className="mt-4 max-w-lg text-lg text-muted sm:text-xl">
            בעל מקצוע מאומת מהאזור, עם מחיר לפני שהוא דופק בדלת.
          </p>

          {/*
            "מה קרה?" — a sentence in, the form out with the trade already
            chosen and the description already written. A plain GET form rather
            than a client component: the new-request page reads `q` on the
            server and matches it there (lib/content/intent.ts), so this works
            before any JavaScript has loaded, and a phone on a slow network is
            exactly who is typing into it.
          */}
          <form
            action={CUSTOMER_ROUTES.newRequest}
            method="get"
            role="search"
            className={`mt-7 flex max-w-xl flex-col gap-2 p-2 sm:flex-row ${CARD_BASE} shadow-lift`}
          >
            <label htmlFor="what-happened" className="sr-only">
              מה קרה? תארו את התקלה במילים שלכם
            </label>
            <input
              id="what-happened"
              name="q"
              type="search"
              maxLength={200}
              required
              placeholder="מה קרה? למשל: הדוד לא מחמם"
              className={`${INPUT_CLASS} border-transparent bg-surface`}
            />
            <button type="submit" className={`${BUTTON_CTA} shrink-0`}>
              קבלו הצעות מחיר
            </button>
          </form>

          <ul className="mt-5 flex flex-wrap gap-2 text-sm font-medium text-ink">
            {[
              "פרסום קריאה בחינם",
              "מחיר לפני שמגיעים",
              "שינוי מחיר רק באישורכם",
            ].map((value) => (
              <li
                key={value}
                className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1"
              >
                <CheckIcon className="size-4 text-brand" />
                {value}
              </li>
            ))}
          </ul>
        </div>

        <div className="relative">
          {/* Decoration only: a saffron sun behind the phone. */}
          <div
            aria-hidden
            className="absolute inset-x-0 top-6 -z-10 mx-auto size-64 rounded-full bg-accent-soft sm:size-80"
          />
          <OffersPhoneMockup />
        </div>
      </section>

      {/* ── Trades ─────────────────────────────────────────────────────── */}
      <section className="mt-16 sm:mt-20" aria-labelledby="trades">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 id="trades" className="text-2xl font-bold text-ink sm:text-3xl">
            במה צריך עזרה?
          </h2>
          <Link
            href={MARKETING_ROUTES.services}
            className="text-sm font-semibold text-brand hover:text-brand-strong"
          >
            כל תחומי השירות
          </Link>
        </div>

        <ul className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {categories.map((category, index) => (
            <li key={category.id}>
              <Link
                href={CUSTOMER_ROUTES.newRequestFor(category.slug)}
                className={`group flex flex-col items-center gap-3 ${CARD_BASE} p-5 text-sm font-bold text-ink transition-colors hover:border-brand hover:text-brand`}
              >
                {/* Alternating petrol and saffron grounds, so ten tiles read as
                    a set rather than a spreadsheet. The icon inherits the
                    link's colour, which is why these are drawn, not emoji. */}
                <span
                  className={`flex size-14 items-center justify-center rounded-2xl ${
                    index % 2 === 0
                      ? "bg-brand-soft text-brand"
                      : "bg-accent-soft text-ink"
                  } group-hover:text-brand`}
                >
                  <CategoryIcon slug={category.slug} className="size-7" />
                </span>
                {category.nameHe}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* ── How it works ───────────────────────────────────────────────── */}
      <section className="mt-16 sm:mt-24" aria-labelledby="how">
        <h2 id="how" className="text-2xl font-bold text-ink sm:text-3xl">
          איך זה עובד
        </h2>
        <ol className="mt-6 grid gap-6 md:grid-cols-3">
          {STEPS.map((item) => (
            <li key={item.step} className="flex flex-col gap-4">
              <StepPicture step={item.step} />
              <div className="flex gap-3">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-ink font-display text-sm font-bold text-white">
                  <span className="ltr-nums">{item.step}</span>
                </span>
                <div>
                  <h3 className={SECTION_TITLE}>{item.title}</h3>
                  <p className="mt-1 text-muted">{item.body}</p>
                </div>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* ── The price rule ─────────────────────────────────────────────── */}
      <section
        className="mt-16 grid items-center gap-10 rounded-3xl bg-surface p-6 sm:mt-24 sm:p-10 lg:grid-cols-2"
        aria-labelledby="price-rule"
      >
        <div>
          <p className="text-sm font-bold text-alert-strong">
            הכלל שלא מתגמשים בו
          </p>
          <h2
            id="price-rule"
            className="mt-2 text-3xl leading-tight font-bold text-ink sm:text-4xl"
          >
            המחיר שסגרתם הוא המחיר שתשלמו.
          </h2>
          <p className="mt-4 text-lg text-muted">
            מתברר בשטח שצריך יותר? בעל המקצוע שולח בקשה עם תמונה של התקלה, ואתם
            מחליטים. בלי אישור שלכם — העבודה ממשיכה במחיר המקורי.
          </p>
          <p className="mt-3 text-muted">
            זה לא נוהל שמבקשים לכבד. המחיר פשוט לא יכול להשתנות במערכת בלי
            האישור שלכם.
          </p>
        </div>
        <PriceUpdateMockup className="mx-auto w-full max-w-sm" />
      </section>

      {/* ── Versus the WhatsApp group ──────────────────────────────────── */}
      <section className="mt-16 sm:mt-24" aria-labelledby="versus">
        <h2
          id="versus"
          className="max-w-2xl text-2xl font-bold text-balance text-ink sm:text-3xl"
        >
          בשביל זה לא צריך עוד לחפש הנדימן בקבוצות וואטסאפ
        </h2>

        {/* A phone gets one card per topic. As a scrolling table it opened on
            the two columns that are not the point, with the Handy column cut
            off past the edge of the screen. */}
        <ul className="mt-6 space-y-3 md:hidden">
          {VERSUS.map((row) => (
            <li key={row.topic} className={`${CARD_BASE} p-4`}>
              <p className="font-bold text-ink">{row.topic}</p>
              <p className="mt-2 text-sm text-muted">
                <span className="font-medium">בקבוצת וואטסאפ: </span>
                {row.group}
              </p>
              <p className="mt-2 flex items-start gap-2 rounded-xl bg-brand-soft px-3 py-2 text-sm text-ink">
                <CheckIcon className="mt-0.5 size-4 shrink-0 text-brand" />
                <span>
                  <span className="font-bold text-brand-strong">ב-Handy: </span>
                  {row.handy}
                </span>
              </p>
            </li>
          ))}
        </ul>

        <div className={`mt-6 hidden overflow-x-auto md:block ${CARD_BASE}`}>
          <table className="w-full min-w-xl border-collapse text-start">
            <caption className="sr-only">
              השוואה בין חיפוש בקבוצת וואטסאפ לבין Handy
            </caption>
            <thead>
              <tr className="border-b border-line text-sm">
                <th
                  scope="col"
                  className="px-5 py-4 text-start font-medium text-muted"
                >
                  <span className="sr-only">נושא</span>
                </th>
                <th
                  scope="col"
                  className="px-5 py-4 text-start font-medium text-muted"
                >
                  קבוצת וואטסאפ
                </th>
                <th
                  scope="col"
                  className="bg-brand-soft px-5 py-4 text-start font-display font-bold text-brand-strong"
                >
                  Handy
                </th>
              </tr>
            </thead>
            <tbody>
              {VERSUS.map((row) => (
                <tr
                  key={row.topic}
                  className="border-b border-line last:border-0"
                >
                  <th
                    scope="row"
                    className="px-5 py-4 text-start font-bold text-ink"
                  >
                    {row.topic}
                  </th>
                  <td className="px-5 py-4 text-muted">{row.group}</td>
                  <td className="bg-brand-soft/50 px-5 py-4 text-ink">
                    <span className="flex items-start gap-2">
                      <CheckIcon className="mt-0.5 size-4 shrink-0 text-brand" />
                      {row.handy}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mt-4 max-w-2xl text-sm text-muted">
          רישיון עוסק וביטוח אחריות מקצועית מסומנים בפרופיל של כל בעל מקצוע
          שהעלה אותם. ביקורת נכתבת רק על ידי לקוח שהעבודה שלו נסגרה.
        </p>
      </section>

      {/* ── Launch area ────────────────────────────────────────────────── */}
      <section
        className="mt-16 flex flex-col gap-5 sm:mt-24 lg:flex-row lg:items-center lg:justify-between"
        aria-labelledby="area"
      >
        <div className="max-w-md">
          <h2 id="area" className="text-2xl font-bold text-ink sm:text-3xl">
            מתחילים בתל אביב והמרכז
          </h2>
          <p className="mt-3 text-muted">
            בעלי המקצוע מקבלים קריאות לפי המרחק שהם עצמם בחרו, ולכן הקריאה שלכם
            מגיעה למי שבאמת מגיע אליכם.
          </p>
        </div>
        <ul className="flex flex-wrap gap-2 lg:max-w-xl lg:justify-end">
          {launchCities.map((city) => (
            <li
              key={city.slug}
              className="rounded-full border border-line bg-surface px-3.5 py-1.5 text-sm font-medium text-ink"
            >
              {city.nameHe}
            </li>
          ))}
        </ul>
      </section>

      {/* ── Closing ────────────────────────────────────────────────────── */}
      <section className="mt-16 grid gap-4 sm:mt-24 lg:grid-cols-[1.4fr_1fr]">
        <div className="rounded-3xl bg-brand p-8 text-white sm:p-10">
          <h2 className="text-3xl leading-tight font-bold sm:text-4xl">
            מה צריך לתקן היום?
          </h2>
          <p className="mt-3 max-w-md text-lg text-white/85">
            פרסום הקריאה בחינם, ולא צריך להירשם עד שהיא מוכנה.
          </p>
          <Link
            href={CUSTOMER_ROUTES.newRequest}
            className={`${BUTTON_BASE} mt-6 bg-white text-brand-strong hover:bg-accent-soft focus-visible:ring-white focus-visible:ring-offset-brand`}
          >
            פרסם קריאה — חינם
          </Link>
        </div>

        <div className="flex flex-col justify-between gap-5 rounded-3xl bg-pro p-8 text-white sm:p-10">
          <div>
            <p className="text-sm font-bold text-cta-bright">לבעלי מקצוע</p>
            <h2 className="mt-2 text-2xl leading-tight font-bold">
              עבודות אמיתיות באזור שלכם
            </h2>
            <p className="mt-2 text-white/80">
              בלי דמי מנוי. אתם קובעים את המחיר ומשלמים רק על עבודה שלקחתם.
            </p>
          </div>
          <Link
            href={PRO_ROUTES.landing}
            className={`${BUTTON_QUIET} self-start border-white/25 bg-transparent text-white hover:bg-white/10 focus-visible:ring-white focus-visible:ring-offset-pro`}
          >
            אני בעל מקצוע
          </Link>
        </div>
      </section>
    </AppShell>
  );
}
