import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  MAX_GALLERY_PHOTOS,
  profileStrength,
  publicProfileSchema,
  publicSlugSchema,
  RESERVED_SLUGS,
  reviewReplySchema,
} from "../publicProfile";

const PRO = "a0000000-0000-4000-8000-000000000003";

describe("publicSlugSchema", () => {
  it("accepts a normal vanity address", () => {
    expect(publicSlugSchema.parse("david-mizrahi")).toBe("david-mizrahi");
  });

  it("lowercases what the pro typed rather than refusing it", () => {
    expect(publicSlugSchema.parse("David-Mizrahi")).toBe("david-mizrahi");
  });

  it.each([
    "ab",
    "a".repeat(41),
    "-leading",
    "trailing-",
    "with space",
    "עברית",
    "a--b",
  ])("refuses %s", (value) => {
    expect(publicSlugSchema.safeParse(value).success).toBe(false);
  });

  it.each(RESERVED_SLUGS)("refuses the reserved word %s", (word) => {
    expect(publicSlugSchema.safeParse(word).success).toBe(false);
  });

  /**
   * The list exists twice on purpose — once here for the sentence under the
   * field, once as a check constraint so it holds through any client. This is
   * the test that keeps the two copies the same list.
   */
  it("matches the check constraint in the migration, word for word", () => {
    // Whichever migration *last* defines the constraint, not the one that
    // first did. Phase 8 created it; Phase 13 dropped and rebuilt it to
    // reserve `/pro/notifications`, and a test hard-coded to the older file
    // would have gone on passing against a list the database no longer used —
    // which is the precise failure this test exists to prevent.
    const migration = readdirSync("supabase/migrations")
      .filter((file) => file.endsWith(".sql"))
      .sort()
      .reverse()
      .find((file) =>
        readFileSync(`supabase/migrations/${file}`, "utf8").includes(
          "public_slug not in (",
        ),
      );

    expect(
      migration,
      "no migration defines the reserved-slug list",
    ).toBeDefined();

    const sql = readFileSync(`supabase/migrations/${migration}`, "utf8");
    const start = sql.indexOf("public_slug not in (");
    const block = sql.slice(start, sql.indexOf(")", sql.indexOf("(", start)));
    const inSql = [...block.matchAll(/'([a-z-]+)'/g)].map((match) => match[1]);

    expect(new Set(inSql)).toEqual(new Set(RESERVED_SLUGS));
  });
});

describe("publicProfileSchema", () => {
  const schema = publicProfileSchema(PRO);
  const valid = {
    publicSlug: "david-mizrahi",
    bio: "אינסטלטור מוסמך.",
    yearsExperience: "12",
    avatarPath: `${PRO}/avatar-1.jpg`,
    galleryPaths: [`${PRO}/work-1.jpg`],
  };

  it("accepts a profile whose files are the caller's own", () => {
    const parsed = schema.parse(valid);
    expect(parsed.yearsExperience).toBe(12);
    expect(parsed.galleryPaths).toHaveLength(1);
  });

  it("refuses a photo path belonging to another pro", () => {
    const result = schema.safeParse({
      ...valid,
      avatarPath: "a0000000-0000-4000-8000-000000000006/avatar-1.jpg",
    });
    expect(result.success).toBe(false);
  });

  it("refuses a gallery photo that escapes the caller's folder", () => {
    const result = schema.safeParse({
      ...valid,
      galleryPaths: [`${PRO}/../other/work.jpg`],
    });
    expect(result.success).toBe(false);
  });

  it("caps the gallery at the size the page can show", () => {
    const result = schema.safeParse({
      ...valid,
      galleryPaths: Array.from(
        { length: MAX_GALLERY_PHOTOS + 1 },
        (_, index) => `${PRO}/work-${index}.jpg`,
      ),
    });
    expect(result.success).toBe(false);
  });

  it("treats an empty bio as absent", () => {
    expect(schema.parse({ ...valid, bio: "" }).bio).toBeUndefined();
  });

  it("refuses a nonsense number of years", () => {
    expect(schema.safeParse({ ...valid, yearsExperience: "120" }).success).toBe(
      false,
    );
    expect(schema.safeParse({ ...valid, yearsExperience: "7.5" }).success).toBe(
      false,
    );
  });

  it("accepts a profile with no photos at all", () => {
    const parsed = schema.parse({
      publicSlug: "david-mizrahi",
      bio: "",
      yearsExperience: "",
      avatarPath: null,
      galleryPaths: [],
    });
    expect(parsed.avatarPath).toBeNull();
    expect(parsed.yearsExperience).toBeUndefined();
  });
});

describe("reviewReplySchema", () => {
  it("accepts a short answer", () => {
    expect(
      reviewReplySchema.parse({
        reviewId: "f0000000-0000-4000-8000-000000000001",
        reply: "תודה!",
      }).reply,
    ).toBe("תודה!");
  });

  it("refuses an empty one", () => {
    const result = reviewReplySchema.safeParse({
      reviewId: "f0000000-0000-4000-8000-000000000001",
      reply: "   ",
    });
    expect(result.success).toBe(false);
  });
});

describe("profileStrength", () => {
  const empty = {
    bio: null,
    avatarPath: null,
    galleryCount: 0,
    categoryCount: 0,
    yearsExperience: null,
    hasCustomSlug: false,
  };

  it("is zero for a profile nobody has filled in", () => {
    expect(profileStrength(empty).pct).toBe(0);
  });

  it("is a hundred once every item is done", () => {
    const full = profileStrength({
      bio: "א".repeat(40),
      avatarPath: "x/y.jpg",
      galleryCount: 2,
      categoryCount: 1,
      yearsExperience: 8,
      hasCustomSlug: true,
    });
    expect(full.pct).toBe(100);
    expect(full.items.every((item) => item.done)).toBe(true);
  });

  it("does not count a bio too short to tell a customer anything", () => {
    const short = profileStrength({ ...empty, bio: "אינסטלטור." });
    expect(
      short.items.find((item) => item.label === "תיאור מקצועי")?.done,
    ).toBe(false);
  });
});
