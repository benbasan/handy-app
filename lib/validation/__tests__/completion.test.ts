import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ACCEPTANCE_FEE,
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
 * The money on these screens is *display* money — what is actually charged is
 * `job_acceptance_fee()` inside `accept_job()`, and supabase/tests/rls_test.sql
 * proves that one. What these tests protect is the promise that the two agree:
 * a pro shown 35 ₪ under a button and charged something else afterwards has
 * been lied to, and that is exactly the kind of drift a unit test catches and
 * a schema cannot.
 */
describe("the acceptance fee", () => {
  it("is a flat 35 ₪", () => {
    expect(ACCEPTANCE_FEE).toBe(35);
  });

  /**
   * The number exists twice on purpose — once here for every screen that
   * shows it before it is charged, once in the migration as the function that
   * charges it. This is the test that keeps the two copies the same number.
   */
  it("matches job_acceptance_fee() in the migration, to the shekel", () => {
    const sql = readFileSync(
      "supabase/migrations/20260911120000_pro_acceptance_and_flat_fee.sql",
      "utf8",
    );
    const body = sql.slice(
      sql.indexOf("create function public.job_acceptance_fee()"),
    );
    const charged = body.match(/select (\d+(?:\.\d+)?)::numeric/);

    expect(charged).not.toBeNull();
    expect(Number(charged![1])).toBe(ACCEPTANCE_FEE);
  });

  it("leaves the pro the rest of what they collected", () => {
    // 380 base + 140 approved = 520, the figures on
    // design/screens/customer-4.1-summary-receipt-rating.png.
    expect(netOf(520)).toBe(485);
    expect(netOf(333)).toBe(298);
  });

  it("does not move with the size of the job", () => {
    expect(netOf(1000) + ACCEPTANCE_FEE).toBe(1000);
    expect(netOf(80) + ACCEPTANCE_FEE).toBe(80);
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

  it("buckets earnings into the day the job was closed on", () => {
    const bars = earningsByDay(
      [
        { completedAt: "2026-09-03T10:00:00+03:00", totalPrice: 520 },
        { completedAt: "2026-09-03T18:00:00+03:00", totalPrice: 260 },
        { completedAt: "2026-09-01T09:00:00+03:00", totalPrice: 320 },
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
      [{ completedAt: "2026-08-01T09:00:00+03:00", totalPrice: 999 }],
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
