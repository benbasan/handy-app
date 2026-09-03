import { expect, test, type Page } from "@playwright/test";
import { storageStatePath } from "./demo-users";
import { expectNoHorizontalOverflow } from "./helpers";

/**
 * Comprehensive RTL coverage — docs/roadmap.md, Phase 9.
 *
 * `tests/rtl.test.ts` reads the source and refuses a physical Tailwind
 * utility. This is the other half: what the browser actually lays out.
 *
 * Two things are checked, and both are things a person would only catch by
 * looking, on the right screen, at the right width:
 *
 *  1. The page really is right-to-left — `dir="rtl"` resolved on the document
 *     and on the text inside it, not merely written in the layout.
 *  2. Nothing leaks sideways. In an RTL page a stray fixed width or a physical
 *     margin pushes content off the *leading* edge, where a left-to-right
 *     reader's eye does not go. A number notices; an eye does not.
 *
 * Both viewports, because "web-only, fully responsive, mobile-web + desktop"
 * is the mobile strategy in CLAUDE.md section 2 and the design ships both.
 */

const MOBILE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 900 };

async function expectRtl(page: Page, path: string): Promise<void> {
  await page.goto(path);

  const direction = await page.evaluate(() => ({
    html: document.documentElement.getAttribute("dir"),
    lang: document.documentElement.getAttribute("lang"),
    // The computed value, not the attribute: a stray `dir="ltr"` further down
    // the tree, or a CSS `direction`, would not show up in the attribute.
    body: getComputedStyle(document.body).direction,
  }));

  expect(direction.html, `${path} declares dir="rtl"`).toBe("rtl");
  expect(direction.lang, `${path} declares lang="he"`).toBe("he");
  expect(direction.body, `${path} lays its body out right-to-left`).toBe("rtl");

  await expectNoHorizontalOverflow(page);
}

/**
 * One path from every area of the product, at both viewports.
 *
 * The list is deliberately the same shape as the a11y suite's: these are the
 * screens the product cannot ship broken, and a screen worth scanning for a
 * missing label is worth scanning for a layout that runs off the page.
 */
const PUBLIC_PATHS = [
  "/",
  "/pro",
  "/login",
  "/pro/login",
  "/how-it-works",
  "/pricing",
  "/help",
  "/contact",
  "/terms",
  "/privacy",
  "/cancellation",
  "/guides",
  "/services",
  "/services/plumbing",
  "/services/plumbing/tel-aviv",
  "/pro/david-mizrahi",
  // The 404, which is a page like any other and is the easiest one to forget.
  "/this-page-does-not-exist",
];

const CUSTOMER_PATHS = [
  "/account",
  "/new-request",
  "/requests/d0000000-0000-4000-8000-000000000001/offers",
  "/requests/d0000000-0000-4000-8000-000000000001/chat",
  "/requests/d0000000-0000-4000-8000-000000000004/summary",
];

const PRO_PATHS = [
  "/pro/dashboard",
  "/pro/jobs",
  "/pro/offers",
  "/pro/my-jobs",
  "/pro/wallet",
  "/pro/settings",
  "/pro/profile",
  "/pro/messages",
  "/pro/help",
];

const ADMIN_PATHS = [
  "/admin",
  "/admin/pros",
  "/admin/jobs",
  "/admin/jobs/d0000000-0000-4000-8000-000000000004",
  "/admin/disputes",
];

for (const [label, viewport] of [
  ["mobile", MOBILE],
  ["desktop", DESKTOP],
] as const) {
  test.describe(`${label} — public pages`, () => {
    test.use({ storageState: { cookies: [], origins: [] }, viewport });

    for (const path of PUBLIC_PATHS) {
      test(path, async ({ page }) => {
        await expectRtl(page, path);
      });
    }
  });

  test.describe(`${label} — the customer's screens`, () => {
    test.use({ storageState: storageStatePath("customer"), viewport });

    for (const path of CUSTOMER_PATHS) {
      test(path, async ({ page }) => {
        await expectRtl(page, path);
      });
    }
  });

  test.describe(`${label} — the pro's screens`, () => {
    test.use({ storageState: storageStatePath("pro"), viewport });

    for (const path of PRO_PATHS) {
      test(path, async ({ page }) => {
        await expectRtl(page, path);
      });
    }
  });

  test.describe(`${label} — the admin console`, () => {
    test.use({ storageState: storageStatePath("admin"), viewport });

    for (const path of ADMIN_PATHS) {
      test(path, async ({ page }) => {
        await expectRtl(page, path);
      });
    }
  });
}

/**
 * A number inside a Hebrew sentence is a separate bidi run, and the Unicode
 * algorithm will happily reorder it into something a person reads wrong.
 * CLAUDE.md section 3 is explicit about this, and `.ltr-nums` is the mechanism
 * — so it had better be doing something.
 */
test.describe("numbers inside Hebrew text", () => {
  test.use({ storageState: storageStatePath("customer") });

  test("prices and references are isolated left-to-right", async ({ page }) => {
    await page.goto("/requests/d0000000-0000-4000-8000-000000000004/summary");

    const nums = page.locator(".ltr-nums").first();
    await expect(nums).toBeVisible();

    const applied = await nums.evaluate((el) => {
      const style = getComputedStyle(el);
      return { direction: style.direction, bidi: style.unicodeBidi };
    });

    expect(applied.direction).toBe("ltr");
    expect(applied.bidi).toBe("isolate");
  });

  test("the job reference reads as one run", async ({ page }) => {
    await page.goto("/requests/d0000000-0000-4000-8000-000000000004/summary");

    // H-xxxxx is Latin, a hyphen and digits in a Hebrew line — three runs
    // unless something says otherwise. `dir="ltr"` on the element is what
    // says otherwise.
    const reference = page.locator("[dir='ltr']", { hasText: /^H-/ }).first();
    await expect(reference).toBeVisible();
    expect(await reference.getAttribute("dir")).toBe("ltr");
  });
});
