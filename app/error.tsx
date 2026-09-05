"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BUTTON_CTA,
  BUTTON_QUIET,
  PAGE_TITLE,
} from "@/components/ui/primitives";
import {
  ADMIN_ROUTES,
  loginPathFor,
  MARKETING_ROUTES,
  PRO_ROUTES,
  ROLE_HOME,
  ROLE_LOGIN,
} from "@/lib/routes";

/**
 * The error boundary for the whole application.
 *
 * It sits at the root of `app/`, which is deliberate rather than lazy. An
 * `error.tsx` does not wrap the `layout.tsx` beside it — only the segments
 * below — and the layouts most likely to throw in this app are exactly the
 * `(authed)` ones, where `requireRole()` reads `profiles` before a page
 * renders. A boundary inside each area would miss its own gate. This one is
 * above all four groups, so it catches them.
 *
 * Nothing is logged from here. In production Next replaces a server error's
 * message with a generic one before it reaches the browser, so the only thing
 * this component knows that the server did not is nothing at all — the real
 * record is written by `onRequestError` in instrumentation.ts, on the server,
 * with the message intact. What this page contributes is the other half of
 * that pair: it puts the `digest` on the screen, so the string a person reads
 * out to support is the string that finds the log line.
 *
 * The header and footer are not drawn. They are rendered from a session lookup
 * that a Client Component cannot repeat — and on a page that exists because
 * something failed, chrome that depends on a working database is the last
 * thing to insist on.
 */
export default function AppError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  const pathname = usePathname();

  useEffect(() => {
    // Client-side navigation errors never reach the server, so they never
    // reach onRequestError either. This is the only place they exist.
    console.error("[app/error]", error.digest ?? "", error.message);
  }, [error]);

  // Where "back" means depends on which side of the product broke: a pro sent
  // to the customer's account page has hit a second dead end.
  //
  // Asked of `loginPathFor` rather than matched by prefix here, because a
  // prefix gets this wrong in a way that is easy to miss. `/pro/` is two
  // different areas — `/pro/dashboard` is the signed-in pro's, `/pro/dana-levi`
  // is a public profile any customer may read — and `startsWith("/pro")`
  // cannot tell them apart. That distinction already exists, once, in the
  // function proxy.ts uses to decide the same thing.
  const area = loginPathFor(pathname);
  const home =
    area === ROLE_LOGIN.admin
      ? { href: ADMIN_ROUTES.home, label: "ללוח הניהול" }
      : area === ROLE_LOGIN.pro
        ? { href: PRO_ROUTES.dashboard, label: "לאזור בעלי המקצוע" }
        : area === ROLE_LOGIN.customer
          ? { href: ROLE_HOME.customer, label: "לקריאות שלי" }
          : { href: MARKETING_ROUTES.home, label: "לדף הבית" };

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
      <section className="mx-auto max-w-2xl py-16 text-center">
        <p aria-hidden className="text-7xl font-bold text-line sm:text-8xl">
          !
        </p>

        <h1 className={`mt-4 ${PAGE_TITLE}`}>משהו השתבש</h1>

        <p className="mt-4 text-lg text-muted">
          התקלה נרשמה אצלנו ואנחנו נבדוק אותה. לרוב זו תקלה זמנית — כדאי לנסות
          שוב.
        </p>

        <p className="mt-2 text-muted">
          שום דבר שהזנתם לא נמחק. אם ניסיתם לשלוח משהו, בדקו במסך הרלוונטי אם
          הפעולה נקלטה לפני שתנסו שנית.
        </p>

        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <button type="button" onClick={() => retry()} className={BUTTON_CTA}>
            נסו שוב
          </button>
          <Link href={home.href} className={BUTTON_QUIET}>
            {home.label}
          </Link>
          <Link href={MARKETING_ROUTES.contact} className={BUTTON_QUIET}>
            פנייה לתמיכה
          </Link>
        </div>

        {error.digest && (
          /* One fact on the line, as CLAUDE.md section 3 asks of a bidi row:
             a Hebrew label and a Latin value, not a sentence built from both.
             This code is what ties the screen to the server log. */
          <p className="mt-8 text-sm text-muted">
            <span>מספר התקלה: </span>
            <span dir="ltr" className="font-mono font-semibold text-ink">
              {error.digest}
            </span>
          </p>
        )}
      </section>
    </main>
  );
}
