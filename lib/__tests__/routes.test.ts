import { describe, expect, it } from "vitest";
import {
  CUSTOMER_ROUTES,
  loginPathFor,
  postLoginPath,
  ROLE_HOME,
  ROLE_LOGIN,
} from "../routes";

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

/**
 * `postLoginPath` is the only place in this app that turns a value from the URL
 * bar into a redirect, which makes it the only place an open redirect could
 * live. The proxy puts the destination there; a stranger with a link can put
 * anything there.
 *
 * The three groups below are the three ways that goes wrong: leaving the site,
 * landing somewhere public that was never bounced in the first place, and —
 * the one specific to this app — being carried into another role's area, which
 * `requireRole()` would refuse anyway but only after sending somebody to a
 * screen that is not theirs.
 */
describe("postLoginPath", () => {
  it("honours a protected path belonging to the role that signed in", () => {
    expect(postLoginPath("customer", "/requests/8842/offers")).toBe(
      "/requests/8842/offers",
    );
    // The query string survives, because it is the half that says which pro
    // the customer was talking to.
    expect(postLoginPath("customer", "/requests/8842/chat?pro=abc")).toBe(
      "/requests/8842/chat?pro=abc",
    );
    expect(postLoginPath("pro", "/pro/offers")).toBe("/pro/offers");
    expect(postLoginPath("admin", "/admin/jobs/8842")).toBe("/admin/jobs/8842");
  });

  it("falls back to the role's home when there is nothing to honour", () => {
    for (const next of [undefined, null, ""]) {
      expect(postLoginPath("customer", next)).toBe(ROLE_HOME.customer);
    }
  });

  it("refuses to leave the site", () => {
    for (const next of [
      "https://evil.example/",
      "//evil.example/",
      "/\\evil.example",
      "\\\\evil.example",
      "javascript:alert(1)",
      "evil.example",
    ]) {
      expect(postLoginPath("customer", next)).toBe(ROLE_HOME.customer);
    }
  });

  it("refuses a public path — the proxy would never have bounced one", () => {
    for (const next of [
      "/",
      "/pricing",
      "/pro/dana-levi",
      "/services/plumbing",
    ]) {
      expect(postLoginPath("customer", next)).toBe(ROLE_HOME.customer);
    }
  });

  it("refuses another role's area", () => {
    expect(postLoginPath("customer", "/admin/jobs")).toBe(ROLE_HOME.customer);
    expect(postLoginPath("customer", "/pro/wallet")).toBe(ROLE_HOME.customer);
    expect(postLoginPath("pro", "/account")).toBe(ROLE_HOME.pro);
    expect(postLoginPath("pro", "/admin")).toBe(ROLE_HOME.pro);
    expect(postLoginPath("admin", "/requests/8842/track")).toBe(
      ROLE_HOME.admin,
    );
  });
});

/**
 * The category a visitor taps on the landing page is a decision, and linking
 * the bare path threw it away — the form then asked the same question again.
 */
describe("newRequestFor", () => {
  it("carries the slug, and encodes it", () => {
    expect(CUSTOMER_ROUTES.newRequestFor("plumbing")).toBe(
      "/new-request?category=plumbing",
    );
    expect(CUSTOMER_ROUTES.newRequestFor("a&b")).toBe(
      "/new-request?category=a%26b",
    );
  });

  it("is the plain path when there is no choice to carry", () => {
    expect(CUSTOMER_ROUTES.newRequestFor(null)).toBe(
      CUSTOMER_ROUTES.newRequest,
    );
    expect(CUSTOMER_ROUTES.newRequestFor(undefined)).toBe(
      CUSTOMER_ROUTES.newRequest,
    );
  });
});
