import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import type { Result } from "axe-core";
import { storageStatePath } from "./demo-users";

/**
 * Basic accessibility coverage — docs/roadmap.md, Phase 9.
 *
 * axe-core against the rendered page, on one screen from each area of the
 * product. "Basic" is the roadmap's own word and it is the right scope: an
 * automated pass catches the mechanical failures — an input with no label, a
 * control with no accessible name, contrast below 4.5:1, a heading order that
 * jumps — and catches none of the judgement ones. It is the floor, not the
 * ceiling.
 *
 * Only `serious` and `critical` are enforced. A `moderate` finding is often a
 * genuine judgement call (a landmark that is arguably redundant); a serious
 * one means somebody cannot use the page.
 */

const IMPACTS = new Set(["serious", "critical"]);

async function violations(page: Page): Promise<Result[]> {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();

  return results.violations.filter(
    (violation) => violation.impact && IMPACTS.has(violation.impact),
  );
}

function describe(found: readonly Result[]): string {
  return found
    .map(
      (violation) =>
        `\n  [${violation.impact}] ${violation.id} — ${violation.help}` +
        violation.nodes
          .slice(0, 3)
          .map((node) => `\n      ${node.target.join(" ")}`)
          .join(""),
    )
    .join("");
}

async function expectAccessible(page: Page, path: string): Promise<void> {
  await page.goto(path);
  const found = await violations(page);
  expect(
    found,
    `${path} has accessibility violations:${describe(found)}`,
  ).toEqual([]);
}

test.describe("public pages", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  const paths = [
    "/",
    "/pro",
    "/login",
    "/pro/login",
    "/how-it-works",
    "/pricing",
    "/help",
    "/contact",
    "/terms",
    "/guides",
    "/services/plumbing",
    "/services/plumbing/tel-aviv",
    "/pro/david-mizrahi",
  ];

  for (const path of paths) {
    test(path, async ({ page }) => {
      await expectAccessible(page, path);
    });
  }
});

test.describe("the customer's screens", () => {
  test.use({ storageState: storageStatePath("customer") });

  for (const path of ["/account", "/new-request"]) {
    test(path, async ({ page }) => {
      await expectAccessible(page, path);
    });
  }

  test("/requests/[jobId]/offers", async ({ page }) => {
    // Customer A's seeded call, which already has three offers on it — the
    // empty state and the populated one are different pages to axe.
    await expectAccessible(
      page,
      "/requests/d0000000-0000-4000-8000-000000000001/offers",
    );
  });

  test("/requests/[jobId]/summary", async ({ page }) => {
    await expectAccessible(
      page,
      "/requests/d0000000-0000-4000-8000-000000000004/summary",
    );
  });
});

test.describe("the pro's screens", () => {
  test.use({ storageState: storageStatePath("pro") });

  for (const path of [
    "/pro/dashboard",
    "/pro/jobs",
    "/pro/offers",
    "/pro/my-jobs",
    "/pro/wallet",
    "/pro/settings",
    "/pro/profile",
    "/pro/messages",
  ]) {
    test(path, async ({ page }) => {
      await expectAccessible(page, path);
    });
  }
});

test.describe("the admin console", () => {
  test.use({ storageState: storageStatePath("admin") });

  for (const path of [
    "/admin",
    "/admin/pros",
    "/admin/jobs",
    "/admin/disputes",
  ]) {
    test(path, async ({ page }) => {
      await expectAccessible(page, path);
    });
  }
});
