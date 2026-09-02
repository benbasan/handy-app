import Link from "next/link";
import type { MessageThread } from "@/lib/supabase/messages";
import { initials } from "@/lib/validation/bids";
import { threadStamp } from "@/lib/validation/messages";

/**
 * The conversation list beside the open thread — the trailing column of
 * design/screens/pro-5.3-messages.png, and the same list on the customer's
 * side of the chat.
 *
 * One row per (job, pro): for a pro that is one per call they bid on, for a
 * customer one per offer they received. The row exists as soon as the bid
 * does, which is what lets either side open the conversation before a word has
 * been said — `lastBody` is simply empty until then.
 */
export function ChatThreadList({
  threads,
  activeJobId,
  activeProId,
  hrefFor,
  tone,
}: {
  threads: readonly MessageThread[];
  activeJobId: string | null;
  activeProId: string | null;
  hrefFor: (thread: MessageThread) => string;
  tone: "brand" | "pro";
}) {
  if (threads.length === 0) {
    return (
      <p className="p-6 text-center text-sm text-muted">
        אין עדיין שיחות. שיחה נפתחת ברגע שיש הצעת מחיר על הקריאה.
      </p>
    );
  }

  const activeRing = tone === "pro" ? "border-pro" : "border-brand";

  return (
    <ul className="divide-y divide-line">
      {threads.map((thread) => {
        const active =
          thread.jobId === activeJobId && thread.proId === activeProId;

        return (
          <li key={`${thread.jobId}:${thread.proId}`}>
            <Link
              href={hrefFor(thread)}
              aria-current={active ? "true" : undefined}
              className={`flex items-center gap-3 border-s-4 p-4 transition-colors ${
                active
                  ? `${activeRing} bg-canvas`
                  : "border-transparent hover:bg-canvas"
              }`}
            >
              <span
                aria-hidden
                className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-canvas text-xs font-bold text-muted"
              >
                {initials(thread.counterpartName)}
              </span>

              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="truncate font-bold text-ink">
                    {thread.counterpartName ?? "בעל מקצוע"}
                  </span>
                  {thread.lastAt && (
                    <span className="shrink-0 text-xs text-muted">
                      {threadStamp(thread.lastAt)}
                    </span>
                  )}
                </span>
                <span className="mt-0.5 block truncate text-sm text-muted">
                  {thread.lastBody ?? thread.jobDescription.split("\n")[0]}
                </span>
              </span>

              {thread.unreadCount > 0 && (
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-alert text-xs font-bold text-white">
                  {thread.unreadCount}
                </span>
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
