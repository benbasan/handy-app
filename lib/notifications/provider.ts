import type { NotificationKind } from "./kinds";

/**
 * The seam.
 *
 * Modelled on `lib/observability.ts`, which exists so that choosing a
 * monitoring vendor is two functions rather than thirty call sites, and on
 * `lib/auth/bypass.ts`, which stands a paid channel down behind a flag without
 * deleting it. Both were written for the same situation this is: a decision
 * about money that has not been taken yet, and must not be pre-empted by the
 * shape of the code.
 *
 * The decision here is an Israeli SMS gateway — roughly a tenth of Twilio's
 * $0.2575 per message to Israel, and CLAUDE.md section 8 keeps it with the
 * user. **When it is taken, the work is one file and one line:** write
 * `providers/sms.ts`, add it to the array in `PROVIDERS`. No migration, no
 * screen, and — because `messages.ts` renders the Hebrew once for every
 * channel — no second copy of the copy.
 */

/** One person, one thing that happened, everything a channel needs to send it. */
export type DeliveryTarget = {
  notificationId: string;
  userId: string;
  kind: NotificationKind;
  title: string;
  body: string;
  href: string;
  /** Web push credentials for this person's devices. Ignored by other channels. */
  subscriptions: readonly PushCredential[];
};

export type PushCredential = {
  endpoint: string;
  p256dh: string;
  auth: string;
};

export type DeliveryResult = {
  sent: number;
  /** Endpoints the push service reported as gone (404/410). */
  deadEndpoints: string[];
};

export type NotificationProvider = {
  channel: "in_app" | "web_push" | "sms";
  /**
   * Whether using this channel spends money.
   *
   * The registry filters on it, which is what makes turning SMS on a flag
   * rather than an edit — and what stops it being turned on by accident by
   * somebody who merely added a file.
   */
  costsMoney: boolean;
  /** False when the credentials are absent; the registry then skips it. */
  isConfigured(): boolean;
  deliver(targets: readonly DeliveryTarget[]): Promise<DeliveryResult>;
};

/** Set only when a paid channel has been deliberately switched on. */
export function paidChannelsEnabled(): boolean {
  return process.env.NOTIFICATIONS_ALLOW_PAID === "1";
}

/**
 * The channels that will actually be used, in the order they are tried.
 *
 * `in_app` is not in here and never will be: the row is already written by the
 * time anything reaches this module, so "delivering" it in-app is a no-op with
 * a name. Keeping it out of the registry keeps the registry honest about what
 * costs a network call.
 */
export async function activeProviders(): Promise<NotificationProvider[]> {
  const { webPushProvider } = await import("./providers/webPush");

  const all: NotificationProvider[] = [webPushProvider];

  return all.filter(
    (provider) =>
      provider.isConfigured() &&
      (!provider.costsMoney || paidChannelsEnabled()),
  );
}
