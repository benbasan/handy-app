import { describe, expect, it } from "vitest";
import {
  describeSendError,
  describeVerifyError,
  isExpectedVerifyFailure,
} from "../otpErrors";

/**
 * The two failures below are copied verbatim from the local stack, captured
 * with curl against `/auth/v1/otp` and `/auth/v1/verify`. Inventing the
 * strings would have missed the bug entirely: it lives in the fact that a
 * *send* failure's message contains the word "invalid".
 */
const SMS_PROVIDER_MISSING = {
  code: "sms_send_failed",
  message:
    "Error sending confirmation OTP to provider: Authentication Error - invalid username More information: https://www.twilio.com/docs/errors/20003",
};

const WRONG_CODE = {
  code: "otp_expired",
  message: "Token has expired or is invalid",
};

/**
 * Verbatim from the Vercel production log, 9.9.2026. The bypass creates the
 * account at step 2 with `signUp`, and a hosted project whose phone
 * confirmations are still on answers a *verify* with a failure to *send*:
 *
 *   {"operation":"auth.verifyOtp.bypass.signUp",
 *    "message":"Unable to get SMS provider","code":"AuthRetryableFetchError"}
 *
 * supabase-js labels the 500 retryable, so there is no useful code to read —
 * only the prose. That is why the predicate matches on it.
 */
const NO_SMS_PROVIDER = {
  code: "AuthRetryableFetchError",
  message: "Unable to get SMS provider",
};

describe("describeSendError", () => {
  it("never blames the code on the screen that has not asked for one", () => {
    // The regression. A new phone number with no SMS provider used to be
    // answered with "הקוד שהוזן שגוי", before any code had been entered.
    // "שגוי" is the word that does the blaming, and no step-1 message may
    // reach for it — the dev hint below still names the demo code, which is
    // help, not an accusation.
    for (const isProduction of [true, false]) {
      const message = describeSendError(SMS_PROVIDER_MISSING, { isProduction });

      expect(message).not.toMatch(/שגוי/);
      expect(message).toMatch(/נכשל/);
    }
  });

  it("names the demo-numbers rule outside production", () => {
    expect(
      describeSendError(SMS_PROVIDER_MISSING, { isProduction: false }),
    ).toMatch(/README/);
  });

  it("keeps the developer's Twilio detail out of the browser in production", () => {
    const message = describeSendError(SMS_PROVIDER_MISSING, {
      isProduction: true,
    });

    expect(message).not.toMatch(/README|Twilio|twilio|invalid username/);
    expect(message).toMatch(/תמיכה/);
  });

  it("reads the code rather than the prose", () => {
    // Same code, a message that says nothing recognisable.
    expect(
      describeSendError({ code: "sms_send_failed", message: "boom" }),
    ).toMatch(/SMS/);
    expect(
      describeSendError({ code: "over_sms_send_rate_limit", message: "boom" }),
    ).toMatch(/יותר מדי בקשות/);
  });

  it("passes an unrecognised failure through instead of swallowing it", () => {
    expect(describeSendError({ message: "Something entirely new" })).toBe(
      "Something entirely new",
    );
  });
});

describe("describeVerifyError", () => {
  it("says wrong or expired, because GoTrue does not distinguish them", () => {
    // A mistyped code and a stale one both come back as otp_expired, so the
    // Hebrew claims neither on its own.
    const message = describeVerifyError(WRONG_CODE);

    expect(message).toMatch(/שגוי/);
    expect(message).toMatch(/פג תוקפו/);
  });

  it("still recognises a failure that arrives without a code", () => {
    expect(
      describeVerifyError({ message: "Token has expired or is invalid" }),
    ).toMatch(/שגוי/);
  });

  it("passes an unrecognised failure through", () => {
    expect(describeVerifyError({ message: "Something entirely new" })).toBe(
      "Something entirely new",
    );
  });

  it("answers a missing SMS provider in Hebrew", () => {
    // The regression: this reached a Hebrew screen as its own English, because
    // step 2 had no branch for a failure about sending — and since the bypass
    // creates the account here, a sending failure is exactly what arrives.
    const message = describeVerifyError(NO_SMS_PROVIDER);

    expect(message).toMatch(/[\u0590-\u05FF]/);
    expect(message).not.toMatch(/SMS provider|Unable/);
    expect(message).toMatch(/תמיכה/);
  });

  it("does not blame the code for a failure to send", () => {
    // The ordering guarantee. GoTrue's send prose carries the word "invalid",
    // which would otherwise match the mistyped-code rule and tell somebody who
    // typed the right six digits that they got them wrong — the bug in this
    // module's header, one step further along.
    expect(describeVerifyError(SMS_PROVIDER_MISSING)).not.toMatch(/שגוי/);
  });
});

/**
 * The predicate the sign-in action uses to decide whether a failed
 * verification is worth an error line or only a warning.
 *
 * The point of these assertions is the invariant, not the individual cases:
 * "expected" must mean exactly "describeVerifyError had an answer of its own".
 * Were the two ever to disagree, either a wrong digit would be logged as a
 * fault or a genuinely broken auth provider would be filed as a typo — and
 * both failures are silent.
 */
/**
 * `[auth.sms] max_frequency` in supabase/config.toml — one code per number per
 * minute. It is the failure the demo panel hits most, because switching back
 * to a user you just left is the natural thing to do.
 */
describe("describeSendError and the resend throttle", () => {
  // Verbatim from GoTrue, via e2e/helpers.ts, which parses the same number to
  // wait it out. No error code accompanies it — which is why it used to fall
  // through every branch and put raw English on a Hebrew screen.
  const THROTTLED = {
    code: null,
    message: "you can only request this after 41 seconds",
  };

  it("answers in Hebrew, and keeps the only useful fact in it", () => {
    const message = describeSendError(THROTTLED);

    expect(message).toContain("41");
    // The regression: the provider's own English reaching the browser.
    expect(message).not.toContain("you can only");
    expect(message).toMatch(/[\u0590-\u05FF]/);
  });

  it("does not let the generic rate-limit sentence swallow the number", () => {
    // "after 41 seconds" contains neither "rate" nor "too many", but a future
    // GoTrue message could carry both; the specific branch has to win, because
    // the generic one drops the wait.
    expect(
      describeSendError({
        code: null,
        message: "Rate limited: you can only request this after 7 seconds",
      }),
    ).toContain("7");
  });

  it("still falls back for a throttle that names no number", () => {
    const message = describeSendError({
      code: "over_sms_send_rate_limit",
      message: "too many requests",
    });

    expect(message).toMatch(/[\u0590-\u05FF]/);
    expect(message).not.toContain("too many requests");
  });
});

describe("isExpectedVerifyFailure", () => {
  const RECOGNISED = [
    WRONG_CODE,
    { code: "otp_expired", message: "Token has expired or is invalid" },
    { code: "over_request_rate_limit", message: "Request rate limit reached" },
    { code: "validation_failed", message: "Invalid phone or token" },
    // No code at all, matched on the message — the older-stack path.
    { code: null, message: "Token has expired or is invalid" },
    { code: null, message: "Too many requests" },
  ];

  /**
   * Recognised, answered in Hebrew, and still nobody's typo. This group is why
   * the predicate can no longer be inferred from whether the sentence differs
   * from the message: on these two it differs, and the answer is still "fault".
   */
  const SYSTEM_WITH_A_SENTENCE = [
    NO_SMS_PROVIDER,
    // A send failure arriving at step 2, via the bypass's `signUp`.
    SMS_PROVIDER_MISSING,
  ];

  const UNRECOGNISED = [
    { code: "unexpected_failure", message: "Database error finding user" },
    { code: null, message: "upstream connect error" },
  ];

  it("calls a mistyped or expired code the person, not the system", () => {
    for (const failure of RECOGNISED) {
      expect(isExpectedVerifyFailure(failure)).toBe(true);
    }
  });

  it("calls a provider that cannot send a fault, however it is worded", () => {
    // Both of these now get Hebrew. Neither may be filed as a typo: a wrong
    // digit and an auth provider that has stopped working must not land in the
    // log at the same weight.
    for (const failure of SYSTEM_WITH_A_SENTENCE) {
      expect(isExpectedVerifyFailure(failure)).toBe(false);
    }
  });

  it("calls anything it does not recognise a fault", () => {
    for (const failure of UNRECOGNISED) {
      expect(isExpectedVerifyFailure(failure)).toBe(false);
    }
  });

  it("never calls the same failure both things at once", () => {
    // The invariant, restated for a classification with two dimensions: every
    // failure belongs to exactly one of the three groups above, and the
    // predicate says "person" for the first and only the first.
    const groups = [
      [RECOGNISED, true],
      [SYSTEM_WITH_A_SENTENCE, false],
      [UNRECOGNISED, false],
    ] as const;

    for (const [failures, expected] of groups) {
      for (const failure of failures) {
        expect(isExpectedVerifyFailure(failure)).toBe(expected);
      }
    }
  });

  it("does not hand a raw English message to a Hebrew screen unnoticed", () => {
    // The two halves of the same rule: when the message shown is the provider's
    // own English, the predicate must say "fault", so the line is recorded.
    // That is now the only case left where English reaches the screen at all.
    for (const failure of UNRECOGNISED) {
      expect(describeVerifyError(failure)).toBe(failure.message);
      expect(isExpectedVerifyFailure(failure)).toBe(false);
    }

    for (const failure of SYSTEM_WITH_A_SENTENCE) {
      expect(describeVerifyError(failure)).not.toBe(failure.message);
    }
  });
});
