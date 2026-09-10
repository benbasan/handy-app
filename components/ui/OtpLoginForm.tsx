"use client";

import { useActionState, useState } from "react";
import {
  requestOtp,
  verifyOtp,
  type RequestOtpState,
  type VerifyOtpState,
} from "@/lib/actions/auth";
import {
  BUTTON_CTA,
  FIELD_LABEL,
  INPUT_CLASS,
  PAGE_TITLE,
} from "@/components/ui/primitives";
import { formatIsraeliMobile, type SignupRole } from "@/lib/validation/auth";

type Props = {
  role: SignupRole;
  title: string;
  subtitle: string;
  /** Ask for a name on first sign-up. Off for the admin screen. */
  askForName?: boolean;
  /**
   * Where the visitor was heading when the proxy bounced them here. Passed
   * straight back to the server, which re-checks it — this component is not
   * the thing that makes it safe (see `postLoginPath` in lib/routes.ts).
   */
  next?: string | null;
};

/**
 * Phone + OTP sign-in, shared by the customer, pro and admin login screens.
 *
 * The outer component exists purely to hold a remount key: `useActionState`
 * has no reset, so "change number" swaps in a fresh instance rather than
 * trying to unwind two action states by hand.
 */
export function OtpLoginForm(props: Props) {
  const [attempt, setAttempt] = useState(0);

  return (
    <OtpLoginFormAttempt
      key={attempt}
      {...props}
      onRestart={() => setAttempt((n) => n + 1)}
    />
  );
}

const INITIAL_REQUEST: RequestOtpState = {};
const INITIAL_VERIFY: VerifyOtpState = {};

function OtpLoginFormAttempt({
  role,
  title,
  subtitle,
  askForName = true,
  next,
  onRestart,
}: Props & { onRestart: () => void }) {
  const [requestState, requestAction, requestPending] = useActionState(
    requestOtp,
    INITIAL_REQUEST,
  );
  const [verifyState, verifyAction, verifyPending] = useActionState(
    verifyOtp,
    INITIAL_VERIFY,
  );

  const sentTo = requestState.sentTo;

  return (
    <div className="w-full">
      <h1 className={PAGE_TITLE}>{title}</h1>
      <p className="mt-2 text-sm text-muted">{subtitle}</p>

      {sentTo ? (
        <form action={verifyAction} className="mt-6 space-y-4">
          <input type="hidden" name="phone" value={sentTo} />
          {/*
            Both only matter while real delivery is stood down
            (lib/auth/bypass.ts): the bypass creates the account at this step,
            so it needs to know which of the two self-service roles to ask for
            and what to call the person. The ordinary path made the user in the
            previous step and ignores them.
          */}
          <input type="hidden" name="role" value={role} />
          {next && <input type="hidden" name="next" value={next} />}
          {requestState.fullName && (
            <input
              type="hidden"
              name="fullName"
              value={requestState.fullName}
            />
          )}

          {requestState.bypass ? (
            // One fact per line: the digits live in the field below, not in
            // this sentence, so there is no Latin run inside the Hebrew to
            // reorder. The screen must not claim an SMS was sent.
            <p className="text-sm text-muted">
              מצב הדגמה — לא נשלח SMS. קוד האימות כבר מולא, אפשר להמשיך.
            </p>
          ) : (
            <p className="text-sm text-muted">
              שלחנו קוד בת 6 ספרות אל{" "}
              <span dir="ltr" className="font-semibold">
                {formatIsraeliMobile(sentTo)}
              </span>
            </p>
          )}

          <Field label="קוד אימות" htmlFor="token">
            <input
              id="token"
              name="token"
              // A phone keypad and no autocorrect: this is six digits, not text.
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="\d{6}"
              maxLength={6}
              required
              autoFocus
              defaultValue={requestState.code ?? ""}
              dir="ltr"
              className={`${INPUT_CLASS} text-center font-mono text-lg tracking-[0.5em]`}
            />
          </Field>

          {verifyState.error && <ErrorText>{verifyState.error}</ErrorText>}

          <button
            type="submit"
            disabled={verifyPending}
            className={`${BUTTON_CTA} w-full`}
          >
            {verifyPending ? "מאמת…" : "אישור והתחברות"}
          </button>

          <button
            type="button"
            onClick={onRestart}
            className="w-full text-sm text-muted underline underline-offset-2"
          >
            שינוי מספר טלפון
          </button>
        </form>
      ) : (
        <form action={requestAction} className="mt-6 space-y-4">
          <input type="hidden" name="role" value={role} />

          <Field label="מספר טלפון נייד" htmlFor="phone">
            <input
              id="phone"
              name="phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="050-1234567"
              required
              autoFocus
              // dir="ltr" on the field itself: a phone number is left-to-right
              // even inside a right-to-left page, and text-end keeps it
              // visually aligned with the Hebrew label above it.
              dir="ltr"
              className={`${INPUT_CLASS} text-end`}
            />
          </Field>

          {askForName && (
            <Field label="שם מלא (רק בהרשמה ראשונה)" htmlFor="fullName">
              <input
                id="fullName"
                name="fullName"
                type="text"
                autoComplete="name"
                maxLength={80}
                className={INPUT_CLASS}
              />
            </Field>
          )}

          {requestState.error && <ErrorText>{requestState.error}</ErrorText>}

          <button
            type="submit"
            disabled={requestPending}
            className={`${BUTTON_CTA} w-full`}
          >
            {requestPending ? "שולח קוד…" : "שליחת קוד ב-SMS"}
          </button>
        </form>
      )}
    </div>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className={`${FIELD_LABEL}`}>
        {label}
      </label>
      {children}
    </div>
  );
}

function ErrorText({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="text-sm font-medium text-red-700">
      {children}
    </p>
  );
}
