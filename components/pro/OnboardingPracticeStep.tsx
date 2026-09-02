"use client";

import { useActionState, useState } from "react";
import {
  BUTTON_PRO,
  Card,
  ErrorText,
  INPUT_CLASS,
} from "@/components/ui/primitives";
import { savePracticeBid } from "@/lib/actions/pros";
import { EMPTY_PRO_FORM_STATE } from "@/lib/actions/state";
import { commissionBreakdown, COMMISSION_RATE } from "@/lib/validation/pros";

/**
 * Onboarding step 4 — תרגול הגשת הצעה (product-spec.md 4.2).
 *
 * A simulation on a sample job, and the spec is explicit that it is never sent
 * to a real customer: nothing on this path touches the `bids` table. What it
 * does teach is the one piece of arithmetic the pro has to be able to read
 * before their first real bid — the 12% comes out of the price they typed, and
 * never gets added on top of it for the customer (business rule 3).
 *
 * The four rules beside the form are the spec's "4 כללים להצעה שנבחרת".
 */

const SAMPLE_JOB = {
  title: "נזילה מתחת לכיור במטבח",
  description:
    "מים מצטברים על הרצפה מהבוקר, צריך פתרון היום. בבניין ללא ברז ניתוק בדירה.",
  address: "רמת אביב · 1.2 ק״מ ממך",
  when: "דחוף — עוד שעה",
};

const RULES = [
  "מחיר אחד וסופי, כולל הביקור — אין דמי הגעה נפרדים.",
  "זמן הגעה שאתם באמת עומדים בו. איחור עולה יותר ממחיר גבוה.",
  "שורה אחת שמראה שקראתם את התיאור, לא תבנית מועתקת.",
  "מהירות: הצעה שנשלחת תוך 10 דקות מהפרסום נבחרת ב-64% מהמקרים.",
];

export function OnboardingPracticeStep() {
  const [state, formAction, pending] = useActionState(
    savePracticeBid,
    EMPTY_PRO_FORM_STATE,
  );
  const [price, setPrice] = useState("380");

  const numericPrice = Number(price);
  const valid = Number.isFinite(numericPrice) && numericPrice > 0;
  const { commission, net } = commissionBreakdown(valid ? numericPrice : 0);
  const fieldErrors = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="space-y-6">
      <Card className="bg-canvas">
        <p className="text-xs font-semibold text-pro">
          קריאה לדוגמה · לא נשלחת ללקוח אמיתי
        </p>
        <h3 className="mt-1 text-lg font-bold text-ink">{SAMPLE_JOB.title}</h3>
        <p className="mt-1 text-sm text-muted">{SAMPLE_JOB.description}</p>
        <p className="mt-2 text-sm font-semibold text-pro">
          {SAMPLE_JOB.address} · {SAMPLE_JOB.when}
        </p>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label
            htmlFor="price"
            className="mb-1 block text-sm font-medium text-ink"
          >
            המחיר שלך (₪)
          </label>
          <input
            id="price"
            name="price"
            type="number"
            inputMode="numeric"
            min={1}
            max={100000}
            required
            value={price}
            onChange={(event) => setPrice(event.target.value)}
            className={`${INPUT_CLASS} ltr-nums`}
          />
          {fieldErrors.price && (
            <p className="mt-2">
              <ErrorText>{fieldErrors.price}</ErrorText>
            </p>
          )}
        </div>

        <div>
          <label
            htmlFor="etaMinutes"
            className="mb-1 block text-sm font-medium text-ink"
          >
            זמן הגעה (דקות)
          </label>
          <input
            id="etaMinutes"
            name="etaMinutes"
            type="number"
            inputMode="numeric"
            min={1}
            max={1440}
            required
            defaultValue={45}
            className={`${INPUT_CLASS} ltr-nums`}
          />
          {fieldErrors.etaMinutes && (
            <p className="mt-2">
              <ErrorText>{fieldErrors.etaMinutes}</ErrorText>
            </p>
          )}
        </div>
      </div>

      <div>
        <label
          htmlFor="note"
          className="mb-1 block text-sm font-medium text-ink"
        >
          הערה ללקוח
        </label>
        <textarea
          id="note"
          name="note"
          rows={3}
          maxLength={500}
          placeholder="אגיע עם חלקי חילוף לסיפון ולסיאל. אם התקלה בצנרת הקיר אעדכן מחיר עם תמונה לפני שאמשיך."
          className={INPUT_CLASS}
        />
        {fieldErrors.note && (
          <p className="mt-2">
            <ErrorText>{fieldErrors.note}</ErrorText>
          </p>
        )}
      </div>

      <Card className="bg-ink text-white">
        <h3 className="text-base font-bold">מה נשאר אצלך</h3>
        <dl className="mt-3 space-y-2 text-sm">
          <Line label="מחיר ההצעה" value={valid ? numericPrice : null} />
          <Line
            label={`עמלת Handy (${Math.round(COMMISSION_RATE * 100)}%)`}
            value={valid ? -commission : null}
          />
          <div className="flex items-baseline justify-between gap-3 border-t border-white/15 pt-2">
            <dt className="font-bold">נטו אליך</dt>
            <dd className="ltr-nums text-xl font-bold text-cta">
              {valid ? `${net.toLocaleString("he-IL")} ₪` : "—"}
            </dd>
          </div>
        </dl>
        <p className="mt-3 text-xs text-white/60">
          העמלה נגבית ממך בלבד ולא מתווספת למחיר שהלקוח רואה.
        </p>
      </Card>

      <div>
        <h3 className="text-sm font-semibold text-ink">4 כללים להצעה שנבחרת</h3>
        <ol className="mt-2 space-y-2 text-sm text-muted">
          {RULES.map((rule, index) => (
            <li key={rule} className="flex gap-2">
              <span
                aria-hidden
                className="flex size-5 shrink-0 items-center justify-center rounded-full bg-pro-soft text-xs font-bold text-pro"
              >
                {index + 1}
              </span>
              {rule}
            </li>
          ))}
        </ol>
      </div>

      {state.error && <ErrorText>{state.error}</ErrorText>}

      <button type="submit" disabled={pending} className={BUTTON_PRO}>
        {pending ? "שומר…" : "סיימתי את התרגול"}
      </button>
    </form>
  );
}

function Line({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-white/70">{label}</dt>
      <dd className="ltr-nums font-semibold">
        {value === null ? "—" : `${value.toLocaleString("he-IL")} ₪`}
      </dd>
    </div>
  );
}
