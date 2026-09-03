import path from "node:path";

/**
 * The seeded demo users (supabase/seed.sql), addressed the way a person is:
 * by the phone number they type into the login screen.
 *
 * The code is the same for all of them because supabase/config.toml maps these
 * exact numbers under `[auth.sms.test_otp]` — which is what lets the whole
 * phone-login flow run end to end with no SMS provider attached. Keep the two
 * lists in step.
 */
export const OTP_CODE = "123456";

export type DemoUserKey = "customer" | "customerB" | "pro" | "admin";

export const DEMO_USERS: Record<
  DemoUserKey,
  { phone: string; name: string; loginPath: string; home: string }
> = {
  customer: {
    phone: "050-0000001",
    name: "דנה לוי",
    loginPath: "/login",
    home: "/account",
  },
  customerB: {
    phone: "050-0000002",
    name: "יוסי כהן",
    loginPath: "/login",
    home: "/account",
  },
  pro: {
    phone: "050-0000003",
    name: "דוד מזרחי",
    loginPath: "/pro/login",
    home: "/pro/dashboard",
  },
  admin: {
    phone: "050-0000005",
    name: "מנהלת Handy",
    loginPath: "/admin/login",
    home: "/admin",
  },
};

/** Where auth.setup.ts parks each user's cookies. Git-ignored. */
export function storageStatePath(key: DemoUserKey): string {
  // Resolved from the repo root, which is where Playwright always runs.
  return path.join(process.cwd(), "e2e", ".auth", `${key}.json`);
}
