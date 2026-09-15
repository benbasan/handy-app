import { expect, test } from "@playwright/test";
import { storageStatePath } from "./demo-users";

/**
 * Phase 14 — the compare screen shows the pro, and a saved pro is a repeat
 * booking. What a pro's card may carry is proved in pgTAP (bids_for_job()
 * names its columns; the response time is silent under three offers); this
 * proves the customer can reach the profile without leaving the comparison,
 * and that saving a pro leads somewhere.
 */

/** Customer A's seeded plumbing call, with three live offers on it. */
const JOB_WITH_OFFERS = "d0000000-0000-4000-8000-000000000001";
/** Customer A's closed job, done by דוד מזרחי. */
const CLOSED_JOB = "d0000000-0000-4000-8000-000000000004";

test("a pro's profile opens over the offers, and closing it keeps the comparison", async ({
  browser,
}) => {
  const customer = await browser.newPage({
    storageState: storageStatePath("customer"),
  });

  await customer.goto(`/requests/${JOB_WITH_OFFERS}/offers`);
  const offers = customer.locator("li").filter({ hasText: "בחר הצעה" });
  const before = await offers.count();
  expect(before).toBeGreaterThan(1);

  // Every live offer counts down on its own.
  await expect(offers.first()).toContainText("תוקף ההצעה");

  await customer
    .getByRole("button", { name: "פרופיל וביקורות" })
    .first()
    .click();
  const panel = customer.getByRole("dialog");
  await expect(panel.getByText("ביקורות אחרונות")).toBeVisible();
  await expect(
    panel.getByRole("link", { name: /לפרופיל המלא/ }),
  ).toHaveAttribute("target", "_blank");

  await panel.getByRole("button", { name: "סגירה" }).click();
  await expect(panel).toHaveCount(0);
  await expect(customer).toHaveURL(
    new RegExp(`/requests/${JOB_WITH_OFFERS}/offers`),
  );
  await expect(offers).toHaveCount(before);
});

test("a saved pro becomes a repeat booking directed at them", async ({
  browser,
}) => {
  const customer = await browser.newPage({
    storageState: storageStatePath("customer"),
  });

  await customer.goto(`/requests/${CLOSED_JOB}/summary`);
  const save = customer.getByRole("button", { name: "שמירת בעל המקצוע" });
  if (await save.isVisible()) await save.click();

  await customer.goto("/account");
  const rebook = customer.getByRole("link", { name: "הזמנה חוזרת" }).first();
  await expect(rebook).toHaveAttribute("href", /\/new-request\?pro=/);

  await rebook.click();
  await expect(customer.getByText(/הקריאה תישלח קודם אל/)).toBeVisible();
});
