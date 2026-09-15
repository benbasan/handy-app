import { expect, test } from "@playwright/test";
import { storageStatePath } from "./demo-users";
import { uniqueMarker } from "./helpers";

/**
 * Phase 18 — five small things, each built from content or a component that
 * already existed. What the lists say and which trade gets one is Vitest's
 * (lib/content/__tests__/visitPrep.test.ts); this proves each appears where
 * it was meant to, and nowhere it would be noise.
 */

/** Customer B's seeded plumbing call, assigned and on its way. */
const ASSIGNED_JOB = "d0000000-0000-4000-8000-000000000003";
/** Customer A's seeded plumbing call, still collecting offers. */
const COLLECTING_JOB = "d0000000-0000-4000-8000-000000000001";

const IPHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";

test("an urgent call gets a safety card; the pro gets a quick offer and their own notes", async ({
  browser,
}) => {
  const customer = await browser.newPage({
    storageState: storageStatePath("customer"),
  });
  const pro = await browser.newPage({
    storageState: storageStatePath("pro"),
  });

  const marker = uniqueMarker("E2E-URGENT");

  await customer.goto("/new-request");
  await customer.getByRole("radio", { name: "אינסטלציה" }).click();
  await customer
    .getByLabel("תיאור התקלה")
    .fill(`${marker} — צינור התפוצץ מתחת לכיור`);
  await customer.getByRole("radio", { name: "דחוף — עוד שעה" }).click();
  await customer.getByLabel("כתובת מלאה").fill("רחוב דיזנגוף 100, תל אביב");
  await customer.getByRole("button", { name: "פרסם קריאה" }).click();
  await customer.waitForURL(/\/new-request\/published\/[0-9a-f-]{36}/);
  const jobId = customer.url().match(/[0-9a-f-]{36}/)![0];

  await customer.goto(`/requests/${jobId}/offers`);
  const safety = customer.getByRole("region", {
    name: "עד שבעל המקצוע מגיע",
  });
  await expect(safety).toContainText("ברז הניל");
  await expect(safety).toContainText("102");

  // The push for a new call lands on the quote page.
  await pro.goto(`/pro/jobs/${jobId}/quote`);
  await expect(
    pro.getByRole("heading", { name: "הצעה מהירה" }),
    "the pro has offered in plumbing before, and this call needs no window",
  ).toBeVisible();

  const chips = pro.getByRole("group", { name: /מהצעות קודמות שלך/ });
  const first = chips.getByRole("button").first();
  const text = (await first.textContent())!.trim();
  await first.click();
  await expect(pro.getByLabel("הערה ללקוח")).toHaveValue(text);
  await expect(
    first,
    "a note already in the field is not added twice",
  ).toBeDisabled();

  await pro.getByRole("button", { name: /^הצעה מהירה ·/ }).click();
  await expect(pro).toHaveURL(/\/pro\/offers/);
});

test("the tracking screen says how to get ready for the visit", async ({
  browser,
}) => {
  const customer = await browser.newPage({
    storageState: storageStatePath("customerB"),
  });
  await customer.goto(`/requests/${ASSIGNED_JOB}/track`);
  const prep = customer.getByRole("region", { name: "להתכונן לביקור" });
  await expect(prep).toContainText("לברז הראשי");
  await expect(prep).not.toContainText("102");
});

test("an iPhone is told a push needs the home screen, and can say not now", async ({
  browser,
}) => {
  const context = await browser.newContext({
    storageState: storageStatePath("customer"),
    userAgent: IPHONE_UA,
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();

  await page.goto(`/requests/${COLLECTING_JOB}/offers`);
  const card = page.getByRole("region", { name: "הוסיפו את Handy למסך הבית" });
  await expect(card).toContainText("הוספה למסך הבית");

  await card.getByRole("button", { name: "לא עכשיו" }).click();
  await expect(card).toHaveCount(0);

  await page.reload();
  await expect(
    page.getByRole("heading", { name: "הוסיפו את Handy למסך הבית" }),
  ).toHaveCount(0);
  await context.close();
});
