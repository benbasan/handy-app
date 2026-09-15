"use client";

import { useActionState } from "react";
import {
  BUTTON_BASE,
  BUTTON_COMPACT,
  BUTTON_QUIET,
  ErrorText,
} from "@/components/ui/primitives";
import { setSupportTicketStatus } from "@/lib/actions/admin";
import { EMPTY_SUPPORT_TICKET_STATUS_STATE } from "@/lib/actions/state";
import {
  SUPPORT_STATUS_LABEL,
  isSupportStatus,
  type SupportStatus,
} from "@/lib/validation/support";

/** What each status offers next. A ticket is never stuck: closed reopens. */
const NEXT: Record<SupportStatus, SupportStatus[]> = {
  open: ["answered", "closed"],
  answered: ["closed", "open"],
  closed: ["open"],
};

const ACTION_LABEL: Record<SupportStatus, string> = {
  open: "פתח מחדש",
  answered: "סמן כנענתה",
  closed: "סגור",
};

export function SupportTicketStatusForm({
  ticketId,
  status,
}: {
  ticketId: string;
  status: SupportStatus;
}) {
  const [state, formAction, pending] = useActionState(
    setSupportTicketStatus,
    EMPTY_SUPPORT_TICKET_STATUS_STATE,
  );

  const current = isSupportStatus(state.status) ? state.status : status;

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="ticketId" value={ticketId} />
      {NEXT[current].map((next, index) => (
        <button
          key={next}
          type="submit"
          name="status"
          value={next}
          disabled={pending}
          aria-label={`${ACTION_LABEL[next]} — ${SUPPORT_STATUS_LABEL[next]}`}
          className={
            index === 0
              ? `${BUTTON_BASE} ${BUTTON_COMPACT} bg-admin text-white hover:bg-admin-strong focus-visible:ring-admin`
              : `${BUTTON_QUIET} ${BUTTON_COMPACT}`
          }
        >
          {ACTION_LABEL[next]}
        </button>
      ))}
      {state.error && <ErrorText>{state.error}</ErrorText>}
    </form>
  );
}
