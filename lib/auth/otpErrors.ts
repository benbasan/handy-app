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
 *
 * Step 2 then needs a second dimension, because the bypass moved account
 * creation into it (lib/actions/auth.ts, `signInWithoutDelivery`). A `signUp`
 * against an auth server whose phone confirmations are on answers "Unable to
 * get SMS provider" — a sentence about *sending*, arriving at the step that
 * verifies. So a verify failure is classified twice over: what to say, and
 * whose fault it is. See `classifyVerifyError`.
 */

/** The shape both functions need — `AuthError` satisfies it structurally. */
export type SupabaseAuthFailure = {
  code?: string | null;
  message: string;
};

const TOO_MANY_REQUESTS = "נשלחו יותר מדי בקשות. המתינו דקה ונסו שוב.";

/**
 * The auth server could not do its job. Deliberately the same sentence
 * `signInWithoutDelivery` already shows when the bypass is switched on with no
 * password behind it (lib/actions/auth.ts): both are one person's problem to
 * fix, and neither is the caller's.
 */
const SERVER_MISCONFIGURED = "ההתחברות אינה מוגדרת כראוי בשרת. פנו לתמיכה.";

/**
 * Whether a failure is the SMS provider rather than the person.
 *
 * One definition, read by both steps. GoTrue says this three ways — a
 * `sms_send_failed` code, a `phone_provider_disabled` code, and, when it could
 * not even construct a provider to try with, a 500 carrying no useful code at
 * all and the prose "Unable to get SMS provider".
 */
function namesTheSmsProvider(error: SupabaseAuthFailure): boolean {
  if (
    error.code === "sms_send_failed" ||
    error.code === "phone_provider_disabled"
  ) {
    return true;
  }

  const normalized = error.message.toLowerCase();
  return normalized.includes("sms") || normalized.includes("provider");
}

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

  // `[auth.sms] max_frequency` in supabase/config.toml — one code per number
  // per minute. GoTrue answers it with "you can only request this after 41
  // seconds" and no error code at all, so before this branch existed the
  // sentence fell through to `error.message` and a Hebrew screen showed raw
  // English. e2e/helpers.ts is where that string was first seen, and it still
  // parses the same number to wait it out.
  //
  // Before the generic rate check below, which would otherwise swallow it and
  // drop the one useful fact: how long.
  const seconds = /after (\d+) seconds?/i.exec(normalized)?.[1];
  if (seconds) {
    return `אפשר לבקש קוד חדש לאותו מספר פעם בדקה. נסו שוב בעוד ${seconds} שניות.`;
  }

  if (normalized.includes("rate") || normalized.includes("too many")) {
    return TOO_MANY_REQUESTS;
  }
  if (namesTheSmsProvider(error)) {
    return smsUnavailable;
  }
  return error.message;
}

/**
 * Step 2: exchanging a code for a session — what to say, and whose fault it is.
 *
 * Two answers rather than one because the caller needs both and they do not
 * follow from each other. A mistyped code and a broken auth provider are both
 * answered in Hebrew; only one of them belongs in the log as a fault.
 *
 * `kind` is the whole point:
 *
 *  - "person" — a mistyped code, an expired one, six digits that were not six
 *    digits, a rate limit. Ordinary, and a warning at most.
 *  - "system" — nothing the person at the keyboard did. Either recognised, and
 *    answered in Hebrew, or unrecognised, in which case the message is passed
 *    through as GoTrue wrote it. Raw English on a Hebrew screen is a poor
 *    outcome, but a *silent* one is worse: the passthrough is what makes an
 *    unknown failure visible instead of disguised as a typo.
 *
 * GoTrue answers a mistyped code and an expired one with the same
 * `otp_expired` / "Token has expired or is invalid", so the Hebrew says both
 * rather than guessing at which one it was.
 */
type VerifyFailure = {
  message: string;
  kind: "person" | "system";
};

const WRONG_OR_EXPIRED = "הקוד שגוי או שפג תוקפו. בקשו קוד חדש ונסו שוב.";

function classifyVerifyError(error: SupabaseAuthFailure): VerifyFailure {
  /*
   * Before everything, and that ordering is the fix rather than an accident.
   *
   * Since the bypass creates accounts at this step, a *send* failure can now
   * arrive here — and GoTrue's send prose is "Error sending confirmation OTP to
   * provider: Authentication Error - invalid username". The word "invalid" in
   * it matches the mistyped-code rule below, which would tell somebody who
   * typed the right six digits that they got them wrong. That is the same bug
   * this module's header describes, one step further along.
   */
  if (namesTheSmsProvider(error) || error.code === "phone_not_confirmed") {
    return { message: SERVER_MISCONFIGURED, kind: "system" };
  }

  switch (error.code) {
    case "otp_expired":
      return { message: WRONG_OR_EXPIRED, kind: "person" };
    case "over_request_rate_limit":
      return { message: TOO_MANY_REQUESTS, kind: "person" };
    case "validation_failed":
      return {
        message: "קוד האימות הוא 6 ספרות. בדקו ונסו שוב.",
        kind: "person",
      };
  }

  const normalized = error.message.toLowerCase();
  if (
    normalized.includes("expired") ||
    normalized.includes("invalid") ||
    normalized.includes("token")
  ) {
    return { message: WRONG_OR_EXPIRED, kind: "person" };
  }
  if (normalized.includes("rate") || normalized.includes("too many")) {
    return { message: TOO_MANY_REQUESTS, kind: "person" };
  }

  return { message: error.message, kind: "system" };
}

/** What the person is told. */
export function describeVerifyError(error: SupabaseAuthFailure): string {
  return classifyVerifyError(error).message;
}

/**
 * Whether a failed verification is the person at the keyboard rather than the
 * system.
 *
 * Derived from the same classification rather than restating its list, because
 * a second copy of that list is a second thing to keep in step. It reads the
 * field that means it — it used to infer this from whether the Hebrew differed
 * from the message it was given, which was true only while every recognised
 * failure was the person's. `SERVER_MISCONFIGURED` is the counter-example:
 * recognised, answered in Hebrew, and nobody's typo.
 *
 * The sign-in action uses this to decide whether a failure deserves an error
 * line. Without the distinction, every wrong digit a customer types would land
 * in the log at the same weight as an auth provider that has stopped working.
 */
export function isExpectedVerifyFailure(error: SupabaseAuthFailure): boolean {
  return classifyVerifyError(error).kind === "person";
}
