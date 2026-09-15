import Link from "next/link";
import { BrandMark } from "@/components/ui/BrandMark";
import { categoryCopy } from "@/lib/content/categories";
import { CITIES, inCity } from "@/lib/content/cities";
import { MARKETING_ROUTES } from "@/lib/routes";

/**
 * The footer on every public screen.
 *
 * Phase 19 gave it the mark and a column for the launch area. Handy is
 * marketed in Tel Aviv and the centre first (the user's decision, 15.9.2026),
 * so the most useful thing a footer can carry is a direct way into the pages a
 * person in that area searches for — "אינסטלטור בתל אביב" — which are also the
 * pages the SEO work in Phase 8 exists to rank. The trades listed are the ones
 * where somebody is most often searching in a hurry.
 */
const LINKS: ReadonlyArray<{ href: string; label: string }> = [
  { href: MARKETING_ROUTES.howItWorks, label: "איך זה עובד" },
  { href: MARKETING_ROUTES.services, label: "תחומי שירות" },
  { href: MARKETING_ROUTES.pricing, label: "מחירים" },
  { href: MARKETING_ROUTES.guides, label: "מדריכים" },
  { href: MARKETING_ROUTES.terms, label: "תקנון ופרטיות" },
  { href: MARKETING_ROUTES.contact, label: "תמיכה" },
];

const LAUNCH_TRADES = ["plumbing", "electrical", "hvac", "locksmith"] as const;
const LAUNCH_CITY = CITIES.find((city) => city.slug === "tel-aviv")!;

export function SiteFooter() {
  return (
    <footer className="border-t border-line bg-ink text-white/75">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 text-sm sm:grid-cols-3 sm:px-6">
        <div className="space-y-3">
          <p
            dir="ltr"
            className="flex items-center justify-end gap-2 font-display text-xl font-bold text-white"
          >
            Handy
            <BrandMark className="size-7" />
          </p>
          <p>בעלי מקצוע מאומתים מהאזור, עם מחיר לפני שמגיעים.</p>
          <p>תל אביב והמרכז</p>
        </div>

        <nav aria-label="בעלי מקצוע בתל אביב" className="space-y-2">
          <p className="font-semibold text-white">בתל אביב</p>
          <ul className="space-y-1.5">
            {LAUNCH_TRADES.map((slug) => (
              <li key={slug}>
                <Link
                  href={MARKETING_ROUTES.categoryInCity(slug, LAUNCH_CITY.slug)}
                  className="hover:text-white"
                >
                  {categoryCopy(slug).professional} {inCity(LAUNCH_CITY)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <nav aria-label="Handy" className="space-y-2">
          <p className="font-semibold text-white">Handy</p>
          <ul className="grid grid-cols-2 gap-x-6 gap-y-1.5">
            {LINKS.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="hover:text-white">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </footer>
  );
}
