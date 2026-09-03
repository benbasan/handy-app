import Link from "next/link";
import { MARKETING_ROUTES } from "@/lib/routes";

/**
 * The footer on every public screen in design/screens/content-*.png: the two
 * Handy lines on the leading edge, the content links on the trailing one.
 *
 * It became a component of its own in Phase 8, when there was finally
 * somewhere for those links to go — until then AppShell carried the two lines
 * inline and nothing else, because a link to a page that does not exist is
 * worse than no link.
 *
 * The design's row also ends with a "404" link. That one is the prototype's
 * own screen index rather than a thing a site links to, and it is left out.
 */
const LINKS: ReadonlyArray<{ href: string; label: string }> = [
  { href: MARKETING_ROUTES.howItWorks, label: "אודות" },
  { href: MARKETING_ROUTES.services, label: "תחומי שירות" },
  { href: MARKETING_ROUTES.pricing, label: "מחירים" },
  { href: MARKETING_ROUTES.guides, label: "מדריכים" },
  { href: MARKETING_ROUTES.terms, label: "תקנון ופרטיות" },
  { href: MARKETING_ROUTES.contact, label: "תמיכה" },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-line bg-ink text-white/70">
      <div className="mx-auto flex max-w-6xl flex-wrap items-start justify-between gap-6 px-4 py-8 text-sm sm:px-6">
        <div className="space-y-1">
          <p>Handy · בעלי מקצוע מאומתים · תל אביב והמרכז</p>
          <p>תשלום ישיר לבעל המקצוע · שקיפות מחירים מלאה</p>
        </div>

        <nav className="flex flex-wrap gap-x-6 gap-y-2">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="font-medium text-white/80 hover:text-white"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
