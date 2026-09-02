import Link from "next/link";
import type { ReactNode } from "react";
import { AvailabilityToggle } from "@/components/pro/AvailabilityToggle";
import { ProLogo } from "@/components/pro/ProLogo";
import { BUTTON_PRO } from "@/components/ui/primitives";
import { signOut } from "@/lib/actions/auth";
import { PRO_ROUTES } from "@/lib/routes";
import type { ProProfile } from "@/lib/supabase/pros";

/**
 * The frame every signed-in pro screen sits in — design/screens/pro-*.png:
 * the Handy Pro wordmark on the leading edge, navigation beside it, and the
 * availability switch plus the feed button on the trailing edge.
 *
 * The design's nav also lists העבודות שלי / ארנק / הודעות. Those screens are
 * Phase 5 and Phase 6, and CLAUDE.md's one-phase-at-a-time rule says not to
 * build them early — a link to a 404 is worse than no link, so they are left
 * out rather than stubbed.
 */
export function ProShell({
  profile,
  children,
}: {
  profile: ProProfile | null;
  children: ReactNode;
}) {
  return (
    <>
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-4 sm:px-6">
          <ProLogo href={PRO_ROUTES.dashboard} />

          <nav className="order-3 flex w-full items-center gap-5 text-sm font-medium text-ink sm:order-none sm:w-auto">
            <Link href={PRO_ROUTES.dashboard} className="hover:text-pro">
              דשבורד
            </Link>
            <Link href={PRO_ROUTES.jobs} className="hover:text-pro">
              קריאות
            </Link>
            <Link href={PRO_ROUTES.settings} className="hover:text-pro">
              זמינות והגדרות
            </Link>
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
              className={`${BUTTON_PRO} px-4 py-2 text-sm`}
            >
              פיד קריאות
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        {children}
      </main>

      <footer className="border-t border-line bg-surface">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-6 text-sm text-muted sm:px-6">
          <p>Handy Pro · עמלה של 12% — רק על עבודה שנסגרה.</p>
          <p>עדכון מחיר בשטח מחייב תמונה ואישור של הלקוח.</p>
        </div>
      </footer>
    </>
  );
}
