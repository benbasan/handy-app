import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { INTENT_SLUGS, intentWords, matchCategoryIntent } from "../intent";

describe("matchCategoryIntent", () => {
  it.each([
    ["המזגן לא מקרר", "hvac"],
    ["נזילה מתחת לכיור במטבח", "plumbing"],
    ["יש סתימה באסלה", "plumbing"],
    ["השקע בסלון עשה קצר", "electrical"],
    ["ננעלתי מחוץ לבית", "locksmith"],
    ["צריך לצבוע שני חדרים", "painting"],
    ["להרכיב ארון מאיקאה", "furniture-assembly"],
    ["רטיבות ועובש בתקרה", "waterproofing"],
    ["דשא שצריך גיזום", "gardening"],
    ["ניקיון אחרי שיפוץ", "cleaning"],
    ["הציר של המגירה נשבר", "carpentry"],
  ])("reads %s as %s", (text, slug) => {
    expect(matchCategoryIntent(text)).toBe(slug);
  });

  it("peels the one-letter words Hebrew attaches to the next", () => {
    expect(matchCategoryIntent("והמזגן")).toBe("hvac");
    expect(matchCategoryIntent("מהברז")).toBe("plumbing");
  });

  it("matches whole words, never part of one", () => {
    // ברזל is iron, not a tap.
    expect(matchCategoryIntent("ברזל")).toBeNull();
    // צבעוני is colourful, not paint.
    expect(matchCategoryIntent("וילון צבעוני")).toBeNull();
  });

  it("does not peel a prefix off a word too short to have one", () => {
    // "בג" would become "ג", which is not a word anywhere in the list.
    expect(matchCategoryIntent("בג")).toBeNull();
  });

  it("returns null for a tie rather than guessing", () => {
    expect(matchCategoryIntent("ניקוי מזגן")).toBeNull();
  });

  it("lets the stronger trade win when a sentence names two unevenly", () => {
    expect(matchCategoryIntent("נזילה מהברז ליד השקע, והכיור סתום")).toBe(
      "plumbing",
    );
  });

  it("returns null when nothing in the sentence is a trade", () => {
    expect(matchCategoryIntent("משהו לא עובד בבית")).toBeNull();
    expect(matchCategoryIntent("")).toBeNull();
  });

  it("ignores niqqud and Latin case", () => {
    expect(matchCategoryIntent("מַזְגָּן")).toBe("hvac");
    expect(matchCategoryIntent("IKEA")).toBe("furniture-assembly");
  });
});

describe("intentWords", () => {
  it("splits on anything that is not a letter", () => {
    expect(intentWords("ברז, דולף!! 3 פעמים")).toEqual([
      "ברז",
      "דולף",
      "פעמים",
    ]);
  });
});

describe("the keyword list", () => {
  it("names exactly the categories the seed creates", () => {
    const seed = readFileSync(
      join(process.cwd(), "supabase", "seed.sql"),
      "utf8",
    );
    const block = seed
      .split("insert into public.categories")[1]!
      .split(";")[0]!;
    const seeded = [...block.matchAll(/'([a-z-]+)'\)/g)].map((m) => m[1]);
    expect([...INTENT_SLUGS].sort()).toEqual([...seeded].sort());
  });
});
