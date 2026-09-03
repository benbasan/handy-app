import { expect, type Page } from "@playwright/test";
import { DEMO_USERS, OTP_CODE, type DemoUserKey } from "./demo-users";

/**
 * Sign in through the real screens: phone → SMS code → session cookie.
 *
 * Used by auth.setup.ts once per role. Tests themselves reuse the saved
 * storage state instead of calling this, because `[auth.sms] max_frequency`
 * refuses a second code to the same number inside a minute — a rate limit the
 * security checklist wants kept, not worked around.
 */
export async function signIn(page: Page, key: DemoUserKey): Promise<void> {
  const user = DEMO_USERS[key];

  await page.goto(user.loginPath);
  await page.getByLabel("מספר טלפון נייד").fill(user.phone);
  await page.getByRole("button", { name: "שליחת קוד ב-SMS" }).click();

  const token = page.getByLabel("קוד אימות");
  await expect(token).toBeVisible();
  await token.fill(OTP_CODE);
  await page.getByRole("button", { name: "אישור והתחברות" }).click();

  await page.waitForURL(`**${user.home}`);
}

/**
 * A one-pixel JPEG, as bytes.
 *
 * The field price update is the one flow in the product that cannot be
 * completed without a real file reaching Storage — business rule 1 — so the
 * test uploads one rather than stubbing the input.
 */
export const TINY_JPEG = Buffer.from(
  "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a" +
    "HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAA" +
    "AAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==",
  "base64",
);

/** A label no other row in the database carries, so the test can find its own. */
export function uniqueMarker(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Fails if the page scrolls sideways.
 *
 * The whole UI is Hebrew and renders `dir="rtl"`, where a physical margin or a
 * fixed width leaks out of the viewport on the *leading* edge and is easy to
 * miss by eye. A number is not.
 */
export async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => {
    const el = document.documentElement;
    return { scrollWidth: el.scrollWidth, clientWidth: el.clientWidth };
  });

  // One pixel of slack: sub-pixel layout rounding is not a broken page.
  expect(
    overflow.scrollWidth,
    `${page.url()} scrolls horizontally (${overflow.scrollWidth}px in a ${overflow.clientWidth}px viewport)`,
  ).toBeLessThanOrEqual(overflow.clientWidth + 1);
}
