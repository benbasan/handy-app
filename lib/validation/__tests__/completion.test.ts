import { describe, expect, it } from "vitest";
import {
  COMMISSION_RATE,
  commissionOf,
  completeJobSchema,
  earningsByDay,
  isEarningsRange,
  isPaymentMethod,
  netOf,
  rangeStart,
  receiptLines,
  submitReviewSchema,
} from "@/lib/validation/completion";

/**
 * The money arithmetic on this screen is *display* arithmetic — the charged
 * number is `round(total * commission_rate(), 2)` inside `complete_job()`, and
 * supabase/tests/rls_test.sql proves that one. What these tests protect is the
 * promise that the two agree: a pro who is shown 62.40 before pressing the
 * button and charged something else afterwards has been lied to, and that is
 * exactly the kind of drift a unit test catches and a schema cannot.
 */
describe("commission", () => {
  it("is 12%", () => {
    expect(COMMISSION_RATE).toBe(0.12);
  });

  it("matches the number the database charges on the design's own job", () => {
    // 380 base + 140 approved = 520, the figures on
    // design/screens/customer-4.1-summary-receipt-rating.png.
    expect(commissionOf(520)).toBe(62.4);
    expect(netOf(520)).toBe(457.6);
  });

  it("rounds to agorot rather than trailing float noise", () => {
    expect(commissionOf(333)).toBe(39.96);
    expect(commissionOf(0.1)).toBe(0.01);
    // 12% of 1 is 0.12 exactly; in binary floating point it is not.
    expect(commissionOf(1)).toBe(0.12);
  });

  it("leaves the pro the rest, to the agora", () => {
    expect(commissionOf(333) + netOf(333)).toBe(333);
  });
});

describe("receiptLines", () => {
  it("is just the bid when nothing was approved", () => {
    expect(receiptLines(380, [])).toEqual([
      { label: "עבודה בסיסית", amount: 380, delta: false },
    ]);
  });

  it("adds one line per approved update, as the delta the customer agreed to", () => {
    const lines = receiptLines(380, [{ originalPrice: 380, newPrice: 520 }]);

    expect(lines).toHaveLength(2);
    expect(lines[1]).toEqual({
      label: "עדכון מחיר מאושר",
      amount: 140,
      delta: true,
    });
  });

  it("adds up to the total, through a chain of approvals", () => {
    const approved = [
      { originalPrice: 380, newPrice: 520 },
      { originalPrice: 520, newPrice: 600 },
    ];

    const sum = receiptLines(380, approved).reduce(
      (total, line) => total + line.amount,
      0,
    );

    // The last approved new_price is what job_effective_price() reports, and
    // base + every delta has to be the same number.
    expect(sum).toBe(600);
  });

  it("orders the deltas by the price they were measured from, whatever order they arrive in", () => {
    const scrambled = [
      { originalPrice: 520, newPrice: 600 },
      { originalPrice: 380, newPrice: 520 },
    ];

    expect(receiptLines(380, scrambled).map((line) => line.amount)).toEqual([
      380, 140, 80,
    ]);
  });
});

describe("completeJobSchema", () => {
  const jobId = "d0000000-0000-4000-8000-000000000001";

  it("accepts the four methods the receipt can name", () => {
    for (const paymentMethod of ["cash", "bit", "paybox", "bank_transfer"]) {
      expect(
        completeJobSchema.safeParse({ jobId, paymentMethod }).success,
      ).toBe(true);
    }
  });

  it("refuses a method nobody can be paid by", () => {
    expect(
      completeJobSchema.safeParse({ jobId, paymentMethod: "crypto" }).success,
    ).toBe(false);
  });

  it("has no field for the price — the total is read server-side", () => {
    const parsed = completeJobSchema.parse({ jobId, paymentMethod: "cash" });
    expect(Object.keys(parsed)).toEqual(["jobId", "paymentMethod"]);
  });
});

describe("submitReviewSchema", () => {
  const jobId = "d0000000-0000-4000-8000-000000000001";

  it("takes one to five stars", () => {
    expect(submitReviewSchema.safeParse({ jobId, rating: 1 }).success).toBe(
      true,
    );
    expect(submitReviewSchema.safeParse({ jobId, rating: 5 }).success).toBe(
      true,
    );
    expect(submitReviewSchema.safeParse({ jobId, rating: 0 }).success).toBe(
      false,
    );
    expect(submitReviewSchema.safeParse({ jobId, rating: 6 }).success).toBe(
      false,
    );
  });

  it("reads the string a form sends", () => {
    const parsed = submitReviewSchema.parse({ jobId, rating: "4" });
    expect(parsed.rating).toBe(4);
  });

  it("drops an empty comment rather than storing a blank one", () => {
    expect(
      submitReviewSchema.parse({ jobId, rating: 5, comment: "   " }).comment,
    ).toBeUndefined();
  });
});

describe("payment methods", () => {
  it("narrows the pro's own text[] to the four the receipt knows", () => {
    expect(isPaymentMethod("bit")).toBe(true);
    // The spelling Phase 3 used before Phase 6 unified the two vocabularies.
    expect(isPaymentMethod("transfer")).toBe(false);
  });
});

describe("earnings ranges", () => {
  const now = new Date("2026-09-03T21:30:00+03:00");

  it("recognises only the three the toggle offers", () => {
    expect(isEarningsRange("week")).toBe(true);
    expect(isEarningsRange("year")).toBe(false);
    expect(isEarningsRange(undefined)).toBe(false);
  });

  it("starts היום at local midnight, not 24 hours ago", () => {
    const start = rangeStart("today", now);
    expect(start.getHours()).toBe(0);
    expect(start.getDate()).toBe(now.getDate());
  });

  it("starts השבוע six midnights back, so the range covers seven days including today", () => {
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);

    const start = rangeStart("week", now);
    const days = Math.round(
      (today.getTime() - start.getTime()) / (24 * 60 * 60 * 1000),
    );

    expect(days).toBe(6);
    expect(start.getHours()).toBe(0);
  });

  it("buckets charges into the day they were charged on", () => {
    const bars = earningsByDay(
      [
        { chargedAt: "2026-09-03T10:00:00+03:00", totalPrice: 520 },
        { chargedAt: "2026-09-03T18:00:00+03:00", totalPrice: 260 },
        { chargedAt: "2026-09-01T09:00:00+03:00", totalPrice: 320 },
      ],
      "week",
      now,
    );

    expect(bars).toHaveLength(7);
    expect(bars.at(-1)).toMatchObject({ day: "2026-09-03", total: 780 });
    expect(bars.find((bar) => bar.day === "2026-09-01")?.total).toBe(320);
  });

  it("ignores a charge from outside the window rather than folding it into the last bar", () => {
    const bars = earningsByDay(
      [{ chargedAt: "2026-08-01T09:00:00+03:00", totalPrice: 999 }],
      "week",
      now,
    );

    expect(bars.every((bar) => bar.total === 0)).toBe(true);
  });

  it("draws seven bars for a month too — thirty would be a smear at this width", () => {
    expect(earningsByDay([], "month", now)).toHaveLength(7);
    expect(earningsByDay([], "today", now)).toHaveLength(1);
  });
});
