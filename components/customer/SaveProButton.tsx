"use client";

import { useActionState } from "react";
import { ErrorText } from "@/components/ui/primitives";
import { saveProForNextTime } from "@/lib/actions/completion";
import { EMPTY_SAVE_PRO_STATE } from "@/lib/actions/state";

/**
 * "שמור לפעם הבאה" — the dark card on
 * design/screens/customer-4.1-summary-receipt-rating.png, and what finally
 * fills the "בעלי המקצוע שלי" panel the account page has been promising since
 * Phase 2.
 *
 * A pro cannot see who saved them (Phase 1's policy on `saved_pros`, and the
 * comment under it): this is the customer's own list, and knowing it before a
 * job is even posted would leak intent.
 */
export function SaveProButton({
  jobId,
  proId,
  proName,
  alreadySaved,
}: {
  jobId: string;
  proId: string;
  proName: string | null;
  alreadySaved: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    saveProForNextTime,
    EMPTY_SAVE_PRO_STATE,
  );

  const saved = alreadySaved || state.saved === true;

  return (
    <section className="rounded-2xl bg-ink p-5 text-white sm:p-6">
      <h2 className="text-lg font-bold">שמור לפעם הבאה</h2>
      <p className="mt-2 text-sm text-white/80">
        {saved ? (
          <>
            {proName ?? "בעל המקצוע"} נמצא ברשימת בעלי המקצוע שלכם — אפשר להזמין
            אותו ישירות בקריאה הבאה.
          </>
        ) : (
          <>
            אפשר להוסיף את {proName ?? "בעל המקצוע"} ל&quot;בעלי המקצוע
            שלי&quot; ולהזמין אותו ישירות בקריאה הבאה.
          </>
        )}
      </p>

      {!saved && (
        <form action={formAction} className="mt-4">
          <input type="hidden" name="jobId" value={jobId} />
          <input type="hidden" name="proId" value={proId} />
          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-xl bg-white px-5 py-3 text-base font-bold text-ink transition-colors hover:bg-canvas disabled:opacity-60"
          >
            {pending ? "שומר…" : "שמירת בעל המקצוע"}
          </button>
        </form>
      )}

      {state.error && (
        <div className="mt-3">
          <ErrorText>{state.error}</ErrorText>
        </div>
      )}
    </section>
  );
}
