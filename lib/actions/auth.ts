"use server";

import { redirect } from "next/navigation";
import { optional } from "@/lib/actions/formData";
import {
  BYPASS_CREATED_VIA,
  BYPASS_DISPLAY_CODE,
  getBypassPassword,
  otpBypassEnabled,
} from "@/lib/auth/bypass";
import {
  describeSendError,
  describeVerifyError,
  isExpectedVerifyFailure,
} from "@/lib/auth/otpErrors";
import { logExpectedRefusal, logServerError } from "@/lib/observability";
import { ROLE_HOME, ROLE_LOGIN } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/supabase/session";
import { requestOtpSchema, verifyOtpSchema } from "@/lib/validation/auth";
import type { z } from "zod";

export type RequestOtpState = {
  /** The E.164 number the code went to. Present only on success. */
  sentTo?: string;
  /**
   * Real delivery is stood down (lib/auth/bypass.ts). Nothing was sent, and
   * `code` is the value the next step will accept — the screen shows it rather
   * than claiming an SMS is on its way.
   */
  bypass?: boolean;
  code?: string;
  /**
   * Carried to the second step so the bypass can create the account with the
   * name that was typed. The ordinary path created the user already and
   * ignores it. It came from this browser in the first place, so returning it
   * discloses nothing.
   */
  fullName?: string;
  error?: string;
};

export type VerifyOtpState = {
  error?: string;
};

/**
 * Step 1: send an SMS code.
 *
 * The role travels along as user metadata, which `handle_new_user` reads when
 * it creates the profile. That metadata is untrusted by definition — anything
 * the browser puts in it arrives verbatim — so the database whitelists it down
 * to customer/pro. Nothing here can mint an admin.
 *
 * The role is also only consulted the first time a phone number is seen. A
 * returning user keeps the role they signed up with, whichever login page they
 * happen to use.
 */
export async function requestOtp(
  _prevState: RequestOtpState,
  formData: FormData,
): Promise<RequestOtpState> {
  const parsed = requestOtpSchema.safeParse({
    phone: formData.get("phone"),
    role: formData.get("role"),
    fullName: formData.get("fullName") ?? undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "קלט לא תקין" };
  }

  const { phone, role, fullName } = parsed.data;
  const bypassing = otpBypassEnabled();
  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithOtp({
    phone,
    options: {
      /*
       * While bypassing, this call exists only so that a *seeded* number comes
       * away with the pending code `[auth.sms.test_otp]` answers — it must not
       * create anybody.
       *
       * Leaving it true was a real bug, caught by driving the screens: GoTrue
       * creates the user here, before a code has been typed at all, so a
       * stranger who asked for a code and then walked away left an account
       * behind — and a wrong code created one just the same. Worse, that
       * account arrives with no password and no `created_via` tag, which makes
       * it simultaneously unable to sign in through the bypass and invisible
       * to `npm run auth:purge-bypass`. The bypass creates its own users, in
       * `verifyOtp`, once a code has actually been entered.
       */
      shouldCreateUser: !bypassing,
      data: { role, ...(fullName ? { full_name: fullName } : {}) },
    },
  });
  if (error) {
    if (bypassing) {
      // Expected, for every number that is not seeded: there is no SMS
      // provider to fail over to. It is a refusal rather than an error because
      // the product has an answer for it — the password path in `verifyOtp`.
      logExpectedRefusal("auth.requestOtp.bypass", error, { role });
      return {
        sentTo: phone,
        bypass: true,
        code: BYPASS_DISPLAY_CODE,
        fullName,
      };
    }

    // The developer-facing detail never reaches the browser, and without it a
    // provider misconfiguration is invisible in the server log too. Always an
    // error rather than a refusal: a code that could not be sent is never the
    // person's doing.
    //
    // No phone number in the line. It is the one field this action handles,
    // and it identifies a human being.
    logServerError("auth.requestOtp", error, { role });
    return { error: describeSendError(error) };
  }

  return bypassing
    ? { sentTo: phone, bypass: true, code: BYPASS_DISPLAY_CODE, fullName }
    : { sentTo: phone };
}

/**
 * Step 2: exchange the code for a session.
 *
 * The landing page comes from the freshly-read `profiles.role`, never from the
 * submitted form. Trusting the form here would hand back exactly the privilege
 * escalation the database whitelist just prevented.
 */
export async function verifyOtp(
  _prevState: VerifyOtpState,
  formData: FormData,
): Promise<VerifyOtpState> {
  const parsed = verifyOtpSchema.safeParse({
    phone: formData.get("phone"),
    token: formData.get("token"),
    role: optional(formData.get("role")),
    fullName: optional(formData.get("fullName")),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "קלט לא תקין" };
  }

  const supabase = await createClient();

  const outcome = otpBypassEnabled()
    ? await signInWithoutDelivery(supabase, parsed.data)
    : await signInWithDeliveredCode(supabase, parsed.data);

  if (outcome.error) return outcome;

  const user = await getCurrentUser();

  if (!user) {
    return {
      error: "ההתחברות הצליחה אך לא נמצא פרופיל מתאים. נסו שוב או פנו לתמיכה.",
    };
  }

  redirect(ROLE_HOME[user.role]);
}

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;
type VerifyInput = z.infer<typeof verifyOtpSchema>;

/**
 * The ordinary path: a code that was actually delivered, checked by GoTrue.
 */
async function signInWithDeliveredCode(
  supabase: SupabaseServerClient,
  { phone, token }: VerifyInput,
): Promise<VerifyOtpState> {
  const { error } = await supabase.auth.verifyOtp({
    phone,
    token,
    type: "sms",
  });

  if (error) {
    // A wrong or expired code is the overwhelming majority of failures here
    // and is not a fault; anything GoTrue answers with that this app does not
    // recognise is.
    const record = isExpectedVerifyFailure(error)
      ? logExpectedRefusal
      : logServerError;
    record("auth.verifyOtp", error, {});
    return { error: describeVerifyError(error) };
  }

  return {};
}

/**
 * The bypass path — see lib/auth/bypass.ts for why this exists and what it
 * costs. Nothing was sent, so nothing is being checked: the six digits are
 * compared for the sake of the screen, and the real credential is a password
 * this server holds.
 *
 * Three outcomes, in the order they are tried:
 *
 *  1. The number already has the bypass password — a returning tester. Signed
 *     straight in.
 *  2. The number is unknown. `signUp` creates it *already confirmed*, because
 *     `[auth.sms] enable_confirmations = false`, and hands back a session with
 *     no message sent and no service-role key involved.
 *  3. The number is taken but has no password — that is a seeded user, whose
 *     code lives in `[auth.sms.test_otp]`. Handed back to the ordinary path,
 *     which is what keeps the admin and the demo panel signing in.
 *
 * Case 3 is why the bypass cannot reach the admin: it can only ever sign in to
 * accounts whose password it set itself.
 */
async function signInWithoutDelivery(
  supabase: SupabaseServerClient,
  { phone, token, role, fullName }: VerifyInput,
): Promise<VerifyOtpState> {
  if (token !== BYPASS_DISPLAY_CODE) {
    return { error: "הקוד שהוזן שגוי." };
  }

  const password = getBypassPassword();

  if (!password) {
    // A misconfiguration, not a refusal: the switch is on and the credential
    // behind it is missing, so every sign-in would fail for a reason nobody
    // could read off the screen.
    logServerError(
      "auth.verifyOtp.bypass",
      new Error("AUTH_BYPASS_OTP=1 but AUTH_BYPASS_PASSWORD is unset"),
      { role: role ?? null },
    );
    return { error: "ההתחברות אינה מוגדרת כראוי בשרת. פנו לתמיכה." };
  }

  const returning = await supabase.auth.signInWithPassword({ phone, password });

  if (!returning.error) return {};

  if (returning.error.code !== "invalid_credentials") {
    logServerError("auth.verifyOtp.bypass.signIn", returning.error, {
      role: role ?? null,
    });
    return { error: describeVerifyError(returning.error) };
  }

  const created = await supabase.auth.signUp({
    phone,
    password,
    options: {
      data: {
        role: role ?? "customer",
        created_via: BYPASS_CREATED_VIA,
        ...(fullName ? { full_name: fullName } : {}),
      },
    },
  });

  if (!created.error) return {};

  if (created.error.code === "user_already_exists") {
    return signInWithDeliveredCode(supabase, { phone, token, role, fullName });
  }

  logServerError("auth.verifyOtp.bypass.signUp", created.error, {
    role: role ?? null,
  });
  return { error: describeVerifyError(created.error) };
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect(ROLE_LOGIN.customer);
}
