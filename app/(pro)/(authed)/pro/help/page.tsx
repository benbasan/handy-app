import Link from "next/link";
import { BUTTON_PRO } from "@/components/ui/primitives";
import { PRO_FAQ, PRO_GUIDE_LINKS, SUPPORT_CHANNELS } from "@/lib/content/help";
import { MARKETING_ROUTES } from "@/lib/routes";
import { requireRole } from "@/lib/supabase/session";

export const metadata = { title: "מרכז עזרה לבעלי מקצוע — Handy" };

/**
 * design/screens/pro-5.5-help-center.png.
 *
 * Signed-in rather than public, which is how the design captures it — the
 * screen sits inside the Handy Pro chrome, with the availability switch in the
 * header. The questions on it are also about a specific pro's own state
 * ("למה לא מגיעות לי קריאות"), which is not a question a stranger is asking.
 */
export default async function ProHelpPage() {
  await requireRole("pro");

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold text-ink sm:text-4xl">
          מרכז עזרה לבעלי מקצוע
        </h1>
        <p className="mt-2 text-muted">עמלות, אימות, עדכוני מחיר וגבייה.</p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[20rem_minmax(0,1fr)] lg:items-start">
        <aside className="space-y-4 lg:order-1">
          <div className="rounded-2xl bg-ink p-5 text-white sm:p-6">
            <h2 className="text-lg font-bold">מנהל קהילת בעלי המקצוע</h2>
            <p className="mt-2 text-sm text-white/75">
              שיחה ישירה ב{SUPPORT_CHANNELS.proHours}.
            </p>
            <Link
              href={MARKETING_ROUTES.contact}
              className={`${BUTTON_PRO} mt-4 w-full`}
            >
              פתח פנייה
            </Link>
          </div>

          <div className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
            <h2 className="text-lg font-bold text-ink">מדריכים</h2>
            <ul className="mt-3 space-y-2 text-sm">
              {PRO_GUIDE_LINKS.map((guide) => (
                <li key={guide.slug}>
                  <Link
                    href={MARKETING_ROUTES.guide(guide.slug)}
                    className="font-medium text-pro hover:underline"
                  >
                    {guide.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </aside>

        <div className="rounded-2xl border border-line bg-surface lg:order-2">
          {PRO_FAQ.map((entry) => (
            <details
              key={entry.question}
              className="group border-b border-line/70 px-5 py-4 last:border-b-0 sm:px-6"
            >
              <summary className="cursor-pointer list-none font-bold text-ink group-open:text-pro">
                {entry.question}
              </summary>
              <p className="mt-2 leading-relaxed text-muted">{entry.answer}</p>
            </details>
          ))}
        </div>
      </div>
    </div>
  );
}
