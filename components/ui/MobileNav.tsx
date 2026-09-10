"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  BellIcon,
  ChevronEndIcon,
  ClipboardIcon,
  ClockIcon,
  CloseIcon,
  MapPinIcon,
  MenuIcon,
  MessageIcon,
  UserIcon,
  WalletIcon,
  type IconComponent,
} from "@/components/ui/icons";
import { ADMIN_ROUTES, MARKETING_ROUTES, PRO_ROUTES } from "@/lib/routes";

/**
 * The navigation a phone gets.
 *
 * Before Phase 13.5 there was none: the repo contained zero `md:hidden`-family
 * utilities, and all three shells drew their links as one `flex-wrap` row. On
 * a 390px screen the pro's row — nine links, an availability switch, a sign-out
 * and a button — wrapped to four lines and pushed the feed most of a screen
 * down, on the device a pro actually uses standing in somebody's kitchen. There
 * was also no active-route marking anywhere except the admin console, so no
 * screen said which one it was.
 *
 * Four destinations plus "עוד", because five is the most a thumb can hit
 * across a 390px bar at 44px each and the sheet is a better home for the tail
 * than a scrolling bar is. Which four is a product judgement per side, written
 * out below rather than sliced off the front of the desktop list: the pro's
 * desktop row opens with דשבורד, and the thing they open the app *for* is the
 * feed.
 *
 * The bar is `md:hidden`; above that breakpoint the existing header row is
 * unchanged.
 */

export type NavRole = "customer" | "pro" | "admin";

type Item = {
  href: string;
  label: string;
  icon: IconComponent;
  /**
   * Mark active only on an exact match. For a section that owns its subtree —
   * the feed owns `/pro/jobs/<id>` — the prefix match is what is wanted, but
   * `/pro` is the public landing page and a prefix match there would light up
   * on every single pro screen.
   */
  exact?: boolean;
  badge?: number;
};

function itemsFor(
  role: NavRole,
  badges: { messages: number; notifications: number },
): { primary: Item[]; more: Item[] } {
  if (role === "pro") {
    return {
      primary: [
        { href: PRO_ROUTES.jobs, label: "קריאות", icon: MapPinIcon },
        { href: PRO_ROUTES.offers, label: "ההצעות שלי", icon: ClockIcon },
        { href: PRO_ROUTES.myJobs, label: "העבודות שלי", icon: ClipboardIcon },
        {
          href: PRO_ROUTES.messages,
          label: "הודעות",
          icon: MessageIcon,
          badge: badges.messages,
        },
      ],
      more: [
        { href: PRO_ROUTES.dashboard, label: "דשבורד", icon: UserIcon },
        { href: PRO_ROUTES.wallet, label: "ארנק", icon: WalletIcon },
        {
          href: PRO_ROUTES.notifications,
          label: "התראות",
          icon: BellIcon,
          badge: badges.notifications,
        },
        { href: PRO_ROUTES.profile, label: "הפרופיל שלי", icon: UserIcon },
        { href: PRO_ROUTES.settings, label: "זמינות והגדרות", icon: ClockIcon },
        { href: PRO_ROUTES.help, label: "עזרה", icon: MessageIcon },
      ],
    };
  }

  if (role === "admin") {
    return {
      primary: [
        {
          href: ADMIN_ROUTES.home,
          label: "סקירה",
          icon: ClipboardIcon,
          exact: true,
        },
        { href: ADMIN_ROUTES.pros, label: "בעלי מקצוע", icon: UserIcon },
        { href: ADMIN_ROUTES.jobs, label: "קריאות", icon: MapPinIcon },
        { href: ADMIN_ROUTES.disputes, label: "מחלוקות", icon: MessageIcon },
      ],
      more: [],
    };
  }

  return {
    primary: [
      { href: "/account", label: "הקריאות שלי", icon: ClipboardIcon },
      { href: "/new-request", label: "פרסם קריאה", icon: MapPinIcon },
      {
        href: "/account/notifications",
        label: "התראות",
        icon: BellIcon,
        exact: true,
        badge: badges.notifications,
      },
    ],
    more: [
      {
        href: MARKETING_ROUTES.howItWorks,
        label: "איך זה עובד",
        icon: MessageIcon,
      },
      { href: MARKETING_ROUTES.pricing, label: "מחירים", icon: WalletIcon },
      { href: MARKETING_ROUTES.help, label: "עזרה", icon: MessageIcon },
      {
        href: PRO_ROUTES.landing,
        label: "לבעלי מקצוע",
        icon: UserIcon,
        exact: true,
      },
    ],
  };
}

const ACCENT: Record<NavRole, string> = {
  customer: "text-brand",
  pro: "text-pro",
  admin: "text-admin",
};

function isActive(pathname: string, item: Item): boolean {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export function MobileNav({
  role,
  unreadMessages = 0,
  unreadNotifications = 0,
}: {
  role: NavRole;
  unreadMessages?: number;
  unreadNotifications?: number;
}) {
  const pathname = usePathname();

  /*
   * The sheet remembers *where* it was opened rather than whether it is open,
   * so a route change closes it by making the two disagree.
   *
   * The obvious version — a boolean plus `useEffect(() => setOpen(false),
   * [pathname])` — is what `react-hooks/set-state-in-effect` refuses, and it is
   * right to: the tap that navigates is a link inside the sheet, Next keeps
   * this component mounted across the transition, and the effect version
   * renders the new screen once with the sheet still over it before closing it.
   */
  const [openedAt, setOpenedAt] = useState<string | null>(null);
  const sheetOpen = openedAt === pathname;

  const { primary, more } = itemsFor(role, {
    messages: unreadMessages,
    notifications: unreadNotifications,
  });

  const accent = ACCENT[role];
  const moreActive = more.some((item) => isActive(pathname, item));

  return (
    <>
      {sheetOpen && more.length > 0 && (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            type="button"
            aria-label="סגירת התפריט"
            onClick={() => setOpenedAt(null)}
            className="absolute inset-0 bg-ink/40"
          />

          <div className="absolute inset-x-0 bottom-0 rounded-t-2xl bg-surface pb-[calc(4.5rem+env(safe-area-inset-bottom))] shadow-overlay">
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <p className="font-bold text-ink">עוד</p>
              <button
                type="button"
                onClick={() => setOpenedAt(null)}
                className="rounded-lg p-2 text-muted hover:bg-canvas hover:text-ink"
              >
                <span className="sr-only">סגירה</span>
                <CloseIcon className="size-5" />
              </button>
            </div>

            <ul className="p-2">
              {more.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={isActive(pathname, item) ? "page" : undefined}
                    className={`flex min-h-12 items-center gap-3 rounded-xl px-3 text-base font-semibold ${
                      isActive(pathname, item)
                        ? `bg-canvas ${accent}`
                        : "text-ink"
                    }`}
                  >
                    <item.icon className="size-5 shrink-0" />
                    {item.label}
                    {item.badge ? (
                      <span className="ltr-nums inline-flex size-5 items-center justify-center rounded-full bg-alert text-xs font-bold text-white">
                        {item.badge}
                      </span>
                    ) : null}
                    <ChevronEndIcon className="ms-auto size-4 text-muted" />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <nav
        aria-label="ניווט ראשי"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        <ul className="flex items-stretch">
          {primary.map((item) => {
            const active = isActive(pathname, item);
            return (
              <li key={item.href} className="flex-1">
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`flex min-h-14 flex-col items-center justify-center gap-1 px-1 py-2 text-[11px] font-semibold ${
                    active ? accent : "text-muted"
                  }`}
                >
                  <span className="relative">
                    <item.icon className="size-6" />
                    {item.badge ? (
                      <span className="ltr-nums absolute -end-2 -top-1.5 inline-flex size-4 items-center justify-center rounded-full bg-alert text-[10px] font-bold text-white">
                        {item.badge}
                      </span>
                    ) : null}
                  </span>
                  {item.label}
                </Link>
              </li>
            );
          })}

          {more.length > 0 && (
            <li className="flex-1">
              <button
                type="button"
                onClick={() => setOpenedAt(sheetOpen ? null : pathname)}
                aria-expanded={sheetOpen}
                className={`flex min-h-14 w-full flex-col items-center justify-center gap-1 px-1 py-2 text-[11px] font-semibold ${
                  moreActive || sheetOpen ? accent : "text-muted"
                }`}
              >
                <MenuIcon className="size-6" />
                עוד
              </button>
            </li>
          )}
        </ul>
      </nav>
    </>
  );
}
