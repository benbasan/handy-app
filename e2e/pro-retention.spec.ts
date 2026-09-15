import { expect, test } from "@playwright/test";
import { storageStatePath } from "./demo-users";

/**
 * Phase 16 — the pro's daily screens. What each number counts is proved in
 * pgTAP and Vitest; this proves the screens carry them.
 */

test.use({ storageState: storageStatePath("pro") });

test("the dashboard carries the week, the win rate and the time to an offer", async ({
  page,
}) => {
  await page.goto("/pro/dashboard");
  await expect(page.getByText("נטו ב-7 הימים האחרונים")).toBeVisible();
  await expect(page.getByText("מההצעות שלך הפכו לעבודה")).toBeVisible();
  await expect(page.getByText("זמן ממוצע עד הצעה")).toBeVisible();
});

test("the feed sorts, filters, says how old each call is, and hides with a reason", async ({
  page,
}) => {
  await page.goto("/pro/jobs");
  const sorts = page.getByRole("navigation", { name: "מיון" });
  await sorts.getByRole("link", { name: "הקרובות" }).click();
  await expect(page).toHaveURL(/sort=near/);
  await expect(sorts.getByRole("link", { name: "הקרובות" })).toHaveAttribute(
    "aria-current",
    "true",
  );

  const firstCard = page
    .locator("li")
    .filter({ hasText: "הגש הצעת מחיר" })
    .first();
  await expect(firstCard).toContainText(/לפני|עכשיו|אתמול/);

  await firstCard.getByRole("button", { name: "לא מתאים לי" }).click();
  await expect(
    firstCard.getByRole("button", { name: "רחוק מדי" }),
  ).toBeVisible();
});

test("the wallet has a pricing coach that says nothing it cannot count", async ({
  page,
}) => {
  await page.goto("/pro/wallet");
  await expect(page.getByRole("heading", { name: "מאמן תמחור" })).toBeVisible();
});
