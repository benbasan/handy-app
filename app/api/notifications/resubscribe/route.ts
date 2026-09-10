import { savePushSubscription } from "@/lib/actions/notifications";
import { logExpectedRefusal } from "@/lib/observability";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/supabase/session";

/**
 * Where the service worker re-registers after the browser rotates an endpoint.
 *
 * `pushsubscriptionchange` fires when nobody is looking — a push service
 * outage, a key rotation — and there is no React in a service worker, so this
 * is a route handler rather than a server action. It is the difference between
 * a pro who quietly stops being reachable and one who does not, and that
 * failure is the worst this feature has because it looks exactly like nothing
 * happening.
 *
 * A route handler sits outside the `(authed)` layout, so it does its own
 * check. The check is an ordinary session: a service worker's `fetch` carries
 * same-origin cookies, and if the session has expired in the meantime the
 * reconcile in `PushSetup` picks it up on the next page load.
 */

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return new Response("unauthorised", { status: 401 });

  let body: {
    subscription?: {
      endpoint?: string;
      keys?: { p256dh?: string; auth?: string };
    };
    oldEndpoint?: string | null;
  };

  try {
    body = await request.json();
  } catch {
    return new Response("bad request", { status: 400 });
  }

  const subscription = body.subscription;

  if (
    !subscription?.endpoint ||
    !subscription.keys?.p256dh ||
    !subscription.keys.auth
  ) {
    logExpectedRefusal(
      "notifications.resubscribe",
      new Error("incomplete subscription"),
      {},
    );
    return new Response("bad request", { status: 400 });
  }

  const saved = await savePushSubscription({
    endpoint: subscription.endpoint,
    p256dh: subscription.keys.p256dh,
    auth: subscription.keys.auth,
    userAgent: request.headers.get("user-agent") ?? undefined,
  });

  if (saved.error) return new Response("failed", { status: 500 });

  // The row the browser has just replaced. Deleted rather than left behind:
  // `prune_push_subscriptions()` would only reach it after ninety days, and
  // until then every dispatch would spend a request on an endpoint that is
  // known to be gone.
  if (body.oldEndpoint && body.oldEndpoint !== subscription.endpoint) {
    const supabase = await createClient();
    await supabase
      .from("push_subscriptions")
      .delete()
      .eq("endpoint", body.oldEndpoint);
  }

  return new Response(null, { status: 204 });
}
