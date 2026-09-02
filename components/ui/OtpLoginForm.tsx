"use client";

import { useActionState, useState } from "react";
import {
  requestOtp,
  verifyOtp,
  type RequestOtpState,
  type VerifyOtpState,
} from "@/lib/actions/auth";
import { BUTTON_CTA, INPUT_CLASS } from "@/components/ui/primitives";
import { formatIsraeliMobile, type SignupRole } from "@/lib/validation/auth";

type Props = {
  role: SignupRole;
  title: string;
  subtitle: string;
  /** Ask for a name on first sign-up. Off for the admin screen. */
  askForName?: boolean;
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
      <h1 className="text-3xl font-bold text-ink">{title}</h1>
      <p className="mt-2 text-sm text-muted">{subtitle}</p>

      {sentTo ? (
        <form action={verifyAction} className="mt-6 space-y-4">
          <input type="hidden" name="phone" value={sentTo} />

          <p className="text-sm text-muted">
            שלחנו קוד בת 6 ספרות אל{" "}
            <span dir="ltr" className="font-semibold">
              {formatIsraeliMobile(sentTo)}
            </span>
          </p>

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
      <label
        htmlFor={htmlFor}
        className="mb-1 block text-sm font-medium text-ink"
      >
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
