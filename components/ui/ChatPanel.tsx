"use client";

import { useActionState, useEffect, useRef } from "react";
import { ErrorText, INPUT_CLASS } from "@/components/ui/primitives";
import { RealtimeRefresh } from "@/components/ui/RealtimeRefresh";
import { sendMessage } from "@/lib/actions/messages";
import { EMPTY_SEND_MESSAGE_STATE } from "@/lib/actions/state";
import type { ThreadMessage } from "@/lib/supabase/messages";
import { MESSAGE_MAX, messageTime } from "@/lib/validation/messages";

/**
 * One open conversation — design/screens/pro-5.3-messages.png, and the same
 * component on the customer's side of the same thread.
 *
 * A thread is (job, pro), which is why both ids ride along on every send: the
 * insert policy re-checks that the pro named actually bid on the job, so a
 * customer cannot start a conversation with a stranger and a pro cannot post
 * into somebody else's.
 *
 * `mine` comes from the database (compared against auth.uid() there), not from
 * a sender id compared in the browser — a bubble cannot end up on the wrong
 * side of the thread.
 */
export function ChatPanel({
  jobId,
  proId,
  messages,
  tone,
}: {
  jobId: string;
  proId: string;
  messages: readonly ThreadMessage[];
  /** Blue for the customer's side, indigo for the pro's, as in the designs. */
  tone: "brand" | "pro";
}) {
  const [state, formAction, pending] = useActionState(
    sendMessage,
    EMPTY_SEND_MESSAGE_STATE,
  );

  const formRef = useRef<HTMLFormElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  // Clear the box once the server has actually stored the message, not on
  // submit: a failed send should leave what was typed where it was.
  useEffect(() => {
    if (state.sent) formRef.current?.reset();
  }, [state.sent]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [messages.length]);

  const mineClass =
    tone === "pro" ? "bg-pro text-white" : "bg-brand text-white";

  return (
    <div className="flex h-full flex-col">
      <RealtimeRefresh table="messages" filter={`job_id=eq.${jobId}`} />

      <div className="max-h-[28rem] min-h-40 flex-1 space-y-3 overflow-y-auto p-5">
        {messages.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted">
            אין עדיין הודעות בשיחה הזו. אפשר לפתוח בשאלה — למשל מה בדיוק כלול
            במחיר.
          </p>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.mine ? "justify-start" : "justify-end"}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm sm:max-w-[70%] ${
                  message.mine
                    ? mineClass
                    : "border border-line bg-surface text-ink"
                }`}
              >
                <p className="whitespace-pre-line">{message.body}</p>
                <p
                  /* /85 rather than /70: on the pro's indigo bubble the
                     lighter one measured 3.9:1, under WCAG AA. The timestamp
                     is small text and this is the darkest ground it lands on. */
                  className={`mt-1 text-xs ${
                    message.mine ? "text-white/85" : "text-muted"
                  }`}
                >
                  <span className="ltr-nums">
                    {messageTime(message.createdAt)}
                  </span>
                </p>
              </div>
            </div>
          ))
        )}
        <div ref={endRef} />
      </div>

      <form
        ref={formRef}
        action={formAction}
        className="border-t border-line p-4"
      >
        <input type="hidden" name="jobId" value={jobId} />
        <input type="hidden" name="proId" value={proId} />

        {/* min-w-0 on the growing half: a flex item defaults to min-width:auto,
            which refuses to shrink below the input's intrinsic width and pushes
            the send button off a 390px screen. */}
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <input
              name="body"
              required
              maxLength={MESSAGE_MAX}
              autoComplete="off"
              placeholder="כתוב הודעה"
              aria-label="הודעה חדשה"
              className={INPUT_CLASS}
            />
          </div>
          <button
            type="submit"
            disabled={pending}
            className={`shrink-0 rounded-xl px-5 py-3 font-semibold text-white transition-colors disabled:opacity-60 sm:px-6 ${
              tone === "pro"
                ? "bg-pro hover:bg-pro-strong"
                : "bg-brand hover:bg-brand-strong"
            }`}
          >
            {pending ? "שולח…" : "שלח"}
          </button>
        </div>

        {state.error && (
          <div className="mt-2">
            <ErrorText>{state.error}</ErrorText>
          </div>
        )}
      </form>
    </div>
  );
}
