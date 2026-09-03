"use server";

import { redirect } from "next/navigation";
import { describeSendError, describeVerifyError } from "@/lib/auth/otpErrors";
import { ROLE_HOME, ROLE_LOGIN } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/supabase/session";
import { requestOtpSchema, verifyOtpSchema } from "@/lib/validation/auth";

export type RequestOtpState = {
  /** The E.164 number the code went to. Present only on success. */
  sentTo?: string;
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
  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithOtp({
    phone,
    options: {
      shouldCreateUser: true,
      data: { role, ...(fullName ? { full_name: fullName } : {}) },
    },
  });

  if (error) {
    // The developer-facing detail never reaches the browser, and without it a
    // provider misconfiguration is invisible in the server log too.
    console.error("[auth] signInWithOtp failed", {
      code: error.code,
      status: error.status,
      message: error.message,
    });
    return { error: describeSendError(error) };
  }

  return { sentTo: phone };
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
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "קלט לא תקין" };
  }

  const supabase = await createClient();

  const { error } = await supabase.auth.verifyOtp({
    phone: parsed.data.phone,
    token: parsed.data.token,
    type: "sms",
  });

  if (error) {
    return { error: describeVerifyError(error) };
  }

  const user = await getCurrentUser();

  if (!user) {
    return {
      error: "ההתחברות הצליחה אך לא נמצא פרופיל מתאים. נסו שוב או פנו לתמיכה.",
    };
  }

  redirect(ROLE_HOME[user.role]);
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect(ROLE_LOGIN.customer);
}
