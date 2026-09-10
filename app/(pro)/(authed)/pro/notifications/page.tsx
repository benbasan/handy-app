import { NotificationList } from "@/components/ui/NotificationList";
import { RealtimeRefresh } from "@/components/ui/RealtimeRefresh";
import { listMyNotifications } from "@/lib/supabase/notifications";
import { requireRole } from "@/lib/supabase/session";

export const metadata = { title: "התראות — Handy Pro" };

// Notifications arrive from other people's actions, continuously.
export const dynamic = "force-dynamic";

/** design/screens/pro-5.4-notifications.png. */
export default async function ProNotificationsPage() {
  await requireRole("pro");
  const notifications = await listMyNotifications();

  return (
    <div className="space-y-4">
      {/* The badge in the header and this list are the same rows, so an
          arriving notification has to move both without a reload. */}
      <RealtimeRefresh table="notifications" label="המסך מתעדכן מעצמו" />
      <NotificationList notifications={notifications} role="pro" />
    </div>
  );
}
