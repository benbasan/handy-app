import type { ReactNode } from "react";
import { SiteFooter } from "@/components/ui/SiteFooter";
import { SiteHeader } from "@/components/ui/SiteHeader";
import type { CurrentUser } from "@/lib/supabase/session";

/**
 * Header, content column and footer — the frame every screen in
 * design/screens sits inside. The content column is 6xl wide, which is the
 * 1280px viewport the designs were captured at minus the page gutters.
 */
export function AppShell({
  user,
  children,
}: {
  user: CurrentUser | null;
  children: ReactNode;
}) {
  return (
    <>
      <SiteHeader user={user} />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        {children}
      </main>
      <SiteFooter />
    </>
  );
}
