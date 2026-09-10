import { createClient } from "./server";
import { logServerError } from "@/lib/observability";
import {
  isNotificationKind,
  type NotificationKind,
} from "@/lib/notifications/kinds";

/**
 * The read side, under the caller's own RLS.
 *
 * There is no definer function here on purpose. CLAUDE.md section 3 reserves
 * those for an admin's *aggregate* — "how many jobs were posted today" is not
 * expressible as a policy. A person's own unread count is: it is a policy
 * picking rows, and `notifications: recipient reads own` already picks them.
 */

export type NotificationRow = {
  id: string;
  kind: NotificationKind;
  jobId: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
  readAt: string | null;
};

const COLUMNS = "id, kind, job_id, payload, created_at, read_at";

/**
 * The list, newest first.
 *
 * A row whose kind this build does not recognise is dropped rather than
 * rendered: the database's vocabulary and the TypeScript union are kept in
 * step by a test, so this can only happen while a deploy lags a migration, and
 * for those few minutes a missing row beats one that says "undefined".
 */
export async function listMyNotifications(
  limit = 50,
): Promise<NotificationRow[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("notifications")
    .select(COLUMNS)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    logServerError("notifications.list", error, {});
    return [];
  }

  return (data ?? [])
    .filter((row) => isNotificationKind(row.kind))
    .map((row) => ({
      id: row.id,
      kind: row.kind as NotificationKind,
      jobId: row.job_id,
      payload: (row.payload ?? {}) as Record<string, unknown>,
      createdAt: row.created_at,
      readAt: row.read_at,
    }));
}

/**
 * The number on the header badge.
 *
 * `head: true` so Postgres counts without returning rows — this runs on every
 * signed-in page render, in the layout, beside the unread-message count.
 */
export async function countMyUnreadNotifications(): Promise<number> {
  const supabase = await createClient();

  const { count, error } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .is("read_at", null);

  if (error) {
    // A badge is not worth failing a page render over.
    logServerError("notifications.unreadCount", error, {});
    return 0;
  }

  return count ?? 0;
}
