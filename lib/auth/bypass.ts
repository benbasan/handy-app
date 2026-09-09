import "server-only";

/**
 * Standing down real OTP delivery, on purpose, for the demo period.
 *
 * Twilio charges **$0.2575 per SMS to Israel** — one of the most expensive
 * destinations on the platform — and WhatsApp is not the escape hatch it looks
 * like: Meta charges per authentication template too, and its Business
 * verification needs a registered company. So until there is a business entity
 * and a reason to pay, this product sends nothing at all and lets a fixed code
 * in. Decided with the user on 9.9.2026; see CLAUDE.md section 9.
 *
 * **The code below is not a security boundary, and nothing should pretend it
 * is.** With `AUTH_BYPASS_OTP=1` anybody who can reach the sign-in action can
 * sign in as any phone number that is not already taken. That is the whole
 * point — "no real verification" is what was asked for — but it is written
 * here plainly so that nobody later mistakes the six digits on the screen for
 * a check that happened.
 *
 * What this deliberately is *not*: a session-forging primitive. `demo.ts`
 * rejected minting sessions with the service-role key, on the grounds that
 * "a forging primitive works for every user id there will ever be", and that
 * reasoning is untouched by this. The bypass holds a password and signs in
 * through GoTrue's ordinary public API, exactly as a browser would; it can
 * only ever reach accounts whose password it set itself. The seeded users have
 * no password, so it cannot reach them at all — they keep using
 * `[auth.sms.test_otp]`, and that is what keeps the admin out of reach.
 */

/**
 * The six digits shown on screen and prefilled into the field.
 *
 * The same digits as `DEMO_OTP`, so there is one number to remember rather
 * than two — the seeded demo users answer to this code through `test_otp`, and
 * everybody else answers to it through the password path below.
 */
export const BYPASS_DISPLAY_CODE = "123456";

/**
 * Tagged onto every account the bypass creates, so they can be told apart from
 * real sign-ups later. Without this the accounts are indistinguishable and
 * `npm run auth:purge-bypass` would have nothing to select on — which is why
 * the tag is written at creation rather than worked out afterwards.
 */
export const BYPASS_CREATED_VIA = "otp_bypass";

/**
 * Is the bypass on?
 *
 * Deliberately not a `NEXT_PUBLIC_` variable. `NEXT_PUBLIC_DEMO_LOGINS` is
 * inlined at build time, so turning it off in the Vercel dashboard changes
 * nothing until the next deploy (CLAUDE.md section 9). This one is read on the
 * server at request time, so unsetting it takes effect immediately — which is
 * the property you want from the switch that governs whether strangers can
 * sign in.
 *
 * Off unless explicitly set to "1": the failure mode of forgetting to set it
 * is a login that refuses, never a site that quietly stands open.
 */
export function otpBypassEnabled(): boolean {
  return process.env.AUTH_BYPASS_OTP === "1";
}

/**
 * The shared password the bypass signs in with. Server-side only, and never
 * logged — it is the actual credential behind every bypass account, while the
 * code on screen is decoration.
 *
 * Null when unset, so the action can refuse loudly rather than fall through to
 * a login that fails for reasons nobody can read.
 */
export function getBypassPassword(): string | null {
  return process.env.AUTH_BYPASS_PASSWORD || null;
}
