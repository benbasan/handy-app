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

  const UNRECOGNISED = [
    { code: "unexpected_failure", message: "Database error finding user" },
    { code: null, message: "upstream connect error" },
  ];

  it("calls a mistyped or expired code the person, not the system", () => {
    for (const failure of RECOGNISED) {
      expect(isExpectedVerifyFailure(failure)).toBe(true);
    }
  });

  it("calls anything it does not recognise a fault", () => {
    for (const failure of UNRECOGNISED) {
      expect(isExpectedVerifyFailure(failure)).toBe(false);
    }
  });

  it("agrees with describeVerifyError on every input, by construction", () => {
    for (const failure of [...RECOGNISED, ...UNRECOGNISED]) {
      expect(isExpectedVerifyFailure(failure)).toBe(
        describeVerifyError(failure) !== failure.message,
      );
    }
  });

  it("does not hand a raw English message to a Hebrew screen unnoticed", () => {
    // The two halves of the same rule: when the predicate says "fault", the
    // message shown is the provider's own English. That is acceptable only
    // because the fault is now recorded — before, it was neither.
    for (const failure of UNRECOGNISED) {
      expect(describeVerifyError(failure)).toBe(failure.message);
    }
  });
});
