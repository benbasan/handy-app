"use client";

import { useActionState } from "react";
import { BUTTON_BASE, ErrorText } from "@/components/ui/primitives";
import {
  applyProEnforcement,
  decideProVerification,
} from "@/lib/actions/admin";
import {
  EMPTY_ADMIN_DECISION_STATE,
  EMPTY_PRO_ENFORCEMENT_STATE,
} from "@/lib/actions/state";
import { PRO_ENFORCEMENT_LABEL } from "@/lib/validation/admin";
import type { ProEnforcementState } from "@/lib/supabase/admin";

/**
 * "כלי אכיפה" — the dark card on
 * design/screens/admin-7.4-disputes-control.png: השעיית פרופיל · חסימת עדכוני
 * מחיר · דרישת מסמכים מחודשת · זיכוי ללקוח.
 *
 * Three of the four are here; the credit belongs to the decision that grants
 * it and lives on the dispute form. None of them is a hidden button:
 * suspension and "require documents" both move `verification_status`, which
 * `is_verified_pro()` gates every new bid on, and the price-update block is
 * checked inside `request_price_update()` itself.
 *
 * Each button offers only the move that is available from the state the pro is
 * actually in, so the panel can never ask for something the database would
 * refuse.
 */
export function ProEnforcementPanel({
  pro,
  proName,
}: {
  pro: ProEnforcementState;
  proName: string | null;
}) {
  const [enforcement, enforcementAction, enforcementPending] = useActionState(
    applyProEnforcement,
    EMPTY_PRO_ENFORCEMENT_STATE,
  );
  const [verification, verificationAction, verificationPending] =
    useActionState(decideProVerification, EMPTY_ADMIN_DECISION_STATE);

  const status = verification.decidedStatus ?? pro.verificationStatus;
  const suspended = status === "suspended";

  const blocked =
    enforcement.applied === "block_price_updates"
      ? true
      : enforcement.applied === "unblock_price_updates"
        ? false
        : pro.priceUpdatesBlocked;

  const documentsRequired =
    enforcement.applied === "require_documents"
      ? true
      : enforcement.applied === "clear_documents_request"
        ? false
        : pro.documentsRequiredAt !== null;

  return (
    <section className="rounded-2xl bg-ink p-5 text-white sm:p-6">
      <h2 className="text-lg font-bold">כלי אכיפה</h2>
      <p className="mt-1 text-sm text-white/70">
        {proName ?? "בעל המקצוע"} · מצב נוכחי:{" "}
        {suspended ? "מושהה" : status === "verified" ? "מאומת" : "ממתין לאישור"}
        {blocked ? " · עדכוני מחיר חסומים" : ""}
        {documentsRequired ? " · נדרשו מסמכים מחודשים" : ""}
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <form action={verificationAction}>
          <input type="hidden" name="proId" value={pro.proId} />
          <button
            type="submit"
            name="status"
            value={suspended ? "verified" : "suspended"}
            disabled={verificationPending}
            className={`${BUTTON_BASE} px-4 py-2 text-sm ${
              suspended
                ? "bg-cta text-white hover:bg-cta-strong"
                : "bg-danger text-white hover:bg-danger-strong"
            }`}
          >
            {suspended ? "בטל השעיה" : "השעה פרופיל"}
          </button>
        </form>

        <form action={enforcementAction} className="flex flex-wrap gap-2">
          <input type="hidden" name="proId" value={pro.proId} />

          <button
            type="submit"
            name="action"
            value={blocked ? "unblock_price_updates" : "block_price_updates"}
            disabled={enforcementPending}
            className={`${BUTTON_BASE} border border-white/25 px-4 py-2 text-sm text-white hover:bg-white/10`}
          >
            {blocked
              ? PRO_ENFORCEMENT_LABEL.unblock_price_updates
              : PRO_ENFORCEMENT_LABEL.block_price_updates}
          </button>

          <button
            type="submit"
            name="action"
            value={
              documentsRequired
                ? "clear_documents_request"
                : "require_documents"
            }
            disabled={enforcementPending}
            className={`${BUTTON_BASE} border border-white/25 px-4 py-2 text-sm text-white hover:bg-white/10`}
          >
            {documentsRequired
              ? PRO_ENFORCEMENT_LABEL.clear_documents_request
              : PRO_ENFORCEMENT_LABEL.require_documents}
          </button>
        </form>
      </div>

      <p className="mt-4 text-sm text-white/60">
        זיכוי ללקוח נרשם בהכרעת המחלוקת עצמה, כדי שהסכום והסיבה יישמרו יחד.
      </p>

      {(enforcement.error || verification.error) && (
        <div className="mt-3">
          <ErrorText>{enforcement.error ?? verification.error}</ErrorText>
        </div>
      )}
    </section>
  );
}
