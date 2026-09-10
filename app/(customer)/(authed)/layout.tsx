import { AppShell } from "@/components/ui/AppShell";
import { countMyUnreadNotifications } from "@/lib/supabase/notifications";
import { requireRole } from "@/lib/supabase/session";

/**
 * Everything under this nested group requires a signed-in customer. The login
 * page sits outside it, in `app/(customer)/login`, so the gate cannot lock
 * people out of the door they came in through.
 *
 * The unread count is read here rather than in each page: it feeds the header
 * badge, which is on every one of them. A `count`/`head` under the caller's own
 * RLS, so it costs a count and returns no rows.
 */
export default async function CustomerAuthedLayout({
  children,
}: LayoutProps<"/">) {
  const user = await requireRole("customer");
  const unreadNotifications = await countMyUnreadNotifications();

  return (
    <AppShell user={user} unreadNotifications={unreadNotifications}>
      {children}
    </AppShell>
  );
}
