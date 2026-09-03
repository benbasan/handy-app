import Link from "next/link";
import type { ReactNode } from "react";
import { AdminLogo } from "@/components/admin/AdminLogo";
import { BUTTON_BASE } from "@/components/ui/primitives";
import { signOut } from "@/lib/actions/auth";
import { ADMIN_ROUTES } from "@/lib/routes";

/**
 * The frame every admin screen sits in — the header across all four
 * design/screens/admin-*.png: the wordmark on the leading edge, the four
 * sections beside it, and "צוות Handy" plus the amber יצוא דוח button on the
 * trailing edge.
 *
 * The export button is a real link to /api/admin/report rather than a shape:
 * a control that does nothing is worse on an operations console than no
 * control at all, because somebody eventually presses it during an incident.
 */
const NAV = [
  { href: ADMIN_ROUTES.home, label: "סקירה" },
  { href: ADMIN_ROUTES.pros, label: "בעלי מקצוע" },
  { href: ADMIN_ROUTES.jobs, label: "קריאות" },
  { href: ADMIN_ROUTES.disputes, label: "מחלוקות" },
] as const;

export function AdminShell({
  current,
  children,
}: {
  /** Which of the four sections is open, so the header can mark it. */
  current: (typeof NAV)[number]["href"];
  children: ReactNode;
}) {
  return (
    <>
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-4 sm:px-6">
          <AdminLogo />

          <nav
            aria-label="ניווט ניהול"
            className="order-3 flex w-full items-center gap-5 text-sm font-medium text-muted sm:order-none sm:w-auto"
          >
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={item.href === current ? "page" : undefined}
                className={
                  item.href === current
                    ? "font-bold text-ink"
                    : "hover:text-ink"
                }
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="ms-auto flex flex-wrap items-center gap-3">
            <span className="text-sm font-semibold text-ink">צוות Handy</span>

            <form action={signOut}>
              <button
                type="submit"
                className="text-sm font-medium text-muted hover:text-ink"
              >
                התנתקות
              </button>
            </form>

            <a
              href={ADMIN_ROUTES.report}
              className={`${BUTTON_BASE} bg-admin px-4 py-2 text-sm text-white hover:bg-admin-strong`}
            >
              יצוא דוח
            </a>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        {children}
      </main>

      <footer className="border-t border-line bg-surface">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-6 text-sm text-muted sm:px-6">
          <p>
            Handy Admin · אזור פנימי. כל פעולה כאן נרשמת על שם המשתמש שביצע
            אותה.
          </p>
          <p>כל מחלוקת נבדקת מול תיעוד הקריאה המלא.</p>
        </div>
      </footer>
    </>
  );
}
