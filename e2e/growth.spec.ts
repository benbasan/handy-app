import { expect, test } from "@playwright/test";
import { storageStatePath } from "./demo-users";
import { uniqueMarker } from "./helpers";

/**
 * Phase 17 — growth. Who may open a share link, and for how long, is proved
 * in pgTAP (`shared_receipt()` returns nothing for a revoked or expired token;
 * only a hash is stored). This proves the screens reach it: a link created on
 * the summary opens a PDF for somebody with no session and stops the moment
 * it is revoked; the contact form reaches a person; the pro landing page
 * carries demand; a customer has one inbox.
 */

/** Customer A's closed job, done by דוד מזרחי. */
const CLOSED_JOB = "d0000000-0000-4000-8000-000000000004";

test("a receipt link opens without an account, and stops when revoked", async ({
  browser,
  playwright,
}) => {
  const customer = await browser.newPage({
    storageState: storageStatePath("customer"),
  });
  await customer.goto(`/requests/${CLOSED_JOB}/summary`);

  await customer.getByRole("button", { name: "יצירת קישור לקבלה" }).click();
  const link = customer.locator("p[dir=ltr]").filter({ hasText: "/r/" });
  await expect(link).toBeVisible();
  const path = new URL((await link.textContent()) ?? "").pathname;

  const stranger = await playwright.request.newContext({
    baseURL: new URL(customer.url()).origin,
  });
  const opened = await stranger.get(path);
  expect(opened.status()).toBe(200);
  expect(opened.headers()["content-type"]).toContain("application/pdf");
  expect(opened.headers()["x-robots-tag"]).toContain("noindex");

  await customer.getByRole("button", { name: "ביטול הקישור" }).click();
  await expect(customer.getByText("הקישור בוטל")).toBeVisible();

  expect((await stranger.get(path)).status()).toBe(404);
  expect((await stranger.get("/r/not-a-real-token")).status()).toBe(404);
  await stranger.dispose();
});

test("the contact form reaches the admin, who marks it answered", async ({
  browser,
}) => {
  const marker = uniqueMarker("E2E-SUPPORT");

  const visitor = await browser.newPage({
    storageState: { cookies: [], origins: [] },
  });
  await visitor.goto("/contact");
  await visitor.getByLabel("שם מלא").fill("בודק תמיכה");
  await visitor.getByLabel("טלפון").fill("0501234567");
  await visitor.getByLabel("מה קרה").fill(`${marker} — שאלה על הצעת מחיר`);
  await visitor.getByRole("button", { name: "שלח פנייה" }).click();
  await expect(visitor.getByRole("button", { name: "שלח פנייה" })).toHaveCount(
    0,
  );

  const admin = await browser.newPage({
    storageState: storageStatePath("admin"),
  });
  await admin.goto("/admin/support");
  const ticket = admin.locator("li").filter({ hasText: marker });
  await expect(ticket).toContainText("פתוחה");

  await ticket.getByRole("button", { name: /סמן כנענתה/ }).click();
  await expect(ticket).toContainText("נענתה");
  await expect(ticket.getByRole("button", { name: /סגור/ })).toBeVisible();
});

test("the pro landing page counts open calls by city", async ({ browser }) => {
  const visitor = await browser.newPage({
    storageState: { cookies: [], origins: [] },
  });
  await visitor.goto("/pro");
  await expect(
    visitor.getByRole("heading", { name: "קריאות פתוחות עכשיו, לפי עיר" }),
  ).toBeVisible();
});

test("a customer has one inbox across every call", async ({ browser }) => {
  const customer = await browser.newPage({
    storageState: storageStatePath("customer"),
  });
  await customer.goto("/account/messages");
  await expect(customer.getByRole("heading", { name: "הודעות" })).toBeVisible();
  await expect(
    customer.getByRole("heading", { name: "כל השיחות" }),
  ).toBeVisible();
  await expect(customer.getByRole("link", { name: "לקריאה" })).toBeVisible();
});

test("the posting form offers the trade's guide before publishing", async ({
  browser,
}) => {
  const visitor = await browser.newPage({
    storageState: { cookies: [], origins: [] },
  });
  await visitor.goto(
    "/new-request?q=" + encodeURIComponent("הברז במטבח מטפטף"),
  );
  await expect(
    visitor.locator('a[href="/guides/before-you-call-a-plumber"]'),
  ).toBeVisible();
});
