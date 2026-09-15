import { describe, expect, it } from "vitest";
import {
  arrangeFeed,
  isFeedSort,
  lastOfferByTrade,
  pricingCoach,
  recentNotes,
} from "../feed";

const job = (
  id: string,
  over: Partial<{
    categorySlug: string;
    preferredTime: string | null;
    createdAt: string;
    distanceKm: number;
    bidsCount: number;
    requestedForMe: boolean;
  }> = {},
) => ({
  id,
  categorySlug: "plumbing",
  preferredTime: "this_week",
  createdAt: "2026-09-15T10:00:00Z",
  distanceKm: 5,
  bidsCount: 1,
  requestedForMe: false,
  ...over,
});

const FEED = [
  job("old-near", {
    createdAt: "2026-09-15T08:00:00Z",
    distanceKm: 1,
    bidsCount: 3,
  }),
  job("new-far", {
    createdAt: "2026-09-15T11:00:00Z",
    distanceKm: 9,
    bidsCount: 0,
  }),
  job("mid-electric", {
    categorySlug: "electrical",
    preferredTime: "asap",
    distanceKm: 4,
    bidsCount: 2,
  }),
];

const ids = (jobs: { id: string }[]) => jobs.map((j) => j.id);

describe("arrangeFeed", () => {
  it("sorts newest, nearest, or fewest offers first", () => {
    expect(
      ids(
        arrangeFeed(FEED, { sort: "new", category: null, urgentOnly: false }),
      ),
    ).toEqual(["new-far", "mid-electric", "old-near"]);
    expect(
      ids(
        arrangeFeed(FEED, { sort: "near", category: null, urgentOnly: false }),
      ),
    ).toEqual(["old-near", "mid-electric", "new-far"]);
    expect(
      ids(
        arrangeFeed(FEED, { sort: "few", category: null, urgentOnly: false }),
      ),
    ).toEqual(["new-far", "mid-electric", "old-near"]);
  });

  it("filters by trade and by urgency", () => {
    expect(
      ids(
        arrangeFeed(FEED, {
          sort: "new",
          category: "electrical",
          urgentOnly: false,
        }),
      ),
    ).toEqual(["mid-electric"]);
    expect(
      ids(arrangeFeed(FEED, { sort: "new", category: null, urgentOnly: true })),
    ).toEqual(["mid-electric"]);
  });

  it("keeps a call asked for by name first, whatever the sort", () => {
    const withDirected = [
      ...FEED,
      job("asked", { distanceKm: 40, requestedForMe: true }),
    ];
    expect(
      arrangeFeed(withDirected, {
        sort: "near",
        category: null,
        urgentOnly: false,
      })[0]!.id,
    ).toBe("asked");
  });

  it("recognises its own sort names only", () => {
    expect(isFeedSort("near")).toBe(true);
    expect(isFeedSort("cheapest")).toBe(false);
    expect(isFeedSort(undefined)).toBe(false);
  });
});

describe("lastOfferByTrade", () => {
  it("keeps the most recent offer in each trade", () => {
    const map = lastOfferByTrade([
      {
        jobId: "a",
        categorySlug: "plumbing",
        price: 300,
        etaMinutes: 30,
        createdAt: "2026-09-10T10:00:00Z",
      },
      {
        jobId: "b",
        categorySlug: "plumbing",
        price: 350,
        etaMinutes: 45,
        createdAt: "2026-09-12T10:00:00Z",
      },
      {
        jobId: "c",
        categorySlug: "electrical",
        price: 200,
        etaMinutes: 15,
        createdAt: "2026-09-11T10:00:00Z",
      },
    ]);
    expect(map.get("plumbing")).toEqual({ price: 350, etaMinutes: 45 });
    expect(map.get("electrical")).toEqual({ price: 200, etaMinutes: 15 });
    expect(map.get("hvac")).toBeUndefined();
  });
});

describe("pricingCoach", () => {
  const lost = (categoryName: string, price: number, winningPrice: number) => ({
    categoryName,
    price,
    status: "rejected",
    winningPrice,
  });

  it("averages how far lost offers sat above the winner, per trade", () => {
    const result = pricingCoach([
      lost("אינסטלציה", 360, 300),
      lost("אינסטלציה", 330, 300),
      lost("אינסטלציה", 300, 300),
    ]);
    expect(result).toEqual([
      { categoryName: "אינסטלציה", samples: 3, pctAboveWinner: 10 },
    ]);
  });

  it("says nothing about a trade with fewer than three lost offers", () => {
    expect(
      pricingCoach([lost("חשמל", 500, 250), lost("חשמל", 500, 250)]),
    ).toEqual([]);
  });

  it("ignores offers that were won, pending, or lost without a known winner", () => {
    expect(
      pricingCoach([
        {
          categoryName: "צבע",
          price: 900,
          status: "accepted",
          winningPrice: null,
        },
        {
          categoryName: "צבע",
          price: 900,
          status: "pending",
          winningPrice: null,
        },
        {
          categoryName: "צבע",
          price: 900,
          status: "rejected",
          winningPrice: null,
        },
      ]),
    ).toEqual([]);
  });
});

describe("recentNotes", () => {
  const offer = (note: string | null, createdAt: string) => ({
    note,
    createdAt,
  });

  it("returns the pro's own notes newest first, each once", () => {
    expect(
      recentNotes([
        offer("אחריות שנה", "2026-09-10T10:00:00Z"),
        offer("מביא חלקים", "2026-09-12T10:00:00Z"),
        offer("אחריות  שנה ", "2026-09-14T10:00:00Z"),
      ]),
    ).toEqual(["אחריות שנה", "מביא חלקים"]);
  });

  it("skips empty notes and stops at the limit", () => {
    const many = Array.from({ length: 8 }, (_, index) =>
      offer(`הערה ${index}`, `2026-09-0${index + 1}T10:00:00Z`),
    );
    expect(
      recentNotes([offer("   ", "2026-09-20T10:00:00Z"), ...many]),
    ).toEqual(["הערה 7", "הערה 6", "הערה 5", "הערה 4"]);
    expect(recentNotes([offer(null, "2026-09-20T10:00:00Z")])).toEqual([]);
  });
});
