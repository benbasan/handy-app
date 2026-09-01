"use server";

import { redirect } from "next/navigation";
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
    return { error: describeAuthError(error.message) };
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
    return { error: describeAuthError(error.message) };
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

/**
 * Supabase returns English strings aimed at developers. Map the handful users
 * actually hit into Hebrew, and pass anything unrecognised through rather than
 * swallowing it — a generic "something went wrong" makes real faults
 * undebuggable.
 */
function describeAuthError(message: string): string {
  const normalized = message.toLowerCase();

  if (normalized.includes("expired")) {
    return "הקוד פג תוקף. בקשו קוד חדש.";
  }
  if (normalized.includes("invalid") || normalized.includes("token")) {
    return "הקוד שהוזן שגוי. בדקו ונסו שוב.";
  }
  if (normalized.includes("rate") || normalized.includes("too many")) {
    return "נשלחו יותר מדי בקשות. המתינו דקה ונסו שוב.";
  }
  if (normalized.includes("sms") || normalized.includes("provider")) {
    return "שליחת ה-SMS נכשלה. ודאו שספק ה-SMS מוגדר (ראו README).";
  }

  return message;
}
