import Link from "next/link";
import { signOut } from "@/lib/actions/auth";
import { BUTTON_CTA } from "@/components/ui/primitives";
import { Logo } from "@/components/ui/Logo";
import { PRO_ROUTES } from "@/lib/routes";
import type { CurrentUser } from "@/lib/supabase/session";

/**
 * The header from every customer screen in design/screens/: wordmark on the
 * leading edge, navigation beside it, and the green "פרסם קריאה" call to
 * action on the trailing edge.
 *
 * The design's nav also lists איך זה עובד / מחירים / עזרה — the marketing and
 * help pages, which are Phase 8. They are left out rather than stubbed: a link
 * to a 404 is worse than no link, and CLAUDE.md's one-phase-at-a-time rule
 * says not to build them early.
 */
export function SiteHeader({ user }: { user: CurrentUser | null }) {
  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-4 sm:px-6">
        <Logo />

        <nav className="order-3 flex w-full items-center gap-5 text-sm font-medium text-ink sm:order-none sm:w-auto">
          {user?.role === "customer" && (
            <Link href="/account" className="hover:text-brand">
              הקריאות שלי
            </Link>
          )}
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
