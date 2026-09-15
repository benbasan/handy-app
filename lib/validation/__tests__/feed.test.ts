import { describe, expect, it } from "vitest";
import { arrangeFeed, isFeedSort, lastOfferByTrade } from "../feed";

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
