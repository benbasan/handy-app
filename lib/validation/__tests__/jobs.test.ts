import { describe, expect, it } from "vitest";
import { createJobSchema, jobReference } from "../jobs";

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
