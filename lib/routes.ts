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
  /** design/screens/pro-3.2-my-jobs.png is captured at handy.co.il/pro/my-jobs. */
  myJobs: "/pro/my-jobs",
  /** design/screens/pro-2.3-submit-bid.png is captured at /pro/jobs/<id>/quote. */
  quote: (jobId: string) => `/pro/jobs/${jobId}/quote`,
  /**
   * The job the pro won, while they are doing it — the price-update card, the
   * route map and the progress bar. The design captures it at
   * handy.co.il/pro/jobs/8842, one segment under the feed it came from.
   */
  manageJob: (jobId: string) => `/pro/jobs/${jobId}`,
  /** ארנק, הכנסות ועמלות — design/screens/pro-4.1-earnings-wallet.png, at /pro/wallet. */
  wallet: "/pro/wallet",
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
  /**
   * Live tracking, once a pro has been chosen — captured at
   * handy.co.il/request/H-24817/track in
   * design/screens/customer-3.1-tracking-chat.png.
   */
  track: (jobId: string) => `/requests/${jobId}/track`,
  /**
   * Where a call ends: the billing summary, the rating and the receipt —
   * design/screens/customer-4.1-summary-receipt-rating.png, captured at
   * handy.co.il/request/H-24817/summary.
   */
  summary: (jobId: string) => `/requests/${jobId}/summary`,
} as const;

/**
 * The receipt PDF. Not inside either role's map because both roles download it
 * — the customer from the summary screen, the pro from their history — and the
 * route hands each of them a different document (the pro's copy carries the
 * commission; see lib/pdf/receipt.tsx).
 *
 * A route handler rather than a server action, because what comes back is a
 * file and a Content-Disposition rather than a re-render — the exception
 * docs/architecture.md section 2 reserves /api for.
 */
export function receiptPath(jobId: string): string {
  return `/api/receipts/${jobId}`;
}

/**
 * The four screens of design/screens/admin-*.png, in the order the admin
 * header lists them. The design captures them at admin.handy.co.il/… — a
 * separate host we do not have, so each one keeps the `/admin` prefix that
 * lib/routes.ts gives every admin path (route groups add no segment of their
 * own, so without it `(admin)/login` and `(customer)/login` would collide).
 */
export const ADMIN_ROUTES = {
  /** 7.1 סקירה כללית. */
  home: "/admin",
  /** 7.2 אישור בעלי מקצוע — captured at admin.handy.co.il/pros/pending. */
  pros: "/admin/pros",
  /** 7.3 קריאות במערכת — captured at admin.handy.co.il/requests. */
  jobs: "/admin/jobs",
  /**
   * The full documentation of one call: the offers, the media, every price
   * update with its photo, the conversation and the receipt. This is what
   * product-spec.md 5.4 means by "כל מחלוקת נבדקת מול תיעוד הקריאה המלא".
   */
  job: (jobId: string) => `/admin/jobs/${jobId}`,
  /** 7.4 מחלוקות ובקרה — captured at admin.handy.co.il/disputes. */
  disputes: "/admin/disputes",
  /** "יצוא דוח" in the header: the filtered jobs table, as CSV. */
  report: "/api/admin/report",
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
  { prefix: PRO_ROUTES.myJobs, login: ROLE_LOGIN.pro },
  { prefix: PRO_ROUTES.offers, login: ROLE_LOGIN.pro },
  { prefix: PRO_ROUTES.messages, login: ROLE_LOGIN.pro },
  { prefix: PRO_ROUTES.settings, login: ROLE_LOGIN.pro },
  { prefix: PRO_ROUTES.wallet, login: ROLE_LOGIN.pro },
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
