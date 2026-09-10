import { ProShell } from "@/components/pro/ProShell";
import { listMyThreads, totalUnread } from "@/lib/supabase/messages";
import { countMyUnreadNotifications } from "@/lib/supabase/notifications";
import { getMyProProfile } from "@/lib/supabase/pros";
import { requireRole } from "@/lib/supabase/session";

/**
 * Signed-in pros only. `/pro/login` and the public landing page at `/pro` both
 * sit outside this group, so the gate cannot lock people out of the door they
 * came in through.
 *
 * The profile is read here for the header's availability switch, and `cache`
 * on `getMyProProfile` means the pages below get it without a second round
 * trip. The unread count is read alongside it for the הודעות badge — one row
 * per (job, pro) thread the caller is a side of, and never more. The
 * notification count beside it is a `count`/`head` under the same RLS — not a
 * definer function, because CLAUDE.md section 3 reserves those for an admin's
 * aggregate and a person's own unread count is a policy picking rows.
 */
export default async function ProAuthedLayout({ children }: LayoutProps<"/">) {
  await requireRole("pro");

  const [profile, threads, unreadNotifications] = await Promise.all([
    getMyProProfile(),
    listMyThreads(),
    countMyUnreadNotifications(),
  ]);

  return (
    <ProShell
      profile={profile}
      unreadMessages={totalUnread(threads)}
      unreadNotifications={unreadNotifications}
    >
      {children}
    </ProShell>
  );
}
