import Link from "next/link";
import { signOut } from "@/lib/actions/auth";
import { BUTTON_CTA } from "@/components/ui/primitives";
import { Logo } from "@/components/ui/Logo";
import { CUSTOMER_ROUTES, MARKETING_ROUTES, PRO_ROUTES } from "@/lib/routes";
import type { CurrentUser } from "@/lib/supabase/session";

/**
 * The header from every customer screen in design/screens/: wordmark on the
 * leading edge, navigation beside it, and the green "פרסם קריאה" call to
 * action on the trailing edge.
 *
 * The design's איך זה עובד / מחירים / עזרה joined the row in Phase 8, when the
 * pages behind them became real — until then they were left out rather than
 * stubbed, because a link to a 404 is worse than no link.
 *
 * "הקריאות שלי" is shown to everyone, not only to a signed-in customer, which
 * is how the design draws it: an anonymous visitor who clicks it is asking to
 * sign in, and proxy.ts sends them to the door rather than to a dead end.
 */
export function SiteHeader({
  user,
  unreadNotifications = 0,
}: {
  user: CurrentUser | null;
  unreadNotifications?: number;
}) {
  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-4 sm:px-6">
        <Logo />

        <nav className="order-3 flex w-full flex-wrap items-center gap-x-5 gap-y-2 text-sm font-medium text-ink sm:order-none sm:w-auto">
          <Link href={MARKETING_ROUTES.howItWorks} className="hover:text-brand">
            איך זה עובד
          </Link>
          <Link href={MARKETING_ROUTES.pricing} className="hover:text-brand">
            מחירים
          </Link>
          {user?.role !== "pro" && user?.role !== "admin" && (
            <Link href="/account" className="hover:text-brand">
              הקריאות שלי
            </Link>
          )}
          {/* Only for somebody who is actually signed in as a customer: an
              anonymous visitor has nothing to count, and "הקריאות שלי" above
              is deliberately shown to everyone for a different reason — it is
              a request to sign in. */}
          {user?.role === "customer" && (
            <Link
              href={CUSTOMER_ROUTES.notifications}
              className="inline-flex items-center gap-1.5 hover:text-brand"
            >
              התראות
              {unreadNotifications > 0 && (
                <span className="inline-flex size-5 items-center justify-center rounded-full bg-alert text-xs font-bold text-white">
                  {unreadNotifications}
                </span>
              )}
            </Link>
          )}
          <Link href={MARKETING_ROUTES.help} className="hover:text-brand">
            עזרה
          </Link>
          <Link href={PRO_ROUTES.landing} className="hover:text-brand">
            לבעלי מקצוע
          </Link>
        </nav>

        <div className="ms-auto flex items-center gap-3">
          {user ? (
            <form action={signOut}>
              <button
                type="submit"
                className="text-sm font-medium text-muted hover:text-ink"
              >
                התנתקות
              </button>
            </form>
          ) : (
            <Link
              href="/login"
              className="text-sm font-medium text-muted hover:text-ink"
            >
              התחברות
            </Link>
          )}

          <Link
            href="/new-request"
            className={`${BUTTON_CTA} px-4 py-2 text-sm`}
          >
            פרסם קריאה
          </Link>
        </div>
      </div>
    </header>
  );
}
