"use client";

import { useState, useSyncExternalStore } from "react";
import {
  BUTTON_COMPACT,
  BUTTON_QUIET,
  CARD_BASE,
} from "@/components/ui/primitives";

/**
 * "הוספה למסך הבית" (Phase 18).
 *
 * `PushPermissionCard` has a hole exactly where most Israeli phones are: Safari
 * on an iPhone exposes no Notification API in an ordinary tab, so the card
 * renders nothing and the person is never told why nothing will ever arrive.
 * A push reaches an iPhone only from a site installed to the home screen. This
 * card is what sits in that hole — it says so, and how.
 *
 * Three answers, read with `useSyncExternalStore` for the same reason the
 * permission card is: the platform is an external fact, and the server has no
 * opinion about it.
 *
 *   * `ios` — an iPhone or iPad, not already opened from the home screen.
 *     Instructions, because iOS offers no programmatic install.
 *   * `prompt` — a browser that fired `beforeinstallprompt` (Chrome on
 *     Android). One button that opens the browser's own dialog.
 *   * `none` — everything else, including a site already installed. Nothing.
 *
 * Dismissal is remembered per device in `localStorage`, and a failure to
 * remember only means the card comes back — it is always dismissible.
 */

const DISMISSED_KEY = "handy:install-ask-dismissed";

type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type Availability = "ios" | "prompt" | "none";

/*
 * The event fires once, early, and often before this component mounts — so it
 * is caught at module scope, the first time any page that uses the card loads
 * this module in a browser.
 */
let deferred: InstallEvent | null = null;
const listeners = new Set<() => void>();

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    // Keep Chrome's own mini-infobar from appearing on a screen that did not
    // ask; the card offers the same dialog at a moment that explains it.
    event.preventDefault();
    deferred = event as InstallEvent;
    listeners.forEach((notify) => notify());
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    listeners.forEach((notify) => notify());
  });
}

function subscribe(notify: () => void): () => void {
  listeners.add(notify);
  return () => listeners.delete(notify);
}

function isStandalone(): boolean {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches === true ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIos(): boolean {
  const ua = navigator.userAgent;
  // iPadOS reports itself as a Mac; a Mac has no touch points.
  return (
    /iPhone|iPad|iPod/.test(ua) ||
    (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
  );
}

function readAvailability(): Availability {
  if (typeof window === "undefined" || isStandalone()) return "none";

  try {
    if (window.localStorage.getItem(DISMISSED_KEY)) return "none";
  } catch {
    // Site data blocked: offer it anyway, the card is dismissible.
  }

  if (isIos()) return "ios";
  return deferred ? "prompt" : "none";
}

function serverAvailability(): Availability {
  return "none";
}

export function InstallPrompt({ reason }: { reason: string }) {
  const availability = useSyncExternalStore(
    subscribe,
    readAvailability,
    serverAvailability,
  );
  const [dismissed, setDismissed] = useState(false);

  if (availability === "none" || dismissed) return null;

  function dismiss() {
    try {
      window.localStorage.setItem(DISMISSED_KEY, "1");
    } catch {
      // Nothing to do; the card simply reappears next time.
    }
    setDismissed(true);
  }

  async function install() {
    const event = deferred;
    if (!event) return;
    deferred = null;
    await event.prompt();
    const { outcome } = await event.userChoice;
    if (outcome === "accepted") setDismissed(true);
    listeners.forEach((notify) => notify());
  }

  return (
    <section
      aria-labelledby="install-prompt-title"
      className={`${CARD_BASE} p-5`}
    >
      <h2 id="install-prompt-title" className="text-base font-bold text-ink">
        הוסיפו את Handy למסך הבית
      </h2>
      <p className="mt-1 text-sm text-muted">{reason}</p>

      {availability === "ios" ? (
        <ol className="mt-3 list-inside list-decimal space-y-1 text-sm text-ink">
          <li>לחצו על כפתור השיתוף בתחתית Safari.</li>
          <li>בחרו ״הוספה למסך הבית״.</li>
          <li>פתחו את Handy מהאייקון החדש, והפעילו התראות.</li>
        </ol>
      ) : null}

      <p className="mt-3 text-xs text-muted">
        {availability === "ios"
          ? "באייפון, התראות מגיעות רק מאתר שנוסף למסך הבית."
          : "האתר ייפתח כמו אפליקציה, בלי שורת כתובת."}
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        {availability === "prompt" && (
          <button
            type="button"
            onClick={install}
            className={`${BUTTON_QUIET} ${BUTTON_COMPACT}`}
          >
            הוספה למסך הבית
          </button>
        )}
        <button
          type="button"
          onClick={dismiss}
          className="min-h-11 text-sm text-muted underline underline-offset-2"
        >
          לא עכשיו
        </button>
      </div>
    </section>
  );
}
