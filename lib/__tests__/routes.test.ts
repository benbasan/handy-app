import { describe, expect, it } from "vitest";
import { loginPathFor, ROLE_LOGIN } from "../routes";

/**
 * `loginPathFor` has two callers that must agree, and they are far apart:
 * `proxy.ts`, which decides where to bounce an anonymous visitor, and
 * `app/error.tsx`, which decides which "back" link to offer someone whose page
 * has just failed.
 *
 * The case worth pinning is `/pro/`, because it is two areas wearing one
 * prefix. `/pro/dashboard` is the signed-in pro's home; `/pro/dana-levi` is a
 * public profile written for strangers and indexed by search engines. An
 * error boundary that reads the prefix instead of asking this function offers
 * a customer reading a profile a link to `/pro/dashboard`, which proxy.ts then
 * bounces to a login screen they have no account for — a dead end reached from
 * a page that was trying to help.
 */
describe("loginPathFor", () => {
  it("treats the public pro pages as public", () => {
    // The landing page, and a profile slug — neither has a session behind it.
    expect(loginPathFor("/pro")).toBeNull();
    expect(loginPathFor("/pro/dana-levi")).toBeNull();
    expect(loginPathFor("/pro/login")).toBeNull();
  });

  it("treats the signed-in pro area as the pro area", () => {
    for (const path of [
      "/pro/dashboard",
      "/pro/jobs",
      "/pro/jobs/8842",
      "/pro/wallet",
      "/pro/profile",
      "/pro/my-jobs",
    ]) {
      expect(loginPathFor(path)).toBe(ROLE_LOGIN.pro);
    }
  });

  it("separates the admin console and the customer's own screens", () => {
    expect(loginPathFor("/admin")).toBe(ROLE_LOGIN.admin);
    expect(loginPathFor("/admin/jobs/8842")).toBe(ROLE_LOGIN.admin);
    expect(loginPathFor("/account")).toBe(ROLE_LOGIN.customer);
    expect(loginPathFor("/requests/8842/track")).toBe(ROLE_LOGIN.customer);
    expect(loginPathFor("/new-request")).toBe(ROLE_LOGIN.customer);
  });

  it("leaves the marketing pages public", () => {
    for (const path of ["/", "/pricing", "/terms", "/services/plumbing"]) {
      expect(loginPathFor(path)).toBeNull();
    }
  });
});
