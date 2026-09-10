"use client";

import { useState, useSyncExternalStore } from "react";
import { savePushSubscription } from "@/lib/actions/notifications";
import { BUTTON_QUIET, CARD_BASE } from "@/components/ui/primitives";

/**
 * The ask.
 *
 * **Never on first load, and always behind a real button.** Safari requires a
 * transient activation for `Notification.requestPermission()` and refuses it
 * otherwise; Chrome accepts a cold prompt and buries it. More to the point, a
 * permission dialog that appears before somebody knows what the site is gets
 * denied — and a denial is close to permanent, because undoing it means
 * finding a browser settings page.
 *
 * So it is rendered only where the answer to "why?" is already on screen: for
 * a pro, just after their first offer goes out and just after they submit for
 * approval; for a customer, just after they post a call. Each caller supplies
 * its own sentence.
 *
 * Whether to show it at all is read with `useSyncExternalStore` rather than in
 * an effect. That is not ceremony — `Notification.permission` is exactly the
 * "external system" the hook exists for, it gives a correct server snapshot
 * for free (there is no Notification API there, so: nothing), and it avoids
 * the cascading render an effect-plus-setState would cause. `subscribe` is a
 * no-op because the browser fires no event when permission changes; what
 * changes in *this* component's lifetime is the outcome of the button, and
 * that is ordinary state set from a handler.
 */

const DISMISSED_KEY = "handy:push-ask-dismissed";

type Availability = "unsupported" | "askable" | "already-answered";

function subscribe(): () => void {
  // Nothing to subscribe to: no browser fires an event when notification
  // permission changes. A person who grants it in settings sees the card go
  // on their next navigation, which is soon enough for a card they ignored.
  return () => {};
}

function readAvailability(): Availability {
  if (typeof window === "undefined") return "unsupported";
  if (!("Notification" in window) || !("serviceWorker" in navigator)) {
    return "unsupported";
  }
  if (Notification.permission !== "default") return "already-answered";

  try {
    if (window.localStorage.getItem(DISMISSED_KEY)) return "already-answered";
  } catch {
    // Site data blocked. Asking is the better failure — the card is
    // dismissible either way, it just will not remember.
  }

  return "askable";
}

/** No Notification API on the server, so there is nothing to offer yet. */
function serverAvailability(): Availability {
  return "unsupported";
}

export function PushPermissionCard({ reason }: { reason: string }) {
  const availability = useSyncExternalStore(
    subscribe,
    readAvailability,
    serverAvailability,
  );

  const [outcome, setOutcome] = useState<
    null | "asking" | "granted" | "denied"
  >(null);
  const [dismissed, setDismissed] = useState(false);

  if (outcome === "granted") {
    return (
      <p
        role="status"
        className="rounded-2xl border border-cta bg-cta/10 p-4 text-sm font-semibold text-cta-strong"
      >
        ✓ התראות הופעלו בדפדפן הזה.
      </p>
    );
  }

  if (availability !== "askable" || dismissed) return null;

  async function enable() {
    setOutcome("asking");

    try {
      const permission = await Notification.requestPermission();

      if (permission !== "granted") {
        setOutcome("denied");
        return;
      }

      const registration = await navigator.serviceWorker.ready;

      const subscription = await registration.pushManager.subscribe({
        // Required by every browser: a push may not be silent. This product
        // has no use for one anyway — every kind it sends is something the
        // person asked to know.
        userVisibleOnly: true,
        applicationServerKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
      });

      const json = subscription.toJSON();
      if (!json.keys?.p256dh || !json.keys.auth) {
        setOutcome("denied");
        return;
      }

      const saved = await savePushSubscription({
        endpoint: subscription.endpoint,
        p256dh: json.keys.p256dh,
        auth: json.keys.auth,
        userAgent: navigator.userAgent,
      });

      setOutcome(saved.error ? "denied" : "granted");
    } catch {
      setOutcome("denied");
    }
  }

  function dismiss() {
    try {
      window.localStorage.setItem(DISMISSED_KEY, "1");
    } catch {
      // Nothing to do; the card simply reappears next time.
    }
    setDismissed(true);
  }

  return (
    <div className={`${CARD_BASE} p-5`}>
      <h2 className="text-base font-bold text-ink">
        שנודיע לכם גם כשהדפדפן סגור?
      </h2>
      <p className="mt-1 text-sm text-muted">{reason}</p>

      {outcome === "denied" && (
        <p className="mt-3 text-sm font-semibold text-alert">
          הדפדפן חסם את ההתראות. אפשר לאשר אותן בהגדרות האתר בדפדפן.
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={enable}
          disabled={outcome === "asking"}
          className={`${BUTTON_QUIET} px-4 py-2 text-sm`}
        >
          {outcome === "asking" ? "מפעיל…" : "הפעלת התראות"}
        </button>
        <button
          type="button"
          onClick={dismiss}
          className="text-sm text-muted underline underline-offset-2"
        >
          לא עכשיו
        </button>
      </div>
    </div>
  );
}
