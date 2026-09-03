import { expect, test } from "@playwright/test";
import { DEMO_USERS, storageStatePath } from "./demo-users";

/**
 * The security checklist, from a browser — docs/roadmap.md, Phase 9.
 *
 * Everything asserted here is already proven in the database: pgTAP shows that
 * customer A's job is invisible to customer B, that a pro cannot read another
 * pro's earnings, that the admin functions ask `is_admin()` at their own front
 * door. What pgTAP cannot show is that *the app in front of those policies*
 * does not accidentally hand the data over anyway — through a page that reads
 * with the service-role key, a route handler outside the `(authed)` layout
 * that forgot its own role check, or a redirect that quietly succeeds.
 *
 * CLAUDE.md is explicit that a redirect is a courtesy and RLS is the control.
 * These tests check the courtesy *and* the control: an anonymous visitor is
 * sent to a login page, and a signed-in stranger gets nothing at all.
 *
 * The job ids come from supabase/seed.sql, so each one is a real row that
 * really exists — a 404 here means "not for you", not "not found".
 */

/** Customer A's plumbing call. Customer B must never see it. */
const JOB_OF_CUSTOMER_A = "d0000000-0000-4000-8000-000000000001";
/** Closed, with a receipt and a commission row behind it. Pro: דוד מזרחי. */
const CLOSED_JOB_OF_CUSTOMER_A = "d0000000-0000-4000-8000-000000000004";

test.describe("an anonymous visitor", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  const gated: ReadonlyArray<{ path: string; login: string }> = [
    { path: "/account", login: "/login" },
    { path: "/new-request", login: "/login" },
    { path: `/requests/${JOB_OF_CUSTOMER_A}/offers`, login: "/login" },
    { path: `/requests/${JOB_OF_CUSTOMER_A}/chat`, login: "/login" },
    { path: "/pro/dashboard", login: "/pro/login" },
    { path: "/pro/jobs", login: "/pro/login" },
    { path: "/pro/wallet", login: "/pro/login" },
    { path: "/admin", login: "/admin/login" },
    { path: "/admin/disputes", login: "/admin/login" },
  ];

  for (const { path, login } of gated) {
    test(`is sent from ${path} to ${login}`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(new RegExp(`${login.replace("/", "\\/")}`));
    });
  }

  test("still reaches every public page", async ({ page }) => {
    // The other half of the same rule: the gate must not have swallowed the
    // marketing site, which is the one part of this product with no session
    // anywhere on it.
    for (const path of [
      "/",
      "/pro",
      "/how-it-works",
      "/pricing",
      "/help",
      "/contact",
      "/terms",
      "/services/plumbing",
      "/pro/david-mizrahi",
    ]) {
      const response = await page.goto(path);
      expect(response?.status(), `${path} is public`).toBe(200);
    }
  });

  test("cannot download a receipt", async ({ page }) => {
    const response = await page.request.get(
      `/api/receipts/${CLOSED_JOB_OF_CUSTOMER_A}`,
    );
    expect(response.status()).not.toBe(200);
  });

  test("cannot export the admin report", async ({ page }) => {
    // A route handler sits outside the `(authed)` layout and does its own role
    // check — which is precisely the kind of check that is easy to omit.
    const response = await page.request.get("/api/admin/report");
    expect(response.status()).not.toBe(200);
  });
});

test.describe("one customer and another", () => {
  test.use({ storageState: storageStatePath("customerB") });

  test("customer B cannot open customer A's call", async ({ page }) => {
    const response = await page.goto(`/requests/${JOB_OF_CUSTOMER_A}/offers`);
    expect(response?.status(), "RLS returns no row, which is a 404").toBe(404);
  });

  test("nor its chat, nor its summary", async ({ page }) => {
    for (const suffix of ["chat", "summary", "track"]) {
      const response = await page.goto(
        `/requests/${JOB_OF_CUSTOMER_A}/${suffix}`,
      );
      expect(response?.status(), `/${suffix} is not customer B's`).toBe(404);
    }
  });

  test("nor download its receipt", async ({ page }) => {
    const response = await page.request.get(
      `/api/receipts/${CLOSED_JOB_OF_CUSTOMER_A}`,
    );
    expect(response.status()).not.toBe(200);
  });

  test("and sees nothing of it in their own account", async ({ page }) => {
    await page.goto("/account");
    await expect(page.locator("body")).not.toContainText(
      "נזילה מתחת לכיור במטבח",
    );
  });
});

test.describe("a customer in the pro's and the admin's areas", () => {
  test.use({ storageState: storageStatePath("customer") });

  const forbidden = [
    "/pro/dashboard",
    "/pro/jobs",
    "/pro/wallet",
    "/pro/offers",
    "/admin",
    "/admin/pros",
    "/admin/jobs",
    "/admin/disputes",
  ];

  for (const path of forbidden) {
    test(`is refused ${path}`, async ({ page }) => {
      await page.goto(path);
      // `requireRole()` sends them to their own home rather than to a login
      // page they are already past — they are signed in, just not as this.
      await expect(page).not.toHaveURL(new RegExp(`${path}$`));
    });
  }

  test("and the admin export refuses them by name", async ({ page }) => {
    const response = await page.request.get("/api/admin/report");
    expect(response.status()).not.toBe(200);
  });
});

test.describe("a pro and the customer's side", () => {
  test.use({ storageState: storageStatePath("pro") });

  test("cannot open a customer's offer-comparison screen", async ({ page }) => {
    await page.goto(`/requests/${JOB_OF_CUSTOMER_A}/offers`);
    await expect(page).not.toHaveURL(/\/requests\//);
  });

  test("cannot reach the admin console", async ({ page }) => {
    await page.goto("/admin");
    await expect(page).not.toHaveURL(/\/admin$/);
  });

  test("cannot manage a job that was never assigned to them", async ({
    page,
  }) => {
    // An open call this pro has not won. `my_active_jobs()` does not list it,
    // so the page 404s — the RLS answer, not a guess.
    const response = await page.goto(`/pro/jobs/${JOB_OF_CUSTOMER_A}`);
    expect(response?.status()).toBe(404);
  });
});

test.describe("the admin", () => {
  test.use({ storageState: storageStatePath("admin") });

  test("reads a job's full record through the same modules the two sides use", async ({
    page,
  }) => {
    // CLAUDE.md section 3: there is no admin-only projection of a job in this
    // repo. If this page ever renders something the customer's own screens
    // cannot, that sentence has stopped being true.
    await page.goto(`/admin/jobs/${CLOSED_JOB_OF_CUSTOMER_A}`);
    await expect(page.locator("body")).toContainText(DEMO_USERS.pro.name);
  });

  test("can export the report a route handler guards by hand", async ({
    page,
  }) => {
    const response = await page.request.get("/api/admin/report");
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("text/csv");
  });
});
