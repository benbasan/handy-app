import Link from "next/link";
import { HelpBrowser } from "@/components/marketing/HelpBrowser";
import { AppShell } from "@/components/ui/AppShell";
import { BUTTON_CTA } from "@/components/ui/primitives";
import {
  CUSTOMER_FAQ,
  POPULAR_HELP_TOPICS,
  SUPPORT_CHANNELS,
} from "@/lib/content/help";
import { MARKETING_ROUTES } from "@/lib/routes";
import { JsonLd, faqJsonLd, pageMetadata } from "@/lib/seo";
import { getCurrentUser } from "@/lib/supabase/session";

export const dynamic = "force-dynamic";

export const metadata = pageMetadata({
  title: "עזרה ושאלות נפוצות",
  description:
    "תשובות על פרסום קריאה, עדכון מחיר בשטח, אימות בעלי מקצוע, קבלות וביטולים — ואיך פונים לתמיכה של Handy.",
  path: MARKETING_ROUTES.help,
});

/** design/screens/content-6.3-faq.png. */
export default async function HelpPage() {
  const user = await getCurrentUser();

  const allEntries = CUSTOMER_FAQ.flatMap((topic) => topic.entries);

  return (
    <AppShell user={user}>
      <JsonLd data={faqJsonLd(allEntries)} />

      <section className="text-center">
        <h1 className="text-3xl font-bold text-ink sm:text-5xl">במה נעזור?</h1>
      </section>

      <div className="mt-8 grid gap-6 lg:grid-cols-[20rem_minmax(0,1fr)] lg:items-start">
        <aside className="space-y-4 lg:order-2">
          <div className="rounded-2xl bg-ink p-5 text-white sm:p-6">
            <h2 className="text-lg font-bold">לא מצאת תשובה?</h2>
            <p className="mt-2 text-sm text-white/75">
              צוות התמיכה זמין {SUPPORT_CHANNELS.hours}, כל יום.
            </p>
            <Link
              href={MARKETING_ROUTES.contact}
              className={`${BUTTON_CTA} mt-4 w-full`}
            >
              פנייה לתמיכה
            </Link>
          </div>

          <div className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
            <h2 className="text-lg font-bold text-ink">נושאים פופולריים</h2>
            <ul className="mt-3 space-y-2 text-sm">
              {POPULAR_HELP_TOPICS.map((topic) => (
                <li key={topic.label}>
                  <a
                    href={`#${topic.topicId}`}
                    className="font-medium text-brand hover:underline"
                  >
                    {topic.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </aside>

        <div className="lg:order-1">
          <HelpBrowser topics={CUSTOMER_FAQ} />
        </div>
      </div>
    </AppShell>
  );
}
