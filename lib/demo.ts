import { normalizeIsraeliMobile, type UserRole } from "@/lib/validation/auth";

/**
 * The seeded users the landing page's demo panel can sign in as, and the flag
 * that decides whether that panel exists at all.
 *
 * **This is demo tooling, not a product feature.** It is not in
 * docs/roadmap.md and it is not a phase's work; CLAUDE.md section 3 opens by
 * saying to build exactly what the current phase asks for, and this is named
 * here as an exception rather than smuggled in as one.
 *
 * What it does to the standing risk in CLAUDE.md section 9 is the reason the
 * flag is not optional. The seven seeded numbers and the fixed `123456` are
 * already live credentials on the deployed site — `supabase config push` sends
 * `[auth.sms.test_otp]` to the hosted project — but reaching the admin console
 * today means finding the URL *and* guessing that the number is
 * `972500000005`. A panel on the home page removes the guess. The credentials
 * are unchanged; the obscurity that was the only thing protecting them is not.
 *
 * So: `demoLoginsEnabled()` is checked in `lib/actions/demo.ts` on the server
 * before anything happens, not merely used to hide a button. A server action is
 * callable by anyone who has its id, whether or not the control that calls it
 * was rendered.
 */

/**
 * The code every seeded number answers to, from `[auth.sms.test_otp]` in
 * supabase/config.toml. tests/demoUsers.test.ts reads that file and fails if
 * this drifts from it.
 */
export const DEMO_OTP = "123456";

export const DEMO_USER_KEYS = [
  "customer",
  "proVerified",
  "proPending",
  "admin",
] as const;

export type DemoUserKey = (typeof DEMO_USER_KEYS)[number];

export type DemoUser = {
  /** As a person would type it. `normalizeIsraeliMobile` canonicalises it. */
  phone: string;
  /** Exactly the `full_name` supabase/seed.sql writes, so the screen and the database agree. */
  name: string;
  /** What `profiles.role` resolves to — never used to route; see lib/actions/demo.ts. */
  role: UserRole;
  /** What this account is worth showing, as the second line on its button. */
  note: string;
};

/**
 * Four of the seven seeded users: one of each state worth demonstrating.
 *
 * יוסי כהן, מוסא חדד and אלכס פרידמן are left out deliberately — they exist so
 * that דנה לוי's job carries three competing offers, which makes them scenery
 * for the demo rather than places to stand in it.
 */
export const DEMO_USERS: Record<DemoUserKey, DemoUser> = {
  customer: {
    phone: "050-0000001",
    name: "דנה לוי",
    role: "customer",
    note: "לקוחה — קריאה פתוחה עם שלוש הצעות, מעקב וקבלה",
  },
  proVerified: {
    phone: "050-0000003",
    name: "דוד מזרחי",
    role: "pro",
    note: "בעל מקצוע מאומת — פיד הקריאות, הגשת הצעה וסגירת עבודה",
  },
  proPending: {
    phone: "050-0000004",
    name: "אבי פרץ",
    role: "pro",
    note: "בעל מקצוע ממתין לאימות — הפיד חסום עד שמנהל מאשר",
  },
  admin: {
    // Seeded as a customer and promoted by an UPDATE twenty lines further down
    // supabase/seed.sql, because `handle_new_user` whitelists a requested role
    // down to customer/pro and admin is never self-assignable. The claim that
    // this row is an admin rests on that UPDATE, which is why
    // tests/demoUsers.test.ts asserts it by uuid rather than trusting the line.
    phone: "050-0000005",
    name: "מנהלת Handy",
    role: "admin",
    note: "מנהלת מערכת — לוח הניהול, אישור בעלי מקצוע והכרעת מחלוקות",
  },
};

/**
 * Whether the demo panel exists.
 *
 * The `=== "1"` opt-in shape is `mapsFallbackAllowed()` in lib/maps/config.ts,
 * and `process.env` is read here rather than passed in because Next substitutes
 * `NEXT_PUBLIC_*` textually at build time — which also means unsetting it needs
 * a redeploy, not a dashboard toggle. There is no runtime switch.
 */
export function demoLoginsEnabled(): boolean {
  return process.env.NEXT_PUBLIC_DEMO_LOGINS === "1";
}

/**
 * Which demo user a signed-in person is, if any — so the panel can disable the
 * button for the account already in use.
 *
 * The two sources spell the same number differently and it is easy to miss:
 * `profiles.phone` carries what `auth.users.phone` stores, which is E.164 with
 * the `+` stripped (`972500000001`), while `normalizeIsraeliMobile` returns it
 * with the `+` on (`+972500000001`). Comparing them raw never matches, and the
 * symptom is silent — every button stays enabled and nothing looks broken.
 */
export function demoKeyForPhone(
  profilePhone: string | null | undefined,
): DemoUserKey | null {
  if (!profilePhone) return null;

  const bare = (value: string) => value.replace(/^\+/, "");
  const target = bare(profilePhone.trim());

  return (
    DEMO_USER_KEYS.find((key) => {
      const canonical = normalizeIsraeliMobile(DEMO_USERS[key].phone);
      return canonical !== null && bare(canonical) === target;
    }) ?? null
  );
}
