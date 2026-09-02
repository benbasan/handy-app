import { describe, expect, it } from "vitest";
import {
  BID_VALIDITY_MINUTES,
  initials,
  isBidSort,
  isBidStatus,
  minutesLeft,
  relativeTime,
  selectBidSchema,
  submitBidSchema,
  updateBidSchema,
} from "@/lib/validation/bids";
import { commissionBreakdown } from "@/lib/validation/pros";

/**
 * The bid schemas and the small pure helpers around them.
 *
 * What is *not* tested here, on purpose: that a pro cannot set their own bid's
 * status, that an expired bid cannot be chosen, that choosing one bid locks the
 * rest. Those are RLS and trigger behaviour, they are enforced in the database,
 * and mocking them in JS would prove nothing about the thing that runs in
 * production — see supabase/tests/rls_test.sql section 11.
 */

const JOB = "d0000000-0000-4000-8000-000000000001";
const BID = "b0000000-0000-4000-8000-000000000001";

describe("submitBidSchema", () => {
  it("accepts a plain offer and coerces the numbers a form sends as strings", () => {
    const parsed = submitBidSchema.safeParse({
      jobId: JOB,
      price: "320",
      etaMinutes: "30",
      note: "אחריות שנה",
    });

    expect(parsed.success).toBe(true);
    expect(parsed.data).toMatchObject({ price: 320, etaMinutes: 30 });
  });

  it("turns an untouched note into undefined rather than an empty string", () => {
    const parsed = submitBidSchema.parse({
      jobId: JOB,
      price: "320",
      etaMinutes: "30",
      note: "   ",
    });

    expect(parsed.note).toBeUndefined();
  });

  it("rejects a price below the floor", () => {
    const parsed = submitBidSchema.safeParse({
      jobId: JOB,
      price: "10",
      etaMinutes: "30",
    });

    expect(parsed.success).toBe(false);
  });

  it("rejects a fractional price — offers are in whole shekels", () => {
    const parsed = submitBidSchema.safeParse({
      jobId: JOB,
      price: "320.5",
      etaMinutes: "30",
    });

    expect(parsed.success).toBe(false);
  });

  it("rejects a zero or negative arrival time", () => {
    for (const etaMinutes of ["0", "-15"]) {
      expect(
        submitBidSchema.safeParse({ jobId: JOB, price: "320", etaMinutes })
          .success,
      ).toBe(false);
    }
  });

  it("has no field for the deadline — 45 minutes is the column's, not the form's", () => {
    const parsed = submitBidSchema.parse({
      jobId: JOB,
      price: "320",
      etaMinutes: "30",
      expiresAt: "2099-01-01T00:00:00Z",
    });

    expect(parsed).not.toHaveProperty("expiresAt");
    expect(BID_VALIDITY_MINUTES).toBe(45);
  });

  it("has no field for the status, and none for the commission", () => {
    const parsed = submitBidSchema.parse({
      jobId: JOB,
      price: "320",
      etaMinutes: "30",
      status: "selected",
      commission: 0,
    });

    expect(parsed).not.toHaveProperty("status");
    expect(parsed).not.toHaveProperty("commission");
  });
});

describe("updateBidSchema", () => {
  it("keys on the bid rather than the job — the offer already exists", () => {
    const parsed = updateBidSchema.safeParse({
      bidId: BID,
      price: "390",
      etaMinutes: "45",
    });

    expect(parsed.success).toBe(true);
    expect(parsed.data?.bidId).toBe(BID);
  });

  it("rejects anything that is not a uuid", () => {
    expect(
      updateBidSchema.safeParse({
        bidId: "8842",
        price: "390",
        etaMinutes: "45",
      }).success,
    ).toBe(false);
  });
});

describe("selectBidSchema", () => {
  it("carries the bid id and nothing else the customer could dictate", () => {
    const parsed = selectBidSchema.parse({
      bidId: BID,
      price: 1,
      status: "selected",
    });

    expect(Object.keys(parsed)).toEqual(["bidId"]);
  });
});

describe("commissionBreakdown", () => {
  it("takes 12% from the pro and leaves the rest, adding back to the price", () => {
    const { commission, net } = commissionBreakdown(320);

    expect(commission).toBe(38.4);
    expect(net).toBe(281.6);
    expect(commission + net).toBe(320);
  });

  it("still adds back up on a price that does not divide cleanly", () => {
    for (const price of [333, 1, 99999, 4567]) {
      const { commission, net } = commissionBreakdown(price);
      expect(Number((commission + net).toFixed(2))).toBe(price);
    }
  });
});

describe("minutesLeft", () => {
  const now = Date.parse("2026-09-04T10:00:00Z");

  it("counts down from the deadline the database wrote", () => {
    expect(minutesLeft("2026-09-04T10:38:00Z", now)).toBe(38);
  });

  it("never goes negative — a lapsed offer has zero minutes, not minus five", () => {
    expect(minutesLeft("2026-09-04T09:55:00Z", now)).toBe(0);
  });
});

describe("relativeTime", () => {
  const now = Date.parse("2026-09-04T10:00:00Z");

  it("stamps a card the way both designs do", () => {
    expect(relativeTime("2026-09-04T09:59:50Z", now)).toBe("עכשיו");
    expect(relativeTime("2026-09-04T09:59:00Z", now)).toBe("לפני דקה");
    expect(relativeTime("2026-09-04T09:48:00Z", now)).toBe("לפני 12 דק׳");
    expect(relativeTime("2026-09-04T09:00:00Z", now)).toBe("לפני שעה");
    expect(relativeTime("2026-09-04T05:00:00Z", now)).toBe("לפני 5 שעות");
    expect(relativeTime("2026-09-03T10:00:00Z", now)).toBe("אתמול");
    expect(relativeTime("2026-09-01T10:00:00Z", now)).toBe("לפני 3 ימים");
  });
});

describe("initials", () => {
  it("builds the avatar the compare screen shows beside each offer", () => {
    expect(initials("דוד לוי")).toBe("ד.ל.");
    expect(initials("אלכס")).toBe("א.");
    expect(initials("  מוסא   חדד  ")).toBe("מ.ח.");
  });

  it("copes with a pro who never filled in a name", () => {
    expect(initials(null)).toBe("??");
    expect(initials("   ")).toBe("??");
  });
});

describe("status and sort guards", () => {
  it("recognises exactly the four statuses the database can report", () => {
    for (const status of ["pending", "selected", "rejected", "expired"]) {
      expect(isBidStatus(status)).toBe(true);
    }
    expect(isBidStatus("draft")).toBe(false);
  });

  it("falls back rather than trusting a sort name off the query string", () => {
    expect(isBidSort("cheapest")).toBe(true);
    expect(isBidSort("price; drop table bids")).toBe(false);
    expect(isBidSort(undefined)).toBe(false);
  });
});
