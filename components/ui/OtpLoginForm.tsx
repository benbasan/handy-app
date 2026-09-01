"use client";

import { useActionState, useState } from "react";
import {
  requestOtp,
  verifyOtp,
  type RequestOtpState,
  type VerifyOtpState,
} from "@/lib/actions/auth";
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
    <div className="w-full max-w-sm">
      <h1 className="text-2xl font-bold">{title}</h1>
      <p className="mt-1 text-sm text-neutral-600">{subtitle}</p>

      {sentTo ? (
        <form action={verifyAction} className="mt-6 space-y-4">
          <input type="hidden" name="phone" value={sentTo} />

          <p className="text-sm text-neutral-700">
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
            className={BUTTON_CLASS}
          >
            {verifyPending ? "מאמת…" : "אישור והתחברות"}
          </button>

          <button
            type="button"
            onClick={onRestart}
            className="w-full text-sm text-neutral-600 underline underline-offset-2"
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
            className={BUTTON_CLASS}
          >
            {requestPending ? "שולח קוד…" : "שליחת קוד ב-SMS"}
          </button>
        </form>
      )}
    </div>
  );
}

const INPUT_CLASS =
  "block w-full rounded-lg border border-neutral-300 px-3 py-2 text-base outline-none focus:border-neutral-900 focus:ring-1 focus:ring-neutral-900";

const BUTTON_CLASS =
  "w-full rounded-lg bg-neutral-900 px-4 py-2.5 text-base font-semibold text-white disabled:opacity-60";

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
        className="mb-1 block text-sm font-medium text-neutral-800"
      >
        {label}
      </label>
      {children}
    </div>
  );
}

function ErrorText({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="text-sm text-red-700">
      {children}
    </p>
  );
}
