"use client";

import { useState, type ReactNode } from "react";

/**
 * The dark pill at the bottom of both tracking screens — "צ׳אט עם דוד" with an
 * unread badge (design/screens/customer-3.1-tracking-chat.png) and "צ׳אט עם
 * רונית" (pro-3.1-manage-job-price-update.png).
 *
 * It expands the conversation in place rather than linking away. On these two
 * screens the chat is a side channel to something the person is watching — a
 * pin moving, a price waiting for an answer — and navigating away from that to
 * ask "מה זה בדיוק?" loses the thing the question is about.
 *
 * The thread itself is the same `ChatPanel` the standalone screens use, passed
 * in as a child so this component stays a piece of chrome and knows nothing
 * about messages.
 *
 * `hidden` rather than unmounting: the panel keeps its scroll position and its
 * half-typed message when it is closed and reopened.
 */
export function ChatDock({
  title,
  unreadCount,
  tone,
  children,
}: {
  title: string;
  unreadCount: number;
  /** Blue for the customer's side, indigo for the pro's, as in the designs. */
  tone: "brand" | "pro";
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    /* A logical inset, never a physical one: in Hebrew the dock belongs on
       the leading edge, which is where both designs put it (CLAUDE.md
       section 3). */
    <div className="fixed start-4 bottom-4 z-40 w-[min(24rem,calc(100vw-2rem))]">
      <div
        hidden={!open}
        className="mb-3 overflow-hidden rounded-2xl border border-line bg-surface shadow-xl"
      >
        {children}
      </div>

      <button
        type="button"
        onClick={() => setOpen((wasOpen) => !wasOpen)}
        aria-expanded={open}
        className="inline-flex items-center gap-2 rounded-full bg-ink px-5 py-3 text-sm font-bold text-white shadow-lg transition-transform hover:scale-[1.02]"
      >
        {unreadCount > 0 && (
          <span className="inline-flex size-5 items-center justify-center rounded-full bg-alert text-xs font-bold text-white">
            {unreadCount}
          </span>
        )}
        <span
          aria-hidden
          className={`inline-block size-2 rounded-full ${
            tone === "pro" ? "bg-pro" : "bg-cta"
          }`}
        />
        {open ? "סגירת הצ׳אט" : title}
      </button>
    </div>
  );
}
