"use client";

import { BellIcon } from "@/components/ui/icons";
import Link from "next/link";
import { useActionState } from "react";
import { markAllNotificationsRead } from "@/lib/actions/notifications";
import {
  BUTTON_QUIET,
  CARD_BASE,
  ErrorText,
  PAGE_TITLE,
  EmptyState,
} from "@/components/ui/primitives";
import { notificationView } from "@/lib/notifications/messages";
import type { NotificationRow } from "@/lib/supabase/notifications";
import type { UserRole } from "@/lib/validation/auth";

/**
 * design/screens/pro-5.4-notifications.png — "התראות".
 *
 * Full-width rows, each with a coloured dot on the leading edge, a bold line,
 * a muted context line, and a quiet "פתח" at the trailing end. One "סמן הכל
 * כנקרא" above them and no delete, which is the design's own answer and also
 * the schema's: `notifications` grants nobody a delete, because a dispute is
 * judged against the record.
 *
 * **One deliberate departure from the mock.** Its fourth card is
 * "העברה בוצעה: 1,860 ₪ — לחשבון המסתיים ב-4417", a payout. Nothing settles
 * `job_fees`; there is no payment run and no code that could produce that row.
 * Drawing it would be the same invention Phase 6 refused for the cancellations
 * counter and Phase 8 refused for "97% אחריות".
 *
 * Shared by both sides. `role` is what sends `message_received` — the one kind
 * both receive — to the right screen.
 */

const DOT: Record<string, string> = {
  brand: "bg-brand",
  pro: "bg-pro",
  alert: "bg-alert",
  cta: "bg-cta",
};

export function NotificationList({
  notifications,
  role,
}: {
  notifications: readonly NotificationRow[];
  role: UserRole;
}) {
  const [state, markAllAction, pending] = useActionState(
    async () => markAllNotificationsRead(),
    {} as Awaited<ReturnType<typeof markAllNotificationsRead>>,
  );

  const unread = notifications.filter((item) => item.readAt === null).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className={PAGE_TITLE}>התראות</h1>

        {unread > 0 && (
          <form action={markAllAction}>
            <button
              type="submit"
              disabled={pending}
              className={`${BUTTON_QUIET} px-4 py-2 text-sm`}
            >
              {pending ? "מסמן…" : "סמן הכל כנקרא"}
            </button>
          </form>
        )}
      </div>

      {state?.error && <ErrorText>{state.error}</ErrorText>}

      {notifications.length === 0 ? (
        <EmptyState
          icon={BellIcon}
          title="אין עדיין התראות"
          body="כל דבר שקורה בקריאות שלכם יופיע כאן — גם כשהדפדפן סגור."
        />
      ) : (
        <ul className="space-y-3">
          {notifications.map((item) => {
            const view = notificationView({
              kind: item.kind,
              jobId: item.jobId,
              payload: item.payload,
              role,
            });

            return (
              <li
                key={item.id}
                className={`${CARD_BASE} flex flex-wrap items-center gap-4 p-5 ${
                  item.readAt === null ? "" : "opacity-70"
                }`}
              >
                <span
                  aria-hidden
                  className={`size-2.5 shrink-0 rounded-full ${
                    DOT[view.tone] ?? "bg-muted"
                  } ${item.readAt === null ? "" : "opacity-40"}`}
                />

                <div className="min-w-56 flex-1">
                  <p className="font-bold text-ink">{view.title}</p>
                  <p className="mt-1 text-sm text-muted">
                    {view.body}
                    {" · "}
                    <time dateTime={item.createdAt} className="ltr-nums">
                      {item.agoLabel}
                    </time>
                  </p>
                </div>

                <Link
                  href={view.href}
                  className={`${BUTTON_QUIET} px-4 py-2 text-sm`}
                >
                  פתח
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
