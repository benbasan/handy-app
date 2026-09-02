import Link from "next/link";
import { PRO_ROUTES } from "@/lib/routes";

/**
 * "Handy Pro" — the wordmark from every pro screen in design/screens.
 *
 * Same shape as the customer Logo, in the pro side's indigo rather than the
 * customer side's blue, with "Pro" carried in ink. Latin text inside an RTL
 * page, so it declares its own direction instead of leaving the bidi algorithm
 * to guess.
 */
export function ProLogo({ href = PRO_ROUTES.landing }: { href?: string }) {
  return (
    <Link
      href={href}
      dir="ltr"
      className="flex items-center gap-2 text-xl font-bold"
      aria-label="Handy Pro — לאזור בעלי המקצוע"
    >
      <span className="text-pro">Handy</span>
      <span className="text-ink">Pro</span>
      <span
        aria-hidden
        className="flex size-7 items-center justify-center rounded-full bg-pro text-sm font-bold text-white"
      >
        H
      </span>
    </Link>
  );
}
