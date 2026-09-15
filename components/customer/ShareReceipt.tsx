"use client";

import { useActionState } from "react";
import {
  createReceiptShareLink,
  revokeReceiptShareLinks,
  type ReceiptShareState,
} from "@/lib/actions/receiptShare";
import {
  BUTTON_COMPACT,
  BUTTON_QUIET,
  CARD_BASE,
  ErrorText,
  SECTION_TITLE,
} from "@/components/ui/primitives";

const INITIAL: ReceiptShareState = {};

/**
 * "שליחת הקבלה" (Phase 17) — a link somebody without an account can open: a
 * landlord, an employer, a partner. Seven days, revocable, the customer's
 * version of the document (decided 15.9.2026). The card says all three,
 * because a link that opens someone's address and price should never be
 * created by accident.
 */
export function ShareReceipt({ jobId }: { jobId: string }) {
  const [created, createAction, creating] = useActionState(
    createReceiptShareLink,
    INITIAL,
  );
  const [revoked, revokeAction, revoking] = useActionState(
    revokeReceiptShareLinks,
    INITIAL,
  );

  const live = created.link && !revoked.revoked;

  return (
    <section className={`${CARD_BASE} p-5`}>
      <h2 className={SECTION_TITLE}>שליחת הקבלה</h2>
      <p className="mt-2 text-sm text-muted">
        קישור לקבלה שאפשר לפתוח בלי חשבון. מי שמקבל אותו רואה את השם, הכתובת
        והסכום. הקישור פג אחרי 7 ימים, ואפשר לבטל אותו בכל רגע.
      </p>

      {live ? (
        <div className="mt-3 space-y-2">
          <p
            dir="ltr"
            className="rounded-lg bg-canvas px-3 py-2 text-center font-mono text-xs break-all text-ink"
          >
            {created.link}
          </p>
          <a
            href={`https://wa.me/?text=${encodeURIComponent(`הקבלה על העבודה, דרך Handy: ${created.link}`)}`}
            target="_blank"
            rel="noopener noreferrer"
            className={`${BUTTON_QUIET} ${BUTTON_COMPACT} w-full`}
          >
            שליחה בוואטסאפ
          </a>
          <form action={revokeAction}>
            <input type="hidden" name="jobId" value={jobId} />
            <button
              type="submit"
              disabled={revoking}
              className="w-full text-sm font-semibold text-muted underline underline-offset-2 hover:text-alert"
            >
              {revoking ? "מבטל…" : "ביטול הקישור"}
            </button>
          </form>
        </div>
      ) : (
        <form action={createAction} className="mt-3">
          <input type="hidden" name="jobId" value={jobId} />
          <button
            type="submit"
            disabled={creating}
            className={`${BUTTON_QUIET} ${BUTTON_COMPACT} w-full`}
          >
            {creating ? "יוצר קישור…" : "יצירת קישור לקבלה"}
          </button>
          {revoked.revoked && (
            <p role="status" className="mt-2 text-sm text-cta-strong">
              ✓ הקישור בוטל.
            </p>
          )}
        </form>
      )}

      {(created.error || revoked.error) && (
        <div className="mt-2">
          <ErrorText>{created.error ?? revoked.error}</ErrorText>
        </div>
      )}
    </section>
  );
}
