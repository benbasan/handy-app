"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/**
 * One link in a shell's desktop navigation row, marked when it is the screen
 * you are on.
 *
 * `AdminShell` has done this since Phase 7 — `aria-current="page"` plus a
 * weight change — and the customer and pro headers did not, so eleven of the
 * app's fourteen signed-in screens gave no indication of where you were. This
 * is that admin pattern, extracted so all three rows share it.
 *
 * `exact` matters more than it looks. `/pro` is the *public* landing page and
 * `/pro/dashboard` the signed-in home, so a prefix match on the former would
 * mark it active on every screen a pro ever sees. The routes come from
 * lib/routes.ts rather than from string literals for the same reason.
 */
export function NavLink({
  href,
  exact = false,
  accent = "brand",
  children,
}: {
  href: string;
  exact?: boolean;
  accent?: "brand" | "pro" | "admin";
  children: ReactNode;
}) {
  const pathname = usePathname();
  const active = exact
    ? pathname === href
    : pathname === href || pathname.startsWith(`${href}/`);

  const hover =
    accent === "pro"
      ? "hover:text-pro"
      : accent === "admin"
        ? "hover:text-ink"
        : "hover:text-brand";

  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={
        active
          ? "font-bold text-ink underline decoration-2 underline-offset-8"
          : `text-muted ${hover}`
      }
    >
      {children}
    </Link>
  );
}
