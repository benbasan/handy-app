import type { ReactNode } from "react";
import { Logo } from "@/components/ui/Logo";

/**
 * The split sign-in screen from design/screens/customer-1.2-login-otp.png and
 * pro-1.2-login.png: the form on the leading edge, a dark panel of value
 * propositions on the trailing one.
 *
 * The dark panel is decoration, so it is hidden below `lg` rather than stacked
 * — on a phone it would push the form, the only thing anyone came here for,
 * below the fold.
 */
export function AuthSplitLayout({
  headline,
  points,
  children,
}: {
  headline: string;
  points: readonly string[];
  children: ReactNode;
}) {
  return (
    <div className="grid min-h-svh lg:grid-cols-2">
      <main className="flex flex-col justify-center bg-surface p-6 sm:p-12">
        <div className="mx-auto w-full max-w-sm">
          <Logo />
          <div className="mt-8">{children}</div>
        </div>
      </main>

      <aside className="hidden flex-col justify-center bg-ink p-12 text-white lg:flex">
        <h2 className="text-3xl leading-snug font-bold">{headline}</h2>
        <ul className="mt-8 space-y-4">
          {points.map((point) => (
            <li key={point} className="flex items-start gap-3 text-white/85">
              <span
                aria-hidden
                className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-cta text-sm font-bold text-white"
              >
                ✓
              </span>
              {point}
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}
