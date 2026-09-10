import { NotificationList } from "@/components/ui/NotificationList";
import { RealtimeRefresh } from "@/components/ui/RealtimeRefresh";
import { listMyNotifications } from "@/lib/supabase/notifications";
import { requireRole } from "@/lib/supabase/session";

export const metadata = { title: "התראות — Handy" };

export const dynamic = "force-dynamic";

/**
 * The customer's half of design/screens/pro-5.4-notifications.png.
 *
 * Under `/account` so that `PROTECTED_AREAS` already covers it — the proxy
 * needs no new entry and cannot fall out of step with `lib/routes.ts`.
 */
export default async function CustomerNotificationsPage() {
  await requireRole("customer");
  const notifications = await listMyNotifications();

  return (
    <div className="space-y-4">
      <RealtimeRefresh table="notifications" label="המסך מתעדכן מעצמו" />
      <NotificationList notifications={notifications} role="customer" />
    </div>
  );
}
