import { requireRole } from "@/lib/supabase/session";

/** Signed-in pros only. `/pro/login` sits outside this group. */
export default async function ProAuthedLayout({ children }: LayoutProps<"/">) {
  await requireRole("pro");

  return <>{children}</>;
}
