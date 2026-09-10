"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";
import { CheckIcon, CloseIcon } from "@/components/ui/icons";

/**
 * The one place the app can say "that worked" without navigating.
 *
 * Most confirmations in this product are already visible without help: a bid is
 * chosen and the whole screen changes, a job is published and the router moves.
 * This is for the rest — a press that changes a row and leaves the screen
 * looking almost the same. Before Phase 13.5 there were several, and they were
 * silent: "לא מתאים לי" removed a card from the feed with no acknowledgement at
 * all, which is indistinguishable from a card that vanished on its own.
 *
 * Deliberately small:
 *
 *  * **It never carries an error.** A refused write has a sentence the product
 *    wrote for it and a place on the form to put it — `ErrorText`, beside the
 *    control that failed. A toast that disappears after five seconds is the
 *    wrong home for something somebody has to act on, and routing failures here
 *    would quietly bury them.
 *  * **`aria-live="polite"`, and the region exists before it has children.** A
 *    live region has to be in the DOM at first paint or the first message into
 *    it is not announced — mounting the region and the message together is the
 *    classic way to ship a toast no screen reader ever reads.
 *  * **It sits above the mobile tab bar.** `bottom-20 md:bottom-4` clears the
 *    56px bar from PR ב׳, and the safe-area inset clears the home indicator.
 */

type Toast = { id: number; message: string };

const ToastContext = createContext<((message: string) => void) | null>(null);

/** How long a message stays. Long enough to read a Hebrew sentence twice. */
const DISMISS_AFTER_MS = 5000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<readonly Toast[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const show = useCallback(
    (message: string) => {
      // `Date.now()` collides when two land in the same millisecond, which is
      // exactly what a double-tap produces; the random suffix is what keeps the
      // React key unique.
      const id = Date.now() + Math.random();
      setToasts((current) => [...current, { id, message }]);
      window.setTimeout(() => dismiss(id), DISMISS_AFTER_MS);
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={show}>
      {children}

      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex flex-col items-center gap-2 px-4 pb-[env(safe-area-inset-bottom)] md:bottom-4"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className="pointer-events-auto flex max-w-md animate-enter items-center gap-3 rounded-xl bg-ink px-4 py-3 text-sm font-semibold text-white shadow-overlay"
          >
            <CheckIcon className="size-5 shrink-0 text-cta-bright" />
            <span className="text-start">{toast.message}</span>
            <button
              type="button"
              onClick={() => dismiss(toast.id)}
              className="ms-auto shrink-0 rounded-lg p-1 text-white/70 hover:bg-white/10 hover:text-white"
            >
              <span className="sr-only">סגירת ההודעה</span>
              <CloseIcon className="size-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/**
 * Show a confirmation. Throws outside the provider rather than no-opping: a
 * toast that silently does nothing is the same bug this module exists to fix.
 */
export function useToast(): (message: string) => void {
  const show = useContext(ToastContext);
  if (!show) {
    throw new Error("useToast must be used inside <ToastProvider>");
  }
  return show;
}
