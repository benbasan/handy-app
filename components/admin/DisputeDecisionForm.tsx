"use client";

import { useActionState, useState } from "react";
import {
  BUTTON_BASE,
  ErrorText,
  INPUT_CLASS,
} from "@/components/ui/primitives";
import { resolveDispute } from "@/lib/actions/admin";
import { EMPTY_RESOLVE_DISPUTE_STATE } from "@/lib/actions/state";
import {
  DISPUTE_DECISIONS,
  DISPUTE_DECISION_LABEL,
  DISPUTE_NOTE_MAX,
  DISPUTE_STATUS_LABEL,
  type DisputeDecision,
  type DisputeStatus,
} from "@/lib/validation/disputes";

/**
 * "הכרעה וזיכוי" — design/screens/admin-7.4-disputes-control.png.
 *
 * The credit field only exists beside "קבל את התלונה", because that is the
 * only decision it can belong to. The schema refuses the other combination and
 * so does `resolve_dispute()` in the database; hiding the field is the third
 * copy of that rule, and the only one that stops an operator typing a number
 * they cannot use.
 *
 * A decided case shows what was decided instead of a form. Nothing in the
 * database can move it again — the function refuses a second decision — so a
 * form here would be a control that only ever produces an error.
 */
export function DisputeDecisionForm({
  disputeId,
  status,
  creditAmount,
  resolutionNote,
}: {
  disputeId: string;
  status: DisputeStatus;
  creditAmount: number | null;
  resolutionNote: string | null;
}) {
  const [state, formAction, pending] = useActionState(
    resolveDispute,
    EMPTY_RESOLVE_DISPUTE_STATE,
  );
  const [decision, setDecision] = useState<DisputeDecision>("resolved");

  const settled =
    state.decision === "resolved" ||
    state.decision === "rejected" ||
    status === "resolved" ||
    status === "rejected";

  if (settled && !state.error) {
    return (
      <div className="rounded-xl bg-canvas p-4 text-sm">
        <p className="font-bold text-ink">
          {DISPUTE_STATUS_LABEL[(state.decision as DisputeStatus) ?? status]}
        </p>
        {creditAmount !== null && (
          <p className="mt-1 text-muted">
            זיכוי ללקוח: <span className="ltr-nums">{creditAmount}</span> ₪
          </p>
        )}
        {resolutionNote && <p className="mt-1 text-muted">{resolutionNote}</p>}
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="disputeId" value={disputeId} />

      <fieldset>
        <legend className="mb-2 text-sm font-semibold text-ink">הכרעה</legend>
        <div className="flex flex-wrap gap-2">
          {DISPUTE_DECISIONS.map((candidate) => (
            <label
              key={candidate}
              className={`cursor-pointer rounded-xl border px-4 py-2 text-sm font-semibold transition-colors ${
                decision === candidate
                  ? "border-ink bg-ink text-white"
                  : "border-line bg-surface text-ink hover:bg-canvas"
              }`}
            >
              <input
                type="radio"
                name="decision"
                value={candidate}
                checked={decision === candidate}
                onChange={() => setDecision(candidate)}
                className="sr-only"
              />
              {DISPUTE_DECISION_LABEL[candidate]}
            </label>
          ))}
        </div>
      </fieldset>

      {decision === "resolved" && (
        <div>
          <label
            htmlFor={`credit-${disputeId}`}
            className="mb-1 block text-sm font-semibold text-ink"
          >
            זיכוי ללקוח (₪) — אפשר להשאיר ריק
          </label>
          <input
            id={`credit-${disputeId}`}
            name="creditAmount"
            type="number"
            min={0}
            step="0.01"
            inputMode="decimal"
            className={INPUT_CLASS}
          />
          {state.fieldErrors?.creditAmount && (
            <p className="mt-1 text-sm text-danger">
              {state.fieldErrors.creditAmount}
            </p>
          )}
        </div>
      )}

      <div>
        <label
          htmlFor={`note-${disputeId}`}
          className="mb-1 block text-sm font-semibold text-ink"
        >
          הנמקה — מה נבדק בתיעוד הקריאה
        </label>
        <textarea
          id={`note-${disputeId}`}
          name="note"
          rows={3}
          maxLength={DISPUTE_NOTE_MAX}
          className={INPUT_CLASS}
          placeholder="למשל: התמונה שצורפה לעדכון המחיר אינה מהכתובת של הקריאה."
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className={`${BUTTON_BASE} bg-ink px-5 py-2.5 text-sm text-white hover:bg-ink/90`}
        >
          שמור הכרעה
        </button>

        {state.decision === "in_review" && !state.error && (
          <p className="text-sm font-semibold text-admin">
            סומן כבבדיקה. המחלוקת נשארת פתוחה עד להכרעה.
          </p>
        )}

        {state.error && <ErrorText>{state.error}</ErrorText>}
      </div>
    </form>
  );
}
