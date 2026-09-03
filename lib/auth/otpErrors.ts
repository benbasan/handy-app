/**
 * Turning Supabase auth failures into Hebrew, one step of the OTP flow at a
 * time.
 *
 * These were one shared function, matched against the English prose Supabase
 * returns. A new phone number on a machine with no SMS provider fails to
 * *send* with "Error sending confirmation OTP to provider: Authentication
 * Error - invalid username", the word "invalid" matched the rule meant for a
 * mistyped code, and the user was told "הקוד שהוזן שגוי" on the screen that
 * has no code field yet — having never been asked for one.
 *
 * Two things keep that from coming back. The steps have separate functions, so
 * a failure to send cannot reach for a sentence about a code that was never
 * entered; and both read `error.code`, which is a stable identifier, in
 * preference to a message written for developers and free to change.
 */

/** The shape both functions need — `AuthError` satisfies it structurally. */
export type SupabaseAuthFailure = {
  code?: string | null;
  message: string;
};

const TOO_MANY_REQUESTS = "נשלחו יותר מדי בקשות. המתינו דקה ונסו שוב.";

/**
 * Step 1: asking for a code.
 *
 * Every branch describes sending. None of them mentions the code itself.
 */
export function describeSendError(
  error: SupabaseAuthFailure,
  { isProduction = process.env.NODE_ENV === "production" } = {},
): string {
  // Outside production this is nearly always the same thing — a number that is
  // not one of the seeded demo numbers, on a stack with no Twilio credentials.
  // Naming it saves the next person the half hour this cost.
  const smsUnavailable = isProduction
    ? "שליחת קוד האימות נכשלה. נסו שוב בעוד רגע, ואם זה חוזר פנו לתמיכה."
    : "שליחת ה-SMS נכשלה: ספק ה-SMS אינו מוגדר. בפיתוח מקומי רק מספרי הדמו שב-README מקבלים קוד (הקוד שלהם הוא 123456).";

  switch (error.code) {
    case "sms_send_failed":
      return smsUnavailable;
    case "over_sms_send_rate_limit":
    case "over_request_rate_limit":
      return TOO_MANY_REQUESTS;
    case "validation_failed":
      return "מספר הטלפון אינו תקין. בדקו ונסו שוב.";
    case "signup_disabled":
      return "ההרשמה סגורה כרגע.";
    case "phone_provider_disabled":
      return smsUnavailable;
  }

  // Older stacks, and anything that arrives without a code.
  const normalized = error.message.toLowerCase();
  if (normalized.includes("rate") || normalized.includes("too many")) {
    return TOO_MANY_REQUESTS;
  }
  if (normalized.includes("sms") || normalized.includes("provider")) {
    return smsUnavailable;
  }
  return error.message;
}

/**
 * Step 2: exchanging a code for a session.
 *
 * GoTrue answers a mistyped code and an expired one with the same
 * `otp_expired` / "Token has expired or is invalid", so the Hebrew says both
 * rather than guessing at which one it was.
 */
export function describeVerifyError(error: SupabaseAuthFailure): string {
  switch (error.code) {
    case "otp_expired":
      return "הקוד שגוי או שפג תוקפו. בקשו קוד חדש ונסו שוב.";
    case "over_request_rate_limit":
      return TOO_MANY_REQUESTS;
    case "validation_failed":
      return "קוד האימות הוא 6 ספרות. בדקו ונסו שוב.";
  }

  const normalized = error.message.toLowerCase();
  if (
    normalized.includes("expired") ||
    normalized.includes("invalid") ||
    normalized.includes("token")
  ) {
    return "הקוד שגוי או שפג תוקפו. בקשו קוד חדש ונסו שוב.";
  }
  if (normalized.includes("rate") || normalized.includes("too many")) {
    return TOO_MANY_REQUESTS;
  }
  return error.message;
}
