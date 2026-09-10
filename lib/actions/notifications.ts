"use server";

import { revalidatePath } from "next/cache";
import { logExpectedRefusal, logServerError } from "@/lib/observability";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/supabase/session";
import { pushSubscriptionSchema } from "@/lib/validation/notifications";

export type PushSubscriptionState = { error?: string; ok?: boolean };

/**
 * Register this browser for push.
 *
 * The insert is `save_push_subscription()` rather than a table write, and the
 * reason is the shared-device case: a second account on the same browser
 * claims an endpoint the first one owns, and under RLS it cannot see the row
 * it must replace — so an upsert raises instead of taking ownership. A policy
 * cannot arbitrate a key it cannot see.
 */
export async function savePushSubscription(input: {
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string;
}): Promise<PushSubscriptionState> {
  const user = await getCurrentUser();
  if (!user) return { error: "צריך להיות מחוברים." };

  const parsed = pushSubscriptionSchema.safeParse(input);
  if (!parsed.success) {
    logExpectedRefusal(
      "notifications.savePushSubscription",
      new Error(parsed.error.issues[0]?.message ?? "invalid subscription"),
      {},
    );
    return { error: "לא הצלחנו להפעיל התראות בדפדפן הזה." };
  }

  const supabase = await createClient();

  const { error } = await supabase.rpc("save_push_subscription", {
    p_endpoint: parsed.data.endpoint,
    p_p256dh: parsed.data.p256dh,
    p_auth_key: parsed.data.auth,
    p_user_agent: parsed.data.userAgent,
  });

  if (error) {
    logServerError("notifications.savePushSubscription", error, {});
    return { error: "לא הצלחנו להפעיל התראות בדפדפן הזה." };
  }

  return { ok: true };
}

/**
 * Forget this browser — used both when somebody turns push off and when the
 * page notices the browser has silently dropped its own subscription.
 */
export async function removePushSubscription(
  endpoint: string,
): Promise<PushSubscriptionState> {
  const user = await getCurrentUser();
  if (!user) return { error: "צריך להיות מחוברים." };

  const supabase = await createClient();

  // Scoped by the delete policy to the caller's own rows, so an endpoint
  // somebody else owns is a no-op rather than a refusal.
  const { error } = await supabase
    .from("push_subscriptions")
    .delete()
    .eq("endpoint", endpoint);

  if (error) {
    logServerError("notifications.removePushSubscription", error, {});
    return { error: "לא הצלחנו לכבות את ההתראות." };
  }

  return { ok: true };
}

export type MarkReadState = { error?: string };

/**
 * "סמן הכל כנקרא" — the one button on design/screens/pro-5.4-notifications.png.
 *
 * The timestamp is not sent: a `before update` trigger pins `read_at` to
 * `now()` and refuses a second write, so this cannot un-read anything or
 * backdate the badge.
 */
export async function markAllNotificationsRead(): Promise<MarkReadState> {
  const user = await getCurrentUser();
  if (!user) return { error: "צריך להיות מחוברים." };

  const supabase = await createClient();

  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .is("read_at", null);

  if (error) {
    logServerError("notifications.markAllRead", error, {});
    return { error: "לא הצלחנו לסמן את ההתראות כנקראו." };
  }

  revalidatePath("/pro/notifications");
  revalidatePath("/account/notifications");
  revalidatePath("/pro/dashboard");
  revalidatePath("/account");

  return {};
}
