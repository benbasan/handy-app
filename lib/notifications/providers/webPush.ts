import "server-only";
import webpush from "web-push";
import { logServerError } from "@/lib/observability";
import type {
  DeliveryResult,
  DeliveryTarget,
  NotificationProvider,
} from "../provider";

/**
 * Browser push, over VAPID.
 *
 * The free channel, and the reason this phase could be built without a
 * decision about money. What it does not reach is stated rather than hidden:
 * anybody who declined the permission prompt, and iOS, which delivers push
 * only to a site installed on the home screen. Those are exactly the gap an
 * SMS provider would fill — see `../provider.ts`.
 */

function keys() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  // The spec requires a contact for the push service to reach if this sender
  // misbehaves. A mailto:, not a URL — some services reject the latter.
  const subject = process.env.VAPID_SUBJECT;

  if (!publicKey || !privateKey || !subject) return null;
  return { publicKey, privateKey, subject };
}

export const webPushProvider: NotificationProvider = {
  channel: "web_push",
  costsMoney: false,

  isConfigured: () => keys() !== null,

  async deliver(targets: readonly DeliveryTarget[]): Promise<DeliveryResult> {
    const vapid = keys();
    if (!vapid) return { sent: 0, deadEndpoints: [] };

    webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);

    const deadEndpoints: string[] = [];
    let sent = 0;

    // One message per device, in parallel: a slow push service must not hold
    // up a batch, and one dead endpoint must not sink the others.
    await Promise.all(
      targets.flatMap((target) =>
        target.subscriptions.map(async (subscription) => {
          try {
            await webpush.sendNotification(
              {
                endpoint: subscription.endpoint,
                keys: { p256dh: subscription.p256dh, auth: subscription.auth },
              },
              JSON.stringify({
                title: target.title,
                body: target.body,
                href: target.href,
                kind: target.kind,
              }),
            );
            sent += 1;
          } catch (error) {
            const status = (error as { statusCode?: number }).statusCode;

            // 404/410 is the push service saying this endpoint is gone — a
            // browser reinstalled, site data cleared, a device wiped. Not a
            // failure to log, a row to delete.
            if (status === 404 || status === 410) {
              deadEndpoints.push(subscription.endpoint);
              return;
            }

            // Identifiers only. An endpoint URL is a capability to reach
            // somebody's handset and does not belong in a log line.
            logServerError("notifications.webPush", error, {
              notificationId: target.notificationId,
              kind: target.kind,
              status: status ?? null,
            });
          }
        }),
      ),
    );

    return { sent, deadEndpoints };
  },
};
