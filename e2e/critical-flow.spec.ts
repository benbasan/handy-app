import { expect, test, type Page } from "@playwright/test";
import { DEMO_USERS, storageStatePath } from "./demo-users";
import { TINY_JPEG, uniqueMarker } from "./helpers";

/**
 * One call, from posting to receipt — docs/roadmap.md, Phase 9:
 * "פרסום קריאה → הצעה → בחירה → עדכון מחיר → סיום → תשלום".
 *
 * This is the promise the product is named after, and it crosses two people,
 * eight screens, four `security definer` functions and a file in Storage. Each
 * of those is covered somewhere already — pgTAP proves the policies, Vitest
 * proves the schemas — and none of that would notice a form posting the wrong
 * field name, a redirect pointing at a route that no longer exists, or a
 * Server Action whose result never reaches the screen. That is what this is
 * for.
 *
 * Nothing is mocked. The customer and the pro each drive a real browser
 * context against a production build and the real local Supabase stack, and
 * every number asserted below is read back off the rendered page.
 */

const CATEGORY = "אינסטלציה";
const ADDRESS = "רחוב דיזנגוף 100, תל אביב";

/** The agreed price, and what the field update raises it to. */
const BID_PRICE = 380;
const UPDATED_PRICE = 520;
/**
 * Business rule 3, on the total: 12% of 520. Written out rather than computed,
 * so a bug in `commissionOf()` cannot agree with itself.
 *
 * A regex because the two places it appears disagree about the trailing zero —
 * the screen formats it for a person (62.4 ₪) and `commission_charges` stores
 * the agora (62.40). Both are the same number, and asserting a shape that
 * accepts either is the honest way to say so.
 */
const COMMISSION = /62\.40?/;

test.describe("a call from posting to receipt", () => {
  // Serial, and deliberately one test rather than six: the steps are a single
  // story about one job, and a "select an offer" test that had to first post a
  // job and bid on it would be this test with worse names.
  test.describe.configure({ mode: "serial" });

  test("customer posts, pro bids, price is updated in the field, and the job closes", async ({
    browser,
  }) => {
    const customer = await browser.newPage({
      storageState: storageStatePath("customer"),
    });
    const pro = await browser.newPage({
      storageState: storageStatePath("pro"),
    });

    const marker = uniqueMarker("E2E");
    const description = `${marker} — נזילה מתחת לכיור במטבח, המים מצטברים על הרצפה`;

    // ---------------------------------------------------------------------
    // 1. The customer posts the call (Phase 2)
    // ---------------------------------------------------------------------

    await customer.goto("/new-request");

    await customer.getByRole("radio", { name: CATEGORY }).click();
    await customer.getByLabel("תיאור התקלה").fill(description);
    await customer.getByRole("radio", { name: "דחוף — עוד שעה" }).click();
    await customer.getByLabel("כתובת מלאה").fill(ADDRESS);

    // The summary card beside the form is the customer's own read-back of what
    // they are about to publish, so it is worth one assertion before the press.
    await expect(
      customer.getByRole("term").filter({ hasText: "תחום" }),
    ).toBeVisible();

    await customer.getByRole("button", { name: "פרסם קריאה" }).click();

    await customer.waitForURL(/\/new-request\/published\/[0-9a-f-]{36}/);
    const jobId = jobIdFrom(customer.url());

    // ---------------------------------------------------------------------
    // 2. The pro finds it in their feed (Phase 3)
    //
    // Reached through the feed rather than by URL on purpose: that this job
    // appears at all is the radius rule — enforced in the RLS policy on
    // `jobs`, not in the query — actually working end to end.
    // ---------------------------------------------------------------------

    await pro.goto("/pro/jobs");

    const card = pro.locator("li").filter({ hasText: marker });
    await expect(card, "the new call reaches the pro's feed").toBeVisible();
    await expect(card).toContainText("אינסטלציה");

    await card.getByRole("link", { name: "הגש הצעת מחיר" }).click();
    await pro.waitForURL(`**/pro/jobs/${jobId}/quote`);

    // ---------------------------------------------------------------------
    // 3. The pro quotes (Phase 4)
    // ---------------------------------------------------------------------

    await pro.getByLabel("מחיר מדויק בשקלים").fill(String(BID_PRICE));
    // Blur, so the form's clamp runs the way it does for a person tabbing on.
    await pro.getByLabel("מחיר מדויק בשקלים").blur();
    await pro.getByRole("button", { name: "30 דק׳" }).click();
    await pro
      .getByLabel("הערה ללקוח")
      .fill("כולל ביקור, חלקים ואחריות שנה על העבודה.");

    // The 12% is shown to the pro before they commit to the price — the whole
    // reason that card is on this screen.
    await expect(pro.getByText("עמלת Handy (12%)")).toBeVisible();

    await pro.getByRole("button", { name: "שלח הצעה ללקוח" }).click();
    await pro.waitForURL(/\/pro\/offers/);

    // ---------------------------------------------------------------------
    // 4. The customer compares and chooses (Phase 4)
    // ---------------------------------------------------------------------

    await customer.goto(`/requests/${jobId}/offers`);

    const offer = customer
      .locator("li")
      .filter({ hasText: DEMO_USERS.pro.name });
    await expect(offer).toContainText(String(BID_PRICE));
    await expect(offer).toContainText("כולל ביקור");

    await offer.getByRole("button", { name: "בחר הצעה" }).click();

    await expect(
      customer.getByRole("heading", { name: "בחרתם בעל מקצוע — הקריאה שובצה" }),
    ).toBeVisible();

    // ---------------------------------------------------------------------
    // 5. The pro arrives (Phase 5)
    // ---------------------------------------------------------------------

    await pro.goto(`/pro/jobs/${jobId}`);
    await pro.getByRole("button", { name: "לחץ: הגעתי ללקוח" }).click();
    await expect(pro.getByText("העבודה בביצוע")).toBeVisible();

    // ---------------------------------------------------------------------
    // 6. The field price update — the rule the product is named after
    //
    // The photo is uploaded for real, browser to Storage, because business
    // rule 1 is that there is no price change without one. A stubbed input
    // would test the disabled attribute and nothing else.
    // ---------------------------------------------------------------------

    const submitUpdate = pro.getByRole("button", {
      name: /שלח בקשת אישור ללקוח|צלם את התקלה כדי להמשיך/,
    });
    await expect(
      submitUpdate,
      "no price change is offerable before a photo exists",
    ).toBeDisabled();

    await pro.getByLabel("תמונת התקלה").setInputFiles({
      name: "fault.jpg",
      mimeType: "image/jpeg",
      buffer: TINY_JPEG,
    });

    await expect(
      pro.getByRole("button", { name: "החלפת התמונה" }),
    ).toBeVisible();

    await pro.getByRole("button", { name: "צינור סדוק" }).first().click();
    await pro.getByLabel("מחיר מעודכן").fill(String(UPDATED_PRICE));

    await pro.getByRole("button", { name: "שלח בקשת אישור ללקוח" }).click();

    // Either wording is a pass: the form's own confirmation, or the pending
    // card the router refresh puts in its place a moment later. Which one wins
    // the race is not something this test is about.
    await expect(
      pro.getByRole("heading", {
        name: /הבקשה נשלחה ללקוח|בקשת עדכון מחיר נשלחה/,
      }),
    ).toBeVisible();
    await expect(
      pro.getByText(/עד שהלקוח יאשר, העבודה .*במחיר המקורי/),
      "and the pro is told the old price still stands until it is answered",
    ).toBeVisible();

    // ---------------------------------------------------------------------
    // 7. The customer decides (Phase 5, product-spec.md 3.5)
    // ---------------------------------------------------------------------

    await customer.goto(`/requests/${jobId}/track`);

    const decision = customer.locator("section").filter({
      has: customer.getByRole("heading", { name: "בקשת עדכון מחיר" }),
    });

    // The five things the spec says must be on screen before the press.
    await expect(
      decision.getByAltText("התמונה שצילם בעל המקצוע בשטח"),
    ).toBeVisible();
    await expect(decision).toContainText("מחיר מקורי");
    await expect(decision).toContainText(String(BID_PRICE));
    await expect(decision).toContainText(String(UPDATED_PRICE));
    await expect(decision).toContainText("ההפרש");

    await decision
      .getByRole("button", { name: "מאשר את המחיר המעודכן" })
      .click();

    // Asserted on what the server re-renders, not on the form's own optimistic
    // heading: the router refresh replaces the whole card, and which of the
    // two the assertion catches is a race this test has no interest in.
    // `job_effective_price()` is the number that matters, and it is on screen.
    await expect(
      customer.getByText("אושר על ידך"),
      "the approved update is on the record, in the customer's own words",
    ).toBeVisible();
    await expect(
      customer.getByText("מחיר מאושר", { exact: true }).locator(".."),
      "and job_effective_price() is now the approved one",
    ).toContainText(String(UPDATED_PRICE));

    // ---------------------------------------------------------------------
    // 8. The pro closes the job and records the collection (Phase 6)
    // ---------------------------------------------------------------------

    await pro.goto(`/pro/jobs/${jobId}`);

    const closing = pro.locator("section").filter({
      has: pro.getByRole("heading", { name: "מחיר מאושר לקריאה" }),
    });

    await expect(
      closing,
      "the closing card bills the approved total, not the original bid",
    ).toContainText(String(UPDATED_PRICE));
    await expect(closing).toContainText(COMMISSION);

    const close = closing.getByRole("button", { name: "סיימתי — עדכן גבייה" });
    await expect(
      close,
      "and refuses to close until the pro says how they were paid",
    ).toBeDisabled();

    await closing.getByRole("button", { name: "מזומן", exact: true }).click();
    await close.click();

    // ---------------------------------------------------------------------
    // 9. The customer's summary, receipt and rating (Phase 6)
    // ---------------------------------------------------------------------

    await customer.goto(`/requests/${jobId}/summary`);

    await expect(
      customer.getByRole("heading", { name: "העבודה הושלמה" }),
    ).toBeVisible();

    const billing = customer.locator("aside");
    await expect(billing).toContainText("סיכום חיוב");
    await expect(
      billing,
      "base plus the approved delta is the total",
    ).toContainText(String(UPDATED_PRICE));
    await expect(
      customer.getByText("התשלום מתבצע ישירות לבעל המקצוע"),
      "Handy is never a party to the payment — business rule 4",
    ).toBeVisible();
    // The four chips are what the pro recorded, not a form: the customer's
    // screen shows which one was ticked, and offers no way to change it.
    await expect(
      customer.getByRole("listitem").filter({ hasText: "מזומן" }),
      "the collection the pro declared is the one shown to the customer",
    ).toContainText("✓");

    // The 12% is between Handy and the pro. A customer's copy of anything must
    // not carry it.
    await expect(
      customer.getByText("עמלת Handy"),
      "the commission is not the customer's business",
    ).toHaveCount(0);

    // The receipt PDF, fetched through the customer's own session.
    const receipt = await customer.request.get(`/api/receipts/${jobId}`);
    expect(receipt.status()).toBe(200);
    expect(receipt.headers()["content-type"]).toContain("application/pdf");
    expect((await receipt.body()).subarray(0, 5).toString()).toBe("%PDF-");

    // The rating, which only exists because the job is finished.
    // The radio itself is `sr-only` and the star drawn over it swallows the
    // click, which is exactly how a person interacts with it too: they press
    // the star, and the label carries it to the input.
    await customer
      .locator("label")
      .filter({ has: customer.getByRole("radio", { name: "5 כוכבים" }) })
      .click();
    await customer
      .getByLabel("ביקורת")
      .fill("הגיע בזמן, הראה לי את התקלה לפני שעדכן את המחיר.");
    await customer.getByRole("button", { name: "שליחת הדירוג" }).click();
    await expect(customer.getByText("הדירוג נשמר — תודה!")).toBeVisible();

    // ---------------------------------------------------------------------
    // 10. …and the same job, as money, on the pro's side
    // ---------------------------------------------------------------------

    await pro.goto("/pro/wallet");
    await expect(pro.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(
      pro.locator("body"),
      "the commission the database computed reaches the wallet",
    ).toContainText(COMMISSION);

    await customer.close();
    await pro.close();
  });
});

/**
 * A refused price update leaves the job at the price that was agreed.
 *
 * The mirror image of step 7, and the half of business rule 1 that is easy to
 * leave untested because nothing visible happens: `job_effective_price()` has
 * never counted a pending or rejected row, so "אם הלקוח לא מאשר, העבודה
 * ממשיכה במחיר המקורי" is true by construction. This proves the construction.
 */
test("a refused field price update changes nothing", async ({ browser }) => {
  const customer = await browser.newPage({
    storageState: storageStatePath("customer"),
  });
  const pro = await browser.newPage({ storageState: storageStatePath("pro") });

  const marker = uniqueMarker("E2E-REFUSE");
  const jobId = await postAndAssign(customer, pro, marker, 300);

  await pro.goto(`/pro/jobs/${jobId}`);
  await pro.getByLabel("תמונת התקלה").setInputFiles({
    name: "fault.jpg",
    mimeType: "image/jpeg",
    buffer: TINY_JPEG,
  });
  await pro.getByLabel("מחיר מעודכן").fill("900");
  await pro.getByRole("button", { name: "שלח בקשת אישור ללקוח" }).click();
  await expect(
    pro.getByRole("heading", {
      name: /הבקשה נשלחה ללקוח|בקשת עדכון מחיר נשלחה/,
    }),
  ).toBeVisible();

  await customer.goto(`/requests/${jobId}/track`);
  await customer.getByRole("button", { name: "לא מאשר" }).click();

  await expect(customer.getByText("לא אושר — נשאר המחיר המקורי")).toBeVisible();
  await expect(
    customer.getByText("מחיר מאושר", { exact: true }).locator(".."),
    "the live price never moved",
  ).toContainText("300");

  // The pro's closing card is the number that will actually be charged.
  await pro.goto(`/pro/jobs/${jobId}`);
  const closing = pro.locator("section").filter({
    has: pro.getByRole("heading", { name: "מחיר מאושר לקריאה" }),
  });
  await expect(
    closing,
    "the refused 900 is nowhere in the price",
  ).toContainText("300");
  await expect(closing).not.toContainText("900");

  await customer.close();
  await pro.close();
});

function jobIdFrom(url: string): string {
  const id =
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/.exec(
      url,
    )?.[0];
  if (!id) throw new Error(`no job id in ${url}`);
  return id;
}

/** Post a call, bid on it, choose the bid, and arrive. Returns the job id. */
async function postAndAssign(
  customer: Page,
  pro: Page,
  marker: string,
  price: number,
): Promise<string> {
  await customer.goto("/new-request");
  await customer.getByRole("radio", { name: CATEGORY }).click();
  await customer.getByLabel("תיאור התקלה").fill(`${marker} — ברז דולף באמבטיה`);
  await customer.getByRole("radio", { name: "היום" }).click();
  await customer.getByLabel("כתובת מלאה").fill(ADDRESS);
  await customer.getByRole("button", { name: "פרסם קריאה" }).click();
  await customer.waitForURL(/\/new-request\/published\/[0-9a-f-]{36}/);

  const jobId = jobIdFrom(customer.url());

  await pro.goto(`/pro/jobs/${jobId}/quote`);
  await pro.getByLabel("מחיר מדויק בשקלים").fill(String(price));
  await pro.getByLabel("מחיר מדויק בשקלים").blur();
  await pro.getByRole("button", { name: "שלח הצעה ללקוח" }).click();
  await pro.waitForURL(/\/pro\/offers/);

  await customer.goto(`/requests/${jobId}/offers`);
  await customer
    .locator("li")
    .filter({ hasText: DEMO_USERS.pro.name })
    .getByRole("button", { name: "בחר הצעה" })
    .click();
  await expect(
    customer.getByRole("heading", { name: "בחרתם בעל מקצוע — הקריאה שובצה" }),
  ).toBeVisible();

  await pro.goto(`/pro/jobs/${jobId}`);
  await pro.getByRole("button", { name: "לחץ: הגעתי ללקוח" }).click();
  await expect(pro.getByText("העבודה בביצוע")).toBeVisible();

  return jobId;
}
