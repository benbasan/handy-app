import { expect, test, type Page } from "@playwright/test";
import { DEMO_USERS, OTP_CODE } from "./demo-users";
import { TINY_JPEG, uniqueMarker } from "./helpers";

/**
 * Phase 13.7 — the way into the product, walked by somebody with no session.
 *
 * Until this phase "פרסם קריאה — חינם" led to a phone-number screen before a
 * single field. What is proved here is the new order: the sentence first, the
 * form second, the phone at the very end — and that nothing the visitor
 * picked, a photo included, is lost on the way through the sign-in.
 */

test.use({ storageState: { cookies: [], origins: [] } });

test("the landing page's box carries a sentence into the form, trade chosen", async ({
  page,
}) => {
  await page.goto("/");

  await page
    .getByRole("searchbox", { name: /מה קרה/ })
    .fill("המזגן בסלון מטפטף מים");
  await page.getByRole("button", { name: "המשך" }).click();

  await page.waitForURL(/\/new-request\?q=/);
  await expect(
    page.getByRole("radio", { name: "מיזוג אוויר" }),
    "the sentence named one trade, so the tile is already chosen",
  ).toHaveAttribute("aria-checked", "true");
  await expect(page.getByLabel("תיאור התקלה")).toHaveValue(
    "המזגן בסלון מטפטף מים",
  );
});

test("a visitor writes a whole call, signs in at publish, and it goes out with its photo", async ({
  page,
}) => {
  // The sign-in can meet GoTrue's per-number resend limit, because auth.setup
  // signed this customer in moments ago. Waiting it out is slow, not flaky.
  test.setTimeout(180_000);

  const marker = uniqueMarker("E2E-FUNNEL");

  await page.goto("/new-request");
  await expect(
    page.getByRole("heading", { name: "פרסום קריאה חדשה" }),
    "the form opens with no session at all",
  ).toBeVisible();

  await page.getByRole("radio", { name: "אינסטלציה" }).click();

  // The common-fault chips reach the description.
  await page
    .getByRole("button", { name: "פתיחת סתימה בכיור או במקלחת" })
    .click();
  await expect(page.getByLabel("תיאור התקלה")).toHaveValue(
    /^פתיחת סתימה בכיור או במקלחת\./,
  );
  await page
    .getByLabel("תיאור התקלה")
    .fill(`${marker} — הכיור במטבח סתום לגמרי`);

  // Held in the tab, not uploaded: there is no customer id to file it under.
  await page.locator('input[type="file"][accept*="image"]').setInputFiles({
    name: "sink.jpg",
    mimeType: "image/jpeg",
    buffer: TINY_JPEG,
  });
  await expect(page.getByText("תמונה", { exact: true })).toBeVisible();

  await page.getByRole("radio", { name: "השבוע" }).click();
  await page.getByLabel("כתובת מלאה").fill("רחוב דיזנגוף 100, תל אביב");

  await page.getByRole("button", { name: "פרסם קריאה" }).first().click();

  const dialog = page.getByRole("dialog", { name: /רגע לפני הפרסום/ });
  await expect(dialog).toBeVisible();

  await signInInside(page, DEMO_USERS.customerB.phone);

  await page.waitForURL(/\/new-request\/published\/[0-9a-f-]{36}/);
  await expect(
    page.getByRole("heading", { name: "הקריאה פורסמה!" }),
  ).toBeVisible();
  await expect(page.getByText(marker)).toBeVisible();
  // The photo chosen before there was an account made it into storage and
  // onto the call.
  await expect(page.locator("img[src*='job-media']").first()).toBeVisible();
});

async function signInInside(page: Page, phone: string): Promise<void> {
  const dialog = page.getByRole("dialog");
  const requestCode = dialog.getByRole("button", { name: "שליחת קוד ב-SMS" });
  const token = dialog.getByLabel("קוד אימות");
  const throttled = dialog
    .getByRole("alert")
    .filter({ hasText: "נשלחו יותר מדי בקשות" });

  await dialog.getByLabel("מספר טלפון נייד").fill(phone);
  await requestCode.click();
  await expect(token.or(throttled).first()).toBeVisible();

  if (await throttled.isVisible()) {
    await page.waitForTimeout(62_000);
    // A form action resets its uncontrolled fields when it returns, so the
    // number the refusal came back for is gone from the input.
    await dialog.getByLabel("מספר טלפון נייד").fill(phone);
    await requestCode.click();
    await expect(token).toBeVisible();
  }

  await token.fill(OTP_CODE);
  await dialog.getByRole("button", { name: "אישור והתחברות" }).click();
}
