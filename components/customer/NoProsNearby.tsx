"use client";

import { useActionState } from "react";
import { widenSearchRadius, type WidenRadiusState } from "@/lib/actions/jobs";
import {
  BUTTON_CTA,
  Card,
  ErrorText,
  PAGE_LEAD,
  SECTION_TITLE,
} from "@/components/ui/primitives";
import { nextSearchRadius } from "@/lib/validation/jobs";

const INITIAL: WidenRadiusState = {};

/**
 * What the offers screen says when the honest count is none.
 *
 * The card this replaces read "הקריאה נשלחה ל-0 בעלי מקצוע מאומתים בסביבה. אין
 * צורך לרענן — הצעה חדשה תופיע כאן מעצמה." Every clause of that was true and
 * the whole was a dead end: a number nobody could act on, and an instruction
 * to wait, addressed to somebody who could wait for ever.
 *
 * So this card does the opposite of reassuring. It says plainly that nobody
 * covers the address yet, offers the one thing that can change that, and does
 * not promise that widening will find anyone — because it might not, and a
 * screen whose whole job is trust cannot buy calm with a guess.
 */
export function NoProsNearby({
  jobId,
  radiusKm,
}: {
  jobId: string;
  radiusKm: number;
}) {
  const [state, formAction, pending] = useActionState(
    widenSearchRadius,
    INITIAL,
  );

  const wider = nextSearchRadius(radiusKm);

  return (
    <Card className="p-8 text-center">
      <p className={SECTION_TITLE}>
        עוד אין בעל מקצוע מאומת שמכסה את הכתובת שלכם
      </p>
      <p className={PAGE_LEAD}>
        הקריאה פורסמה ונשמרה, אבל ברדיוס{" "}
        <span className="ltr-nums">{radiusKm}</span> ק״מ אין כרגע אף בעל מקצוע
        מאומת שמקבל קריאות. היא תישלח מעצמה לכל מי שיצטרף באזור.
      </p>

      {wider !== null ? (
        <form action={formAction} className="mt-5">
          <input type="hidden" name="jobId" value={jobId} />
          <button type="submit" disabled={pending} className={BUTTON_CTA}>
            {pending ? "מרחיבים…" : `הרחיבו את החיפוש ל-${wider} ק״מ`}
          </button>
          <p className="mt-3 text-sm text-muted">
            רדיוס רחב יותר מגיע ליותר בעלי מקצוע, אבל גם לרחוקים יותר — וזמן
            ההגעה עשוי להתארך.
          </p>
        </form>
      ) : (
        <p className="mt-5 text-sm text-muted">
          הקריאה כבר משודרת ברדיוס הרחב ביותר. אפשר להשאיר אותה פתוחה — או לפנות
          אלינו דרך מרכז העזרה.
        </p>
      )}

      {state.error && (
        <p className="mt-4">
          <ErrorText>{state.error}</ErrorText>
        </p>
      )}
    </Card>
  );
}
