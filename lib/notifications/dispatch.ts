import "server-only";
import { logServerError } from "@/lib/observability";
import { isNotificationKind, PUSH_ELIGIBLE_KINDS } from "./kinds";
import { notificationView } from "./messages";
import { activeProviders, type DeliveryTarget } from "./provider";
import type { UserRole } from "@/lib/validation/auth";

/**
 * Turns one batch from the database into whatever the configured channels do
 * with it.
 *
 * Stateless by design: everything it needs arrives in the request body, so
 * this module never queries the database and the route around it holds no
 * credential for one. That is what keeps `SUPABASE_SERVICE_ROLE_KEY` unread
 * anywhere in this repo — the property `lib/actions/demo.ts` argued for in
 * Phase 8, on the grounds that a forging primitive works for every user id
 * there will ever be.
 */

/** One row as `dispatch_pending_pushes()` sends it. */
export type DispatchRow = {
  id: string;
  kind: string;
  job_id: string | null;
  payload: Record<string, unknown> | null;
  user_id: string;
  /** The recipient's role, so `message_received` picks the right screen. */
  role: string;
  endpoint: string;
  p256dh: string;
  auth_key: string;
};

export type DispatchOutcome = {
  sent: number;
  skipped: number;
  deadEndpoints: string[];
};

function asRole(value: string): UserRole {
  return value === "pro" || value === "admin" ? value : "customer";
}

export async function dispatch(
  rows: readonly DispatchRow[],
): Promise<DispatchOutcome> {
  const providers = await activeProviders();
  if (providers.length === 0)
    return { sent: 0, skipped: rows.length, deadEndpoints: [] };

  const targets: DeliveryTarget[] = [];
  let skipped = 0;

  // Grouped by notification, so a person with a phone and a laptop is one
  // message to two devices rather than two messages.
  const byNotification = new Map<string, DispatchRow[]>();

  for (const row of rows) {
    if (!isNotificationKind(row.kind)) {
      // A kind the database allows and this build has never heard of: a
      // deploy that lags a migration. Skipped rather than rendered as
      // "undefined", and worth a line because it means the two halves of the
      // closed vocabulary have drifted.
      logServerError(
        "notifications.dispatch",
        new Error(`unknown notification kind: ${row.kind}`),
        { notificationId: row.id },
      );
      skipped += 1;
      continue;
    }

    if (!PUSH_ELIGIBLE_KINDS.includes(row.kind)) {
      // In the list, not on the lock screen. `job_in_radius` is the volume
      // case this exists for — see the note in kinds.ts.
      skipped += 1;
      continue;
    }

    const existing = byNotification.get(row.id);
    if (existing) existing.push(row);
    else byNotification.set(row.id, [row]);
  }

  for (const [id, group] of byNotification) {
    const first = group[0]!;
    const view = notificationView({
      // Narrowed above; the guard is what makes this safe.
      kind: first.kind as never,
      jobId: first.job_id,
      payload: first.payload ?? {},
      role: asRole(first.role),
    });

    targets.push({
      notificationId: id,
      userId: first.user_id,
      kind: first.kind as never,
      title: view.title,
      body: view.body,
      href: view.href,
      subscriptions: group.map((row) => ({
        endpoint: row.endpoint,
        p256dh: row.p256dh,
        auth: row.auth_key,
      })),
    });
  }

  let sent = 0;
  const deadEndpoints: string[] = [];

  for (const provider of providers) {
    const result = await provider.deliver(targets);
    sent += result.sent;
    deadEndpoints.push(...result.deadEndpoints);
  }

  return { sent, skipped, deadEndpoints: [...new Set(deadEndpoints)] };
}
