import { describe, expect, it } from "vitest";
import {
  createJobSchema,
  jobReference,
  nextSearchRadius,
  SEARCH_RADIUS_LADDER,
  SEARCH_RADIUS_OPTIONS,
} from "../jobs";

const USER = "a0000000-0000-4000-8000-000000000001";
const OTHER = "a0000000-0000-4000-8000-000000000002";
const GROUP = "11111111-2222-4333-8444-555555555555";

const valid = {
  categoryId: "c0000000-0000-4000-8000-000000000001",
  description: "נזילה מתחת לכיור במטבח, המים מצטברים על הרצפה",
  preferredTime: "today",
  addressText: "רחוב דיזנגוף 100, תל אביב",
  searchRadiusKm: "5",
  photoPaths: [],
};

describe("createJobSchema", () => {
  it("accepts a complete posting", () => {
    const result = createJobSchema(USER).safeParse(valid);
    expect(result.success).toBe(true);
    expect(result.data?.searchRadiusKm).toBe(5);
  });

  it("rejects a description too short to bid on", () => {
    const result = createJobSchema(USER).safeParse({
      ...valid,
      description: "מקולקל",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a radius that is not one of the offered options", () => {
    const result = createJobSchema(USER).safeParse({
      ...valid,
      searchRadiusKm: "500",
    });
    expect(result.success).toBe(false);
  });

  it("accepts a media path inside the poster's own folder", () => {
    const result = createJobSchema(USER).safeParse({
      ...valid,
      photoPaths: [`${USER}/${GROUP}/photo-1.jpg`],
    });
    expect(result.success).toBe(true);
  });

  // The storage policy blocks the upload itself; this is the second lock, on
  // the job row that would point at the file.
  it("rejects a media path in somebody else's folder", () => {
    const result = createJobSchema(USER).safeParse({
      ...valid,
      photoPaths: [`${OTHER}/${GROUP}/photo-1.jpg`],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a media path that tries to climb out of its folder", () => {
    const result = createJobSchema(USER).safeParse({
      ...valid,
      photoPaths: [`${USER}/${GROUP}/../../${OTHER}/x.jpg`],
    });
    expect(result.success).toBe(false);
  });

  it("drops coordinates that fall outside Israel", () => {
    const result = createJobSchema(USER).safeParse({
      ...valid,
      lat: "48.8566",
      lng: "2.3522",
    });
    expect(result.success).toBe(false);
  });
});

describe("jobReference", () => {
  it("derives the H-##### code the design shows on every job card", () => {
    expect(jobReference("d0000000-0000-4000-8000-000000000001")).toBe(
      "H-00001",
    );
  });
});

/**
 * The ladder is what a customer climbs when the offers screen has just told
 * them nobody covers their address. The form only ever offers its first three
 * rungs; the wider ones are for a call that has already been posted and got
 * nothing, which is the one case where distance beats silence.
 */
describe("nextSearchRadius", () => {
  it("steps up one rung from every radius the form can produce", () => {
    for (const option of SEARCH_RADIUS_OPTIONS) {
      const next = nextSearchRadius(option);
      expect(next).not.toBeNull();
      expect(next!).toBeGreaterThan(option);
    }
  });

  it("is strictly increasing and ends", () => {
    let current: number | null = SEARCH_RADIUS_LADDER[0];
    const seen: number[] = [];

    while (current !== null) {
      seen.push(current);
      const next: number | null = nextSearchRadius(current);
      if (next !== null) expect(next).toBeGreaterThan(current);
      current = next;
    }

    expect(seen).toEqual([...SEARCH_RADIUS_LADDER]);
  });

  it("has no rung the jobs check constraint would refuse", () => {
    for (const option of SEARCH_RADIUS_LADDER) {
      expect(option).toBeGreaterThanOrEqual(1);
      expect(option).toBeLessThanOrEqual(50);
    }
  });

  it("returns null at the top rather than looping", () => {
    const top = SEARCH_RADIUS_LADDER[SEARCH_RADIUS_LADDER.length - 1]!;
    expect(nextSearchRadius(top)).toBeNull();
    expect(nextSearchRadius(top + 100)).toBeNull();
  });

  it("starts a job posted below the ladder at its first rung", () => {
    // The check constraint allows 1, which no screen offers. A value off the
    // ladder must still climb rather than stall.
    expect(nextSearchRadius(1)).toBe(SEARCH_RADIUS_LADDER[0]);
  });
});
