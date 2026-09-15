import { expect, test, type Page } from "@playwright/test";
import { OTP_CODE, storageStatePath } from "./demo-users";
import { uniqueMarker } from "./helpers";

/**
 * Phase 15 — cancelling, on both sides. Who may cancel when, and what a
 * cancellation does to the fee, are proved in pgTAP; this proves the doors
 * exist and say the right thing.
 */

const ADDRESS = "רחוב דיזנגוף 100, תל אביב";

/**
 * מוסא חדד, a seeded verified pro in Tel Aviv — not the demo pro. A pro who
 * cancels is given a credit, and the critical flow asserts the demo pro's
 * 35 ₪ fee on a receipt; running this as the same pro would make that suite
 * depend on the order the files run in.
 */
const PRO = { phone: "050-0000006", name: "מוסא חדד" };

async function signInPro(page: Page): Promise<void> {
  await page.goto("/pro/login");
  const token = page.getByLabel("קוד אימות");
  const throttled = page
    .getByRole("alert")
    .filter({ hasText: "נשלחו יותר מדי בקשות" });
  await page.getByLabel("מספר טלפון נייד").fill(PRO.phone);
  await page.getByRole("button", { name: "שליחת קוד ב-SMS" }).click();
  await expect(token.or(throttled).first()).toBeVisible();
  if (await throttled.isVisible()) {
    await page.waitForTimeout(62_000);
    await page.getByLabel("מספר טלפון נייד").fill(PRO.phone);
    await page.getByRole("button", { name: "שליחת קוד ב-SMS" }).click();
    await expect(token).toBeVisible();
  }
  await token.fill(OTP_CODE);
  await page.getByRole("button", { name: "אישור והתחברות" }).click();
  await page.waitForURL("**/pro/dashboard");
}

async function post(customer: Page, marker: string): Promise<string> {
  await customer.goto("/new-request");
  await customer.getByRole("radio", { name: "אינסטלציה" }).click();
  await customer.getByLabel("תיאור התקלה").fill(`${marker} — ברז דולף במטבח`);
  await customer.getByRole("radio", { name: "דחוף — עוד שעה" }).click();
  await customer.getByLabel("כתובת מלאה").fill(ADDRESS);
  await customer.getByRole("button", { name: "פרסם קריאה" }).first().click();
  await customer.waitForURL(/\/new-request\/published\/[0-9a-f-]{36}/);
  return /[0-9a-f-]{36}/.exec(customer.url())![0];
}

test("a customer cancels a call no pro has taken", async ({ browser }) => {
  const customer = await browser.newPage({
    storageState: storageStatePath("customer"),
  });
  const jobId = await post(customer, uniqueMarker("E2E-CANCEL"));

  await customer.goto(`/requests/${jobId}/offers`);
  await customer.getByRole("button", { name: "ביטול הקריאה" }).click();
  await customer.getByRole("radio", { name: "כבר לא צריך" }).check();
  await customer.getByRole("button", { name: "כן, לבטל את הקריאה" }).click();

  await expect(customer.getByText("הקריאה בוטלה")).toBeVisible();
  await expect(customer.getByText(/לא נגבה דבר מאף אחד/)).toBeVisible();
});

test("a pro reports the customer cancelled after taking the job, and the customer can dispute it", async ({
  browser,
}) => {
  const customer = await browser.newPage({
    storageState: storageStatePath("customer"),
  });
  test.setTimeout(180_000);
  const pro = await browser.newPage({
    storageState: { cookies: [], origins: [] },
  });
  await signInPro(pro);
  const marker = uniqueMarker("E2E-PROCANCEL");
  const jobId = await post(customer, marker);

  await pro.goto(`/pro/jobs/${jobId}/quote`);
  await pro.getByRole("button", { name: "שלח הצעה ללקוח" }).click();
  await pro.waitForURL(/\/pro\/offers/);

  await customer.goto(`/requests/${jobId}/offers`);
  await customer
    .locator("li")
    .filter({ hasText: PRO.name })
    .getByRole("button", { name: "בחר הצעה" })
    .click();
  await expect(
    customer.getByRole("heading", { name: "ממתינים לאישור בעל המקצוע" }),
  ).toBeVisible();

  // Once chosen but unanswered, the customer can still cancel on their own.
  await expect(
    customer.getByRole("button", { name: "ביטול הקריאה" }),
  ).toBeVisible();

  await pro.goto("/pro/offers");
  const answer = pro.locator("section").filter({ hasText: marker });
  await answer.getByRole("button", { name: /אשר וקח את העבודה/ }).click();
  await expect(answer).toHaveCount(0);

  await pro.goto(`/pro/jobs/${jobId}`);
  await pro.getByRole("button", { name: "הלקוח ביטל את העבודה" }).click();
  await expect(pro.getByText(/זיכוי של 35 ₪ לעבודה הבאה/)).toBeVisible();
  await pro.getByRole("button", { name: "כן, לבטל" }).click();
  await pro.waitForURL(/\/pro\/my-jobs\?cancelled=1/);
  await expect(pro.getByText(/העבודה בוטלה והלקוח קיבל הודעה/)).toBeVisible();
  await expect(pro.getByText(/לא תחויב בדמי קבלת עבודה/)).toBeVisible();

  await customer.goto(`/requests/${jobId}/track`);
  await customer.waitForURL(new RegExp(`/requests/${jobId}/offers`));
  await expect(customer.getByText("הקריאה בוטלה")).toBeVisible();
  await expect(
    customer.getByText(/בעל המקצוע דיווח שביקשתם לבטל/),
  ).toBeVisible();
  // The dispute is one step away, on the same screen.
  await expect(customer.getByText("משהו לא תקין בחיוב?")).toBeVisible();
});
