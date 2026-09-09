"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  describeSendError,
  describeVerifyError,
  isExpectedVerifyFailure,
} from "@/lib/auth/otpErrors";
import { DEMO_OTP, DEMO_USERS, demoLoginsEnabled } from "@/lib/demo";
import { logExpectedRefusal, logServerError } from "@/lib/observability";
import { MARKETING_ROUTES, ROLE_HOME } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/supabase/session";
import { normalizeIsraeliMobile } from "@/lib/validation/auth";
import { demoLoginSchema } from "@/lib/validation/demo";

export type DemoLoginState = {
  error?: string;
};

/**
 * Sign in as one of the four seeded demo users — see lib/demo.ts for what this
 * is and what it costs.
 *
 * It goes through the ordinary OTP path rather than around it: request a code,
 * exchange it, let `verifyOtp`'s own rules apply. The alternative was minting a
 * session with the service-role key, and that was rejected on purpose — this
 * repo reads `SUPABASE_SERVICE_ROLE_KEY` nowhere today, GoTrue has no
 * "issue a session for user X" endpoint for phone accounts, and a
 * session-forging primitive sitting in the codebase would be a far worse thing
 * to own than a publicly-known OTP. The OTP works for seven seeded numbers; a
 * forging primitive works for every user id there will ever be.
 *
 * That still holds. `lib/auth/bypass.ts` later made sign-in far wider than
 * this — any phone number, one fixed code — but it did it without reversing
 * the decision above: it holds a password and signs in through GoTrue's
 * ordinary public API, so it can only ever reach accounts whose password it
 * set itself. These four have none, which is why the bypass cannot touch them.
 */
export async function signInAsDemoUser(
  _prevState: DemoLoginState,
  formData: FormData,
): Promise<DemoLoginState> {
  // First, before the schema and before any client is built. The panel not
  // rendering is not a gate — a server action is callable by anyone holding
  // its id — so this is the gate. Nothing failed, so nothing is logged.
  if (!demoLoginsEnabled()) {
    return { error: "כניסת הדמו מושבתת בשרת." };
  }

  const parsed = demoLoginSchema.safeParse({ user: formData.get("user") });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "קלט לא תקין" };
  }

  const key = parsed.data.user;
  const demo = DEMO_USERS[key];
  const phone = normalizeIsraeliMobile(demo.phone);

  if (!phone) {
    // Unreachable while tests/demoUsers.test.ts passes, which is exactly why it
    // is worth a line rather than a `!`: if it ever fires, the roster has a
    // typo in it and the audit that should have caught it has been removed.
    logServerError(
      "demo.signInAsDemoUser",
      new Error("unparseable demo phone"),
      {
        demoUser: key,
      },
    );
    return { error: "מספר הדמו אינו תקין. בדקו את lib/demo.ts." };
  }

  const supabase = await createClient();

  // Switching identity mid-demo is the main motion, and a leftover session
  // makes what happens next depend on what happened before.
  await supabase.auth.signOut({ scope: "local" });

  const { error: sendError } = await supabase.auth.signInWithOtp({
    phone,
    // This may never bring an account into existence. The keys resolve only to
    // seeded numbers, but the flag says so out loud regardless.
    options: { shouldCreateUser: false },
  });

  if (sendError) {
    // The commonest failure here by far is `[auth.sms] max_frequency` — one
    // code per number per minute — which is why describeSendError now names
    // the wait in Hebrew. Still an error rather than a refusal: nothing the
    // person did caused it.
    logServerError("demo.signInAsDemoUser.send", sendError, { demoUser: key });
    return { error: describeSendError(sendError) };
  }

  const { error: verifyError } = await supabase.auth.verifyOtp({
    phone,
    token: DEMO_OTP,
    type: "sms",
  });

  if (verifyError) {
    const record = isExpectedVerifyFailure(verifyError)
      ? logExpectedRefusal
      : logServerError;
    record("demo.signInAsDemoUser.verify", verifyError, { demoUser: key });
    return { error: describeVerifyError(verifyError) };
  }

  // Once, and only after the exchange. `getCurrentUser` is wrapped in React's
  // `cache`, so a call made earlier in this request would have memoised the
  // *previous* identity and handed it back here — sending an admin to /account
  // and leaving the console one bounce away.
  const user = await getCurrentUser();

  if (!user) {
    return {
      error: "ההתחברות הצליחה אך לא נמצא פרופיל מתאים. נסו שוב או פנו לתמיכה.",
    };
  }

  // The panel's own label is never consulted. Where this lands comes from the
  // freshly-read `profiles.role`, the same rule verifyOtp follows — so a seed
  // that has drifted shows the truth rather than a screen the caller bounces
  // straight off.
  revalidatePath("/", "layout");
  redirect(ROLE_HOME[user.role]);
}

/**
 * "חזרה לתצוגת אורח" — sign out and land back on the page being demonstrated.
 *
 * `signOut` in lib/actions/auth.ts redirects to `/login`, which is right for
 * somebody leaving and wrong mid-demo: showing what an anonymous visitor sees
 * should not put a login form on the screen.
 */
export async function leaveDemoSession(): Promise<void> {
  if (!demoLoginsEnabled()) redirect(MARKETING_ROUTES.home);

  const supabase = await createClient();
  await supabase.auth.signOut();

  revalidatePath("/", "layout");
  redirect(MARKETING_ROUTES.home);
}
