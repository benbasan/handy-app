import type { MetadataRoute } from "next";
import { ADMIN_ROUTES, PRO_ROUTES } from "@/lib/routes";
import { absoluteUrl } from "@/lib/seo";

/**
 * What a crawler may fetch.
 *
 * The disallow list is every signed-in area. None of it is reachable without a
 * session anyway — `requireRole()` redirects and RLS refuses — so this is not
 * access control; it is about not spending a crawl budget on redirects, and
 * about keeping `/account` out of a search result where it would look like a
 * page anyone can open.
 *
 * `/pro` itself is deliberately *not* disallowed: it is the public pro landing
 * page, and `/pro/<slug>` under it is a public profile. Only the signed-in
 * screens beneath it are listed, one by one, the same way `PROTECTED_AREAS`
 * lists them in lib/routes.ts and for the same reason.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/account",
        "/new-request",
        "/requests/",
        "/api/",
        ADMIN_ROUTES.home,
        PRO_ROUTES.dashboard,
        PRO_ROUTES.join,
        PRO_ROUTES.onboarding,
        PRO_ROUTES.jobs,
        PRO_ROUTES.myJobs,
        PRO_ROUTES.offers,
        PRO_ROUTES.messages,
        PRO_ROUTES.settings,
        PRO_ROUTES.wallet,
        PRO_ROUTES.profile,
        PRO_ROUTES.help,
      ],
    },
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}
