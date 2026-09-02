import { describe, expect, it } from "vitest";
import { bidHighlights, sortBids, type JobBid } from "@/lib/supabase/bids";
import type { BidStatus } from "@/lib/validation/bids";

/**
 * The two pure functions in lib/supabase/bids.ts: the sort behind the three
 * tabs on design/screens/customer-2.2-compare-bids.png, and the green tags
 * beside each offer.
 *
 * Both decide what the customer is nudged towards, so both are worth pinning.
 * The queries in the same file are not tested here — they are thin wrappers
 * over database functions whose behaviour is proven in pgTAP, where it runs.
 */

function bid(
  id: string,
  price: number,
  etaMinutes: number,
  rating: number | null,
  status: BidStatus = "pending",
): JobBid {
  return {
    id,
    proId: `pro-${id}`,
    proName: `בעל מקצוע ${id}`,
    proRating: rating,
    proJobsCompleted: 100,
    proVerified: true,
    price,
    etaMinutes,
    note: null,
    status,
    expiresAt: "2099-01-01T00:00:00Z",
    createdAt: "2026-09-04T09:00:00Z",
    unreadCount: 0,
  };
}

const OFFERS = [
  bid("a", 380, 25, 4.9),
  bid("b", 340, 40, 4.7),
  bid("c", 300, 55, 4.6),
];

describe("sortBids", () => {
  it("orders by price for המחיר הזול", () => {
    expect(sortBids(OFFERS, "cheapest").map((b) => b.id)).toEqual([
      "c",
      "b",
      "a",
    ]);
  });

  it("orders by arrival time for הגעה מהירה", () => {
    expect(sortBids(OFFERS, "fastest").map((b) => b.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("orders by rating first for מומלץ, settling ties on price", () => {
    const tied = [bid("x", 400, 30, 4.8), bid("y", 250, 30, 4.8)];
    expect(sortBids(tied, "recommended").map((b) => b.id)).toEqual(["y", "x"]);
  });

  it("keeps settled offers below live ones whatever the sort", () => {
    const withDead = [
      bid("cheap-but-dead", 100, 10, 5, "expired"),
      bid("live", 380, 25, 4.9),
    ];

    expect(sortBids(withDead, "cheapest")[0]!.id).toBe("live");
    expect(sortBids(withDead, "fastest")[0]!.id).toBe("live");
    expect(sortBids(withDead, "recommended")[0]!.id).toBe("live");
  });

  it("does not mutate the list it was given", () => {
    const original = [...OFFERS];
    sortBids(OFFERS, "cheapest");
    expect(OFFERS).toEqual(original);
  });

  it("treats a pro with no rating yet as unrated rather than as five stars", () => {
    const mixed = [bid("unrated", 300, 30, null), bid("rated", 380, 30, 4.2)];
    expect(sortBids(mixed, "recommended")[0]!.id).toBe("rated");
  });
});

describe("bidHighlights", () => {
  it("tags the cheapest, the fastest and the recommended offer", () => {
    const tags = bidHighlights(OFFERS);

    expect(tags.get("c")).toContain("המחיר הזול");
    expect(tags.get("a")).toContain("הגעה מהירה");
    expect(tags.get("a")).toContain("מומלץ Handy");
  });

  it("says nothing when there is only one live offer to compare against", () => {
    expect(bidHighlights([OFFERS[0]!]).size).toBe(0);
    expect(
      bidHighlights([OFFERS[0]!, bid("dead", 100, 5, 5, "expired")]).size,
    ).toBe(0);
  });

  it("never awards a tag to a settled offer", () => {
    const tags = bidHighlights([
      bid("dead-cheap", 50, 5, 5, "rejected"),
      ...OFFERS,
    ]);

    expect(tags.has("dead-cheap")).toBe(false);
    expect(tags.get("c")).toContain("המחיר הזול");
  });
});
