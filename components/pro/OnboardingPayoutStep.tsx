"use client";

import { useActionState, useState } from "react";
import {
  BUTTON_PRO,
  Card,
  ErrorText,
  INPUT_CLASS,
} from "@/components/ui/primitives";
import { submitProProfile } from "@/lib/actions/pros";
import { EMPTY_PRO_FORM_STATE } from "@/lib/actions/state";
import {
  PAYMENT_METHOD_LABEL,
  PAYMENT_METHODS,
  type PaymentMethod,
} from "@/lib/validation/pros";

/**
 * Onboarding step 5 — תשלומים ומוכנות, and the submission itself
 * (product-spec.md 4.2 steps 4 and 5, which the design's five-step rail folds
 * into one screen).
 *
 * Two directions of money, and they are not the same thing:
 *
 *  * How the pro collects from the customer. Handy never touches it (business
 *    rule 4); this is what the customer is told to expect.
 *  * Where the 12% commission is charged from. Bank, branch and the last four
 *    digits only — the rest of the account number is not collected here,
 *    because how it would be stored is a payments-phase decision to take with
 *    the user (CLAUDE.md section 8).
 *
 * The submit button is not what changes the status. `submit_pro_for_approval()`
 * re-checks completeness inside the database, so an incomplete profile is
 * refused there even if it reached the API by another route.
 */
export function OnboardingPayoutStep({
  defaults,
  canSubmit,
  missing,
}: {
  defaults: {
    paymentMethods: string[];
    bankName: string;
    bankBranch: string;
    accountLast4: string;
  };
  /** What the database will independently re-check when the form is posted. */
  canSubmit: boolean;
  missing: string[];
}) {
  const [state, formAction, pending] = useActionState(
    submitProProfile,
    EMPTY_PRO_FORM_STATE,
  );
  const [methods, setMethods] = useState<string[]>(defaults.paymentMethods);

  const fieldErrors = state.fieldErrors ?? {};

  const toggle = (method: PaymentMethod) =>
    setMethods((current) =>
      current.includes(method)
        ? current.filter((value) => value !== method)
        : [...current, method],
    );

  return (
    <form action={formAction} className="space-y-6">
      {methods.map((method) => (
        <input key={method} type="hidden" name="paymentMethod" value={method} />
      ))}

      <fieldset>
        <legend className="mb-2 text-sm font-medium text-ink">
          איך תגבה מהלקוח?
        </legend>
        <div className="flex flex-wrap gap-2">
          {PAYMENT_METHODS.map((method) => {
            const on = methods.includes(method);
            return (
              <button
                key={method}
                type="button"
                aria-pressed={on}
                onClick={() => toggle(method)}
                className={`rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${
                  on
                    ? "border-pro bg-pro text-white"
                    : "border-line bg-surface text-ink hover:border-pro/40"
                }`}
              >
                {PAYMENT_METHOD_LABEL[method]}
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-muted">
          התשלום עובר ישירות ממנו אליך — Handy לא מעבדת אותו, רק רושמת מה נגבה
          לצורך העמלה והקבלה.
        </p>
        {fieldErrors.paymentMethods && (
          <p className="mt-2">
            <ErrorText>{fieldErrors.paymentMethods}</ErrorText>
          </p>
        )}
      </fieldset>

      <div>
        <h3 className="mb-2 text-sm font-medium text-ink">
          חשבון בנק לחיוב העמלה
        </h3>
        <p className="mb-3 text-xs text-muted">
          העמלה נגבית כל שני וחמישי על עבודות שנסגרו. נשמרות רק 4 הספרות
          האחרונות של החשבון — מספיק כדי שתזהו אותו, ולא יותר מזה.
        </p>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label
              htmlFor="bankName"
              className="mb-1 block text-sm font-medium text-ink"
            >
              בנק
            </label>
            <input
              id="bankName"
              name="bankName"
              type="text"
              required
              maxLength={60}
              defaultValue={defaults.bankName}
              placeholder="בנק לאומי"
              className={INPUT_CLASS}
            />
            {fieldErrors.bankName && (
              <p className="mt-2">
                <ErrorText>{fieldErrors.bankName}</ErrorText>
              </p>
            )}
          </div>

          <div>
            <label
              htmlFor="bankBranch"
              className="mb-1 block text-sm font-medium text-ink"
            >
              סניף
            </label>
            <input
              id="bankBranch"
              name="bankBranch"
              type="text"
              inputMode="numeric"
              required
              maxLength={4}
              defaultValue={defaults.bankBranch}
              placeholder="800"
              className={`${INPUT_CLASS} ltr-nums`}
            />
            {fieldErrors.bankBranch && (
              <p className="mt-2">
                <ErrorText>{fieldErrors.bankBranch}</ErrorText>
              </p>
            )}
          </div>

          <div>
            <label
              htmlFor="accountLast4"
              className="mb-1 block text-sm font-medium text-ink"
            >
              4 ספרות אחרונות
            </label>
            <input
              id="accountLast4"
              name="accountLast4"
              type="text"
              inputMode="numeric"
              required
              maxLength={4}
              defaultValue={defaults.accountLast4}
              placeholder="4417"
              className={`${INPUT_CLASS} ltr-nums`}
            />
            {fieldErrors.accountLast4 && (
              <p className="mt-2">
                <ErrorText>{fieldErrors.accountLast4}</ErrorText>
              </p>
            )}
          </div>
        </div>
      </div>

      {!canSubmit && (
        <Card className="border-alert bg-alert-soft">
          <h3 className="text-sm font-bold text-ink">
            חסר עוד משהו לפני השליחה
          </h3>
          <ul className="mt-2 space-y-1 text-sm text-muted">
            {missing.map((item) => (
              <li key={item}>· {item}</li>
            ))}
          </ul>
        </Card>
      )}

      {state.error && <ErrorText>{state.error}</ErrorText>}

      <button type="submit" disabled={pending} className={BUTTON_PRO}>
        {pending ? "שולח…" : "שלח את הפרופיל לאישור"}
      </button>
    </form>
  );
}
