import Link from "next/link";
import type { ReactNode } from "react";
import { AvailabilityToggle } from "@/components/pro/AvailabilityToggle";
import { ProLogo } from "@/components/pro/ProLogo";
import { BUTTON_COMPACT, BUTTON_PRO } from "@/components/ui/primitives";
import { MobileNav } from "@/components/ui/MobileNav";
import { NavLink } from "@/components/ui/NavLink";
import { ToastProvider } from "@/components/ui/Toast";
import { signOut } from "@/lib/actions/auth";
import { PRO_ROUTES } from "@/lib/routes";
import type { ProProfile } from "@/lib/supabase/pros";

/**
 * The frame every signed-in pro screen sits in — design/screens/pro-*.png:
 * the Handy Pro wordmark on the leading edge, navigation beside it, and the
 * availability switch plus the feed button on the trailing edge.
 *
 * Each link joined the row when the screen behind it became real — a link to
 * a 404 is worse than no link: הצעות and הודעות in Phase 4, העבודות שלי in
 * Phase 5, ארנק in Phase 6, and הפרופיל שלי plus מרכז העזרה in Phase 8.
 */
export function ProShell({
  profile,
  unreadMessages = 0,
  unreadNotifications = 0,
  children,
}: {
  profile: ProProfile | null;
  /** Total across every thread — the orange badge in design/screens/pro-5.3. */
  unreadMessages?: number;
  /** The same badge on design/screens/pro-5.4, for the notification centre. */
  unreadNotifications?: number;
  children: ReactNode;
}) {
  return (
    <ToastProvider>
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-4 sm:px-6">
          <ProLogo href={PRO_ROUTES.dashboard} />

          {/* Nine links. On a 390px screen this row wrapped to four lines
              before Phase 13.5; below md the tab bar at the foot replaces it. */}
          <nav className="order-3 hidden w-full flex-wrap items-center gap-x-5 gap-y-2 text-sm font-medium md:order-none md:flex md:w-auto">
            <NavLink href={PRO_ROUTES.dashboard} accent="pro">
              דשבורד
            </NavLink>
            <NavLink href={PRO_ROUTES.jobs} accent="pro">
              קריאות
            </NavLink>
            <NavLink href={PRO_ROUTES.offers} accent="pro">
              ההצעות שלי
            </NavLink>
            <NavLink href={PRO_ROUTES.myJobs} accent="pro">
              העבודות שלי
            </NavLink>
            <NavLink href={PRO_ROUTES.wallet} accent="pro">
              ארנק
            </NavLink>
            <span className="inline-flex items-center gap-1.5">
              <NavLink href={PRO_ROUTES.messages} accent="pro">
                הודעות
              </NavLink>
              {unreadMessages > 0 && (
                <span className="ltr-nums inline-flex size-5 items-center justify-center rounded-full bg-alert text-xs font-bold text-white">
                  {unreadMessages}
                </span>
              )}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <NavLink href={PRO_ROUTES.notifications} accent="pro">
                התראות
              </NavLink>
              {unreadNotifications > 0 && (
                <span className="ltr-nums inline-flex size-5 items-center justify-center rounded-full bg-alert text-xs font-bold text-white">
                  {unreadNotifications}
                </span>
              )}
            </span>
            <NavLink href={PRO_ROUTES.profile} accent="pro">
              הפרופיל שלי
            </NavLink>
            <NavLink href={PRO_ROUTES.settings} accent="pro">
              זמינות והגדרות
            </NavLink>
            <NavLink href={PRO_ROUTES.help} accent="pro">
              עזרה
            </NavLink>
          </nav>

          <div className="ms-auto flex flex-wrap items-center gap-3">
            {profile && (
              <AvailabilityToggle accepting={profile.acceptingJobs} />
            )}

            <form action={signOut}>
              <button
                type="submit"
                className="text-sm font-medium text-muted hover:text-ink"
              >
                התנתקות
              </button>
            </form>

            <Link
              href={PRO_ROUTES.jobs}
              className={`${BUTTON_PRO} ${BUTTON_COMPACT}`}
            >
              פיד קריאות
            </Link>
          </div>
        </div>
      </header>

      {/* pb-28 clears the fixed tab bar plus the home indicator; above md the
          bar is gone and the footer sits directly under the content. */}
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-8 pb-28 sm:px-6 sm:pt-10 md:pb-10">
        {children}
      </main>

      <MobileNav
        role="pro"
        unreadMessages={unreadMessages}
        unreadNotifications={unreadNotifications}
      />

      <footer className="border-t border-line bg-surface">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-6 text-sm text-muted sm:px-6">
          <p>Handy Pro · 35 ₪ לעבודה — רק על עבודה שאישרתם.</p>
          <p>עדכון מחיר בשטח מחייב תמונה ואישור של הלקוח.</p>
        </div>
      </footer>
    </ToastProvider>
  );
}
