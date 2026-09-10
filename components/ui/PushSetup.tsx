"use client";

import { useEffect } from "react";
import {
  removePushSubscription,
  savePushSubscription,
} from "@/lib/actions/notifications";

/**
 * Registers the service worker, and keeps the database's idea of this device
 * in step with the browser's.
 *
 * Renders nothing. It sits in both `(authed)` layouts because the thing it
 * reconciles — has the browser silently dropped its subscription? — is only
 * knowable from a page that is actually open.
 *
 * **The reconcile is the point, not the registration.** A push subscription
 * disappears for reasons nobody tells the server about: site data cleared, a
 * browser reinstalled, the permission revoked in settings. The row survives,
 * the dispatcher keeps spending a request on it, and the person quietly stops
 * being reachable — which looks exactly like nothing happening, and is the
 * worst failure mode this feature has.
 */
export function PushSetup() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;

    let cancelled = false;

    void (async () => {
      try {
        const registration = await navigator.serviceWorker.register(
          // Bundled by Next, which also sets Service-Worker-Allowed for it.
          // See node_modules/next/dist/docs/.../progressive-web-apps.md.
          new URL("../../lib/service-worker.js", import.meta.url),
          { scope: "/", updateViaCache: "none" },
        );

        if (cancelled) return;

        const existing = await registration.pushManager.getSubscription();
        if (cancelled) return;

        // Permission revoked in browser settings, or site data cleared: the
        // browser has no subscription, so neither should we.
        if (Notification.permission !== "granted") {
          if (existing) await existing.unsubscribe();
          const endpoint = existing?.endpoint;
          if (endpoint) await removePushSubscription(endpoint);
          return;
        }

        if (!existing) return;

        // Re-asserting a subscription we already have is deliberate: it is
        // also what stamps `last_seen_at`, which is the only liveness signal
        // this design can produce — the dispatch route holds no database
        // credential and can never report that a push landed.
        const json = existing.toJSON();
        if (!json.keys?.p256dh || !json.keys.auth) return;

        await savePushSubscription({
          endpoint: existing.endpoint,
          p256dh: json.keys.p256dh,
          auth: json.keys.auth,
          userAgent: navigator.userAgent,
        });
      } catch {
        // A browser that refuses to register a service worker (a private
        // window, an enterprise policy) is not a broken page. Push is an
        // accelerant; the notification centre is unaffected.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
