import { expect, test } from "@playwright/test";
import { storageStatePath } from "./demo-users";

/**
 * The address field, on a build with no Google Maps key — which is every build
 * of this product (CLAUDE.md §2).
 *
 * The flow this covers used to fail on the server: an address naming no
 * locality was accepted by the form, refused by `postJob`, and reported back
 * to the customer as their fault. Now the gazetteer runs in the browser as
 * they type, and the repair is offered where the mistake is.
 *
 * Deliberately not part of critical-flow.spec.ts: that one asserts a call
 * reaching a receipt, and this one asserts what happens when it does not get
 * that far. Mixing them would make a failure here read as a broken marketplace.
 */
test.use({ storageState: storageStatePath("customer") });

test.describe("finding the locality in a typed address", () => {
  test("confirms the town as the customer types", async ({ page }) => {
    await page.goto("/new-request");

    const address = page.getByLabel("כתובת מלאה");
    await address.fill("רחוב הרצל 12, פתח תקוה");

    // The spelling with one ו is a Wikidata altLabel of the spelling with two,
    // and the canonical name is what comes back.
    await expect(page.getByText("זוהה: פתח תקווה")).toBeVisible();

    // Nothing to repair, so the town picker stays away.
    await expect(
      page.getByLabel("לא זיהינו את היישוב — בחרו אותו מהרשימה"),
    ).toBeHidden();
  });

  test("offers a town to pick when it recognises none, before anything is submitted", async ({
    page,
  }) => {
    await page.goto("/new-request");

    await page.getByLabel("כתובת מלאה").fill("רחוב כלשהו 3");

    const picker = page.getByLabel("לא זיהינו את היישוב — בחרו אותו מהרשימה");
    await expect(picker).toBeVisible();

    await picker.selectOption("נתניה");

    // Appended after the last comma, which is where job_city() reads it.
    await expect(page.getByLabel("כתובת מלאה")).toHaveValue(
      "רחוב כלשהו 3, נתניה",
    );
    await expect(page.getByText("זוהה: נתניה")).toBeVisible();
    await expect(picker).toBeHidden();
  });

  test("posts a call whose address needed the town appended", async ({
    page,
  }) => {
    await page.goto("/new-request");

    await page.getByRole("radio", { name: "אינסטלציה" }).click();
    await page
      .getByLabel("תיאור התקלה")
      .fill("E2E כתובת — ברז דולף במטבח, המים מטפטפים כל הלילה");
    await page.getByRole("radio", { name: "דחוף — עוד שעה" }).click();

    // No town at the end, and a flat number in the middle — the shape that
    // used to be filed in the admin console under "דירה 4".
    await page.getByLabel("כתובת מלאה").fill("הרצל 12, דירה 4");
    await page
      .getByLabel("לא זיהינו את היישוב — בחרו אותו מהרשימה")
      .selectOption("רעננה");

    await page.getByRole("button", { name: "פרסם קריאה" }).click();
    await page.waitForURL(/\/new-request\/published\/[0-9a-f-]{36}/);

    await expect(page.getByText("הרצל 12, דירה 4, רעננה")).toBeVisible();
  });
});
