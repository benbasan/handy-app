import { z } from "zod";

/** Every role the `profiles.role` check constraint allows. */
export const USER_ROLES = ["customer", "pro", "admin"] as const;
export type UserRole = (typeof USER_ROLES)[number];

/**
 * Roles a visitor may request for themselves at sign-up.
 *
 * `admin` is absent on purpose, and this list is only the client-side half of
 * that rule — the real gate is the whitelist in `handle_new_user`, because
 * whatever is passed here arrives at the database as untrusted user metadata.
 */
export const SIGNUP_ROLES = ["customer", "pro"] as const;
export type SignupRole = (typeof SIGNUP_ROLES)[number];

export function isUserRole(value: string): value is UserRole {
  return (USER_ROLES as readonly string[]).includes(value);
}

// Israeli mobile numbers are 05X plus seven digits. Landlines (02, 03, 04, 08,
// 09) are rejected: the product's whole auth story is an SMS to a handset.
const LOCAL_FORM = /^05\d{8}$/; // 0501234567
const NATIONAL_FORM = /^9725\d{8}$/; // 972501234567
const E164_FORM = /^\+9725\d{8}$/; // +972501234567

/**
 * Accepts the shapes people actually type — with dashes, spaces, brackets, a
 * leading zero or a country code — and returns one canonical E.164 string, or
 * null if it is not an Israeli mobile number.
 *
 * Canonicalising matters beyond tidiness: Supabase keys the user record on the
 * phone number, so `050-1234567` and `+972501234567` reaching the database as
 * different strings would be two accounts for one person.
 */
export function normalizeIsraeliMobile(input: string): string | null {
  const compact = input.replace(/[\s\-().‎‏]/g, "");

  if (LOCAL_FORM.test(compact)) return `+972${compact.slice(1)}`;
  if (NATIONAL_FORM.test(compact)) return `+${compact}`;
  if (E164_FORM.test(compact)) return compact;

  return null;
}

const israeliMobile = z
  .string()
  .trim()
  .min(1, { error: "יש להזין מספר טלפון" })
  .refine((value) => normalizeIsraeliMobile(value) !== null, {
    error: "מספר טלפון נייד ישראלי לא תקין. לדוגמה: 050-1234567",
  })
  // Safe: the refine above already rejected everything that returns null.
  .transform((value) => normalizeIsraeliMobile(value) as string);

export const requestOtpSchema = z.object({
  phone: israeliMobile,
  role: z.enum(SIGNUP_ROLES, { error: "תפקיד לא חוקי" }),
  fullName: z
    .string()
    .trim()
    .max(80, { error: "השם ארוך מדי" })
    .optional()
    .transform((value) => (value === "" ? undefined : value)),
});

export const verifyOtpSchema = z.object({
  phone: israeliMobile,
  token: z
    .string()
    .trim()
    .regex(/^\d{6}$/, { error: "קוד האימות מורכב מ-6 ספרות" }),
});

/**
 * `+972501234567` back to the `050-1234567` a Hebrew speaker expects to see.
 *
 * The leading `+` is optional, because the two sources disagree: our own
 * schemas emit E.164, while `auth.users.phone` — and therefore
 * `profiles.phone` — stores the same number with the `+` stripped. Anything
 * that isn't an Israeli mobile is returned untouched rather than mangled.
 */
export function formatIsraeliMobile(phone: string): string {
  const match = /^\+?972(5\d)(\d{3})(\d{4})$/.exec(phone.trim());
  if (!match) return phone;
  return `0${match[1]}-${match[2]}${match[3]}`;
}
