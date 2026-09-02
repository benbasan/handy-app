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
  // Not `/pro`: that is the public pro landing page (design/screens/
  // pro-1.1-landing.png, captured at handy.co.il/pro), which anonymous
  // visitors have to be able to reach. The signed-in home is one level down,
  // exactly where the design's own dashboard capture puts it.
  pro: "/pro/dashboard",
  admin: "/admin",
};

export const ROLE_LOGIN: Record<UserRole, string> = {
  customer: "/login",
  pro: "/pro/login",
  admin: "/admin/login",
};

/** Every signed-in pro screen, in the order the pro header lists them. */
export const PRO_ROUTES = {
  landing: "/pro",
  dashboard: "/pro/dashboard",
  join: "/pro/join",
  onboarding: "/pro/onboarding",
  jobs: "/pro/jobs",
  offers: "/pro/offers",
  messages: "/pro/messages",
  settings: "/pro/settings",
  /** design/screens/pro-2.3-submit-bid.png is captured at /pro/jobs/<id>/quote. */
  quote: (jobId: string) => `/pro/jobs/${jobId}/quote`,
} as const;

/**
 * The customer's own job screens. `/requests/<id>/…` rather than under
 * `/new-request`: posting a call is one thing and living with it afterwards is
 * another, and the design captures both of these at handy.co.il/request/<ref>.
 */
export const CUSTOMER_ROUTES = {
  account: "/account",
  newRequest: "/new-request",
  published: (jobId: string) => `/new-request/published/${jobId}`,
  offers: (jobId: string) => `/requests/${jobId}/offers`,
  chat: (jobId: string) => `/requests/${jobId}/chat`,
} as const;

export const ADMIN_ROUTES = {
  home: "/admin",
  pros: "/admin/pros",
} as const;

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
  // Comparing offers and chatting about a job — signed-in customer screens
  // that sit outside /account for the same reason /new-request does.
  { prefix: "/requests", login: ROLE_LOGIN.customer },
  // Listed one by one rather than as the `/pro` prefix, because `/pro` itself
  // is the public landing page and must stay reachable while signed out.
  { prefix: PRO_ROUTES.dashboard, login: ROLE_LOGIN.pro },
  { prefix: PRO_ROUTES.join, login: ROLE_LOGIN.pro },
  { prefix: PRO_ROUTES.onboarding, login: ROLE_LOGIN.pro },
  { prefix: PRO_ROUTES.jobs, login: ROLE_LOGIN.pro },
  { prefix: PRO_ROUTES.offers, login: ROLE_LOGIN.pro },
  { prefix: PRO_ROUTES.messages, login: ROLE_LOGIN.pro },
  { prefix: PRO_ROUTES.settings, login: ROLE_LOGIN.pro },
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
