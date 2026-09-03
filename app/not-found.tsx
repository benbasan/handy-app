import Link from "next/link";
import { AppShell } from "@/components/ui/AppShell";
import { BUTTON_CTA, BUTTON_QUIET } from "@/components/ui/primitives";
import { MARKETING_ROUTES } from "@/lib/routes";
import { getCurrentUser } from "@/lib/supabase/session";

export const metadata = {
  title: "הדף הזה לא נמצא | Handy",
  robots: { index: false, follow: true },
};

/**
 * design/screens/content-6.7-404-empty-states.png.
 *
 * The mock also draws three empty states beside the 404 — "אין קריאות
 * פעילות", "לא התקבלו הצעות", "אין חיבור לאינטרנט". Those are states of other
 * screens, and each of those screens already draws its own (the account page,
 * the offers page). What is copied here is the part that belongs to this page:
 * the three ways out.
 *
 * `getCurrentUser()` rather than a static page, because "הקריאות שלי" should
 * lead an anonymous visitor to the door and a signed-in one to their calls —
 * which is exactly what proxy.ts does with that link either way.
 */
export default async function NotFound() {
  const user = await getCurrentUser();

  return (
    <AppShell user={user}>
      <section className="mx-auto max-w-2xl py-16 text-center">
        <p aria-hidden className="text-7xl font-bold text-line sm:text-8xl">
          404
        </p>

        <h1 className="mt-4 text-3xl font-bold text-ink sm:text-4xl">
          הדף הזה לא נמצא
        </h1>

        <p className="mt-4 text-lg text-muted">
          אולי הקריאה נסגרה או שהקישור פג. אפשר לחזור לדף הבית או לבדוק את
          הקריאות שלך.
        </p>

        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <Link href={MARKETING_ROUTES.home} className={BUTTON_CTA}>
            לדף הבית
          </Link>
          <Link href="/account" className={BUTTON_QUIET}>
            הקריאות שלי
          </Link>
          <Link href={MARKETING_ROUTES.contact} className={BUTTON_QUIET}>
            תמיכה
          </Link>
        </div>
      </section>
    </AppShell>
  );
}
