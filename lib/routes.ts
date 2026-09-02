import type { SignupRole, UserRole } from "@/lib/validation/auth";

/**
 * Where each role lives.
 *
 * URL layout: the customer is the product's primary audience and sits at the
 * root, pros and admins are prefixed. Route groups (`(customer)`, `(pro)`,
 * `(admin)`) contribute no path segment of their own, so without these
 * prefixes every group would be competing for `/login`.
 *
 * This module deliberately imports nothing from `next/headers` or the Supabase
 * server client: `proxy.ts` needs these constants too, and it runs before the
 * request reaches the app.
 */
export const ROLE_HOME: Record<UserRole, string> = {
  customer: "/account",
  pro: "/pro",
  admin: "/admin",
};

export const ROLE_LOGIN: Record<UserRole, string> = {
  customer: "/login",
  pro: "/pro/login",
  admin: "/admin/login",
};

export const SIGNUP_ROLE_LABEL: Record<SignupRole, string> = {
  customer: "לקוח",
  pro: "בעל מקצוע",
};

export const USER_ROLE_LABEL: Record<UserRole, string> = {
  customer: "לקוח",
  pro: "בעל מקצוע",
  admin: "מנהל מערכת",
};

const PROTECTED_AREAS: ReadonlyArray<{ prefix: string; login: string }> = [
  { prefix: ROLE_HOME.customer, login: ROLE_LOGIN.customer },
  // Posting a job sits outside /account but is just as signed-in: a customer
  // registers on the way to their first job (product-spec.md section 2).
  { prefix: "/new-request", login: ROLE_LOGIN.customer },
  { prefix: ROLE_HOME.pro, login: ROLE_LOGIN.pro },
  { prefix: ROLE_HOME.admin, login: ROLE_LOGIN.admin },
];

/**
 * The login page an anonymous visitor to `pathname` should be sent to, or null
 * if the path is public. Login pages themselves are public, which is why they
 * are checked before the prefix match — `/pro/login` sits under `/pro`.
 */
export function loginPathFor(pathname: string): string | null {
  if (Object.values(ROLE_LOGIN).includes(pathname)) return null;

  const area = PROTECTED_AREAS.find(
    ({ prefix }) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  return area?.login ?? null;
}
