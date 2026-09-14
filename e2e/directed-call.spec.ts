import { expect, test } from "@playwright/test";
import { storageStatePath } from "./demo-users";
import { uniqueMarker } from "./helpers";

/**
 * Phase 13.8 — a pro brings a customer, and the call is theirs until they
 * pass or the customer opens it.
 *
 * The rules themselves (who can read a directed call, the fee waiver, what
 * opens it) are proved in pgTAP. What this proves is that the screens say so:
 * the pro can find their link, the form names the pro, the offers screen says
 * who it is waiting on and lets the customer stop waiting, and the pro's feed
 * says the call was asked for by name.
 */

const PRO_SLUG = "david-mizrahi";

test("a pro's link reaches the form, the call waits on them, and the customer can open it", async ({
  browser,
}) => {
  const customer = await browser.newPage({
    storageState: storageStatePath("customer"),
  });
  const pro = await browser.newPage({ storageState: storageStatePath("pro") });

  await pro.goto("/pro/profile");
  await expect(
    pro.getByRole("heading", { name: "הקישור האישי שלך" }),
  ).toBeVisible();
  await expect(pro.getByText(`/new-request?pro=${PRO_SLUG}`)).toBeVisible();
  await expect(pro.getByRole("img", { name: /ברקוד/ })).toBeVisible();

  const marker = uniqueMarker("E2E-DIRECTED");

  await customer.goto(`/new-request?pro=${PRO_SLUG}`);
  await expect(
    customer.getByText(/הקריאה תישלח קודם אל דוד מזרחי/),
  ).toBeVisible();

  await customer.getByRole("radio", { name: "אינסטלציה" }).click();
  await customer
    .getByLabel("תיאור התקלה")
    .fill(`${marker} — ביקשתי את דוד כי הוא תיקן אצל השכנה`);
  await customer.getByRole("radio", { name: "דחוף — עוד שעה" }).click();
  await customer.getByLabel("כתובת מלאה").fill("רחוב דיזנגוף 100, תל אביב");
  await customer.getByRole("button", { name: "פרסם קריאה" }).first().click();
  await customer.waitForURL(/\/new-request\/published\/[0-9a-f-]{36}/);
  const jobId = /[0-9a-f-]{36}/.exec(customer.url())![0];

  await pro.goto("/pro/jobs");
  const card = pro.locator("li").filter({ hasText: marker });
  await expect(card).toContainText("הלקוח ביקש אותך ישירות");

  await customer.goto(`/requests/${jobId}/offers`);
  await expect(
    customer.getByRole("heading", { name: /ממתינים לדוד מזרחי/ }),
  ).toBeVisible();

  await customer
    .getByRole("button", { name: "פתחו לכל בעלי המקצוע באזור" })
    .click();
  await expect(
    customer.getByRole("heading", { name: /ממתינים לדוד מזרחי/ }),
    "once opened, the call no longer waits on one pro",
  ).toHaveCount(0);
  await expect(customer.getByText(/הקריאה נשלחה ל-/).first()).toBeVisible();
});

test("the home record lists finished jobs with their receipts", async ({
  browser,
}) => {
  const customer = await browser.newPage({
    storageState: storageStatePath("customer"),
  });

  await customer.goto("/account/home");
  await expect(
    customer.getByRole("heading", { name: "תיק הבית" }),
  ).toBeVisible();
  await expect(
    customer.getByRole("link", { name: "קבלה" }).first(),
  ).toBeVisible();
  await expect(
    customer.getByRole("link", { name: "הזמנה חוזרת" }).first(),
  ).toHaveAttribute("href", /\/new-request\?pro=/);
});
