/**
 * Handy's service worker — push delivery, and nothing else.
 *
 * **Not `public/sw.js`.** In Next 16 the service worker is a bundled asset:
 * registered with `new URL("../lib/service-worker.js", import.meta.url)`, which
 * lets Next compile it and set the `Service-Worker-Allowed` header itself. See
 * node_modules/next/dist/docs/01-app/02-guides/progressive-web-apps.md.
 *
 * There is deliberately no offline caching here. This product is a
 * marketplace: a cached list of offers is a *wrong* list of offers, and every
 * screen that matters is `force-dynamic` because the data behind it changes
 * while you are looking at it. A service worker that served yesterday's bids
 * from a cache would be a bug wearing a feature's clothes.
 */

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    // A push this build cannot parse is a deploy that lags the sender. Better
    // silence than a notification reading "undefined".
    return;
  }

  if (!payload || !payload.title) return;

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "/icon",
      badge: "/icon",
      // Hebrew, on every notification this product sends.
      dir: "rtl",
      lang: "he",
      /*
       * One notification per kind, replaced rather than stacked. A pro whose
       * acceptance window is closing gets one line that updates, not four —
       * and `renotify` is what makes the replacement buzz, which is the whole
       * point of the second one.
       */
      tag: payload.kind || "handy",
      renotify: true,
      data: { href: payload.href || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const href = (event.notification.data && event.notification.data.href) || "/";

  /*
   * Focus a tab that is already here rather than opening a fifth one, and
   * navigate it. Somebody who taps "הלקוח בחר בך" usually has the app open
   * somewhere already — that is how they got the offer.
   */
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((windows) => {
        for (const client of windows) {
          if ("focus" in client && "navigate" in client) {
            return client.focus().then(() => client.navigate(href));
          }
        }
        return self.clients.openWindow(href);
      }),
  );
});

/**
 * The browser is the authority on its own endpoint.
 *
 * Chrome rotates a subscription on its own — a push service outage, a key
 * rotation — and fires this. Without it the row in `push_subscriptions` points
 * at an endpoint that no longer exists and the person silently stops being
 * reachable, which is the worst failure this feature has: it looks exactly
 * like nothing happening.
 */
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      const applicationServerKey =
        event.oldSubscription && event.oldSubscription.options
          ? event.oldSubscription.options.applicationServerKey
          : undefined;

      if (!applicationServerKey) return;

      const fresh = await self.registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey,
      });

      // A plain fetch rather than a server action: there is no React here.
      await fetch("/api/notifications/resubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subscription: fresh.toJSON(),
          oldEndpoint: event.oldSubscription
            ? event.oldSubscription.endpoint
            : null,
        }),
      });
    })(),
  );
});
