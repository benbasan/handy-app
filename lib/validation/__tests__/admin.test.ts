import { describe, expect, it } from "vitest";
import {
  ADMIN_JOB_STATE_LABEL,
  adminJobFiltersSchema,
  adminJobState,
  DEFAULT_ADMIN_RANGE_DAYS,
  hebrewWeekday,
  percentChange,
  proEnforcementSchema,
} from "@/lib/validation/admin";

const PRO = "a0000000-0000-4000-8000-000000000003";

/**
 * Two things here are worth a test rather than a reading.
 *
 * The first is that "ללא הצעות" and "ממתין לבחירה" are the same `jobs.status`
 * told apart by whether anybody has offered — the design prints them as if
 * they were two statuses, and a reader of the table would reasonably assume a
 * column behind each.
 *
 * The second is that every filter comes off a query string, which is to say
 * from whatever somebody typed into the address bar. An operations console
 * that 500s because a URL was edited is worse than one that quietly falls back
 * to seven days.
 */
describe("what the jobs table calls a call's state", () => {
  it("separates a call nobody bid on from one waiting to be chosen", () => {
    expect(adminJobState("open", 0)).toBe("no_bids");
    expect(adminJobState("open", 3)).toBe("awaiting_choice");
    expect(adminJobState("bidding", 1)).toBe("awaiting_choice");
  });

  it("passes the later statuses through, since a bid count cannot change them", () => {
    expect(adminJobState("in_progress", 5)).toBe("in_progress");
    expect(adminJobState("completed", 1)).toBe("completed");
    expect(adminJobState("cancelled", 0)).toBe("cancelled");
  });

  it("prints the four labels from the design", () => {
    expect(ADMIN_JOB_STATE_LABEL.completed).toBe("הושלם");
    expect(ADMIN_JOB_STATE_LABEL.in_progress).toBe("בעבודה");
    expect(ADMIN_JOB_STATE_LABEL.no_bids).toBe("ללא הצעות");
    expect(ADMIN_JOB_STATE_LABEL.awaiting_choice).toBe("ממתין לבחירה");
  });

  it("does not invent a state for a status the table cannot hold", () => {
    expect(adminJobState("archived", 2)).toBe("draft");
  });
});

describe("the filters above the table", () => {
  it("passes a real filter set through", () => {
    const parsed = adminJobFiltersSchema.parse({
      search: "H-24817",
      status: "completed",
      category: "plumbing",
      city: "תל אביב",
      days: "30",
    });

    expect(parsed).toStrictEqual({
      search: "H-24817",
      status: "completed",
      category: "plumbing",
      city: "תל אביב",
      days: 30,
    });
  });

  it("treats every filter as absent when it is empty", () => {
    const parsed = adminJobFiltersSchema.parse({
      search: "  ",
      status: "",
      category: "",
      city: "",
      days: undefined,
    });

    expect(parsed.search).toBeUndefined();
    expect(parsed.status).toBeUndefined();
    expect(parsed.category).toBeUndefined();
    expect(parsed.city).toBeUndefined();
    expect(parsed.days).toBe(DEFAULT_ADMIN_RANGE_DAYS);
  });

  it("falls back rather than throwing on a hand-edited URL", () => {
    const parsed = adminJobFiltersSchema.parse({
      status: "deleted",
      category: "'; drop table jobs; --",
      days: "9999",
    });

    expect(parsed.status).toBeUndefined();
    expect(parsed.category).toBeUndefined();
    expect(parsed.days).toBe(DEFAULT_ADMIN_RANGE_DAYS);
  });
});

describe("enforcement actions", () => {
  it("are the closed vocabulary set_pro_enforcement() accepts", () => {
    expect(
      proEnforcementSchema.safeParse({
        proId: PRO,
        action: "block_price_updates",
      }).success,
    ).toBe(true);

    expect(
      proEnforcementSchema.safeParse({ proId: PRO, action: "ban" }).success,
    ).toBe(false);
  });

  it("cannot be used to verify a pro — that is a different function", () => {
    expect(
      proEnforcementSchema.safeParse({ proId: PRO, action: "verified" })
        .success,
    ).toBe(false);
  });
});

describe("the overview's comparisons", () => {
  it("reports the change between two spans", () => {
    expect(percentChange(148, 132)).toBe(12);
    expect(percentChange(90, 100)).toBe(-10);
  });

  it("says nothing rather than +100% when there is no previous span", () => {
    // A first month is a first month, not infinite growth.
    expect(percentChange(148, 0)).toBeNull();
  });
});

describe("the chart's day labels", () => {
  it("uses the א…ש letters the design prints", () => {
    // 2026-09-03 is a Thursday, which is ה.
    expect(hebrewWeekday(new Date(2026, 8, 3))).toBe("ה");
    expect(hebrewWeekday(new Date(2026, 8, 6))).toBe("א");
    expect(hebrewWeekday(new Date(2026, 8, 5))).toBe("ש");
  });
});
