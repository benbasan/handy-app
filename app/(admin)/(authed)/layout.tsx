import { requireRole } from "@/lib/supabase/session";

/**
 * Signed-in admins only. `/admin/login` sits outside this group.
 *
 * This redirect is the courteous half of the story: the enforcement that
 * matters is RLS, where `is_admin()` gates every admin-wide policy. Phase 7
 * hardens the dashboard on top of both.
 */
export default async function AdminAuthedLayout({
  children,
}: LayoutProps<"/">) {
  await requireRole("admin");

  return <>{children}</>;
}
