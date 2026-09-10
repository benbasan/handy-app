import { describe, expect, it } from "vitest";
import { isSingleDirection, toVisualOrder } from "../bidi";
import { ogCopyValues } from "../copy";

/**
 * The card that made this necessary rendered "בעל מקצוע אמין ליד הבית, היום"
 * as its own reverse, and looked entirely plausible until somebody who reads
 * Hebrew looked at it. Satori draws glyphs in code-point order and implements
 * no part of the Unicode Bidirectional Algorithm.
 *
 * The last group is the one that matters. The first two prove the function;
 * the third proves nobody has written a card line it cannot handle.
 */
describe("isSingleDirection", () => {
  it("accepts Hebrew with the punctuation Hebrew actually uses", () => {
    for (const text of [
      "בעל מקצוע אמין ליד הבית, היום",
      "פרסום קריאה — חינם",
      "שינוי מחיר בשטח מחייב תמונה ואישור שלכם.",
      "אינסטלטור בתל אביב — מחירים, זמינות ודירוגים",
      'גרשיים "כאלה" וגרש כזה׳',
    ]) {
      expect(isSingleDirection(text), text).toBe(true);
    }
  });

  it("refuses anything carrying a run that must keep Latin order", () => {
    for (const text of [
      "דמי קבלת עבודה 35 ₪", // a digit run
      "בעל מקצוע ליד הבית — Handy", // a Latin run
      "H", // Latin alone
      "2026", // digits alone
    ]) {
      expect(isSingleDirection(text), text).toBe(false);
    }
  });
});

describe("toVisualOrder", () => {
  it("reverses a single-direction line, which is the UBA's own answer for one", () => {
    expect(toVisualOrder("שלום עולם")).toBe("םלוע םולש");
  });

  it("keeps the comma between the words it separates", () => {
    // Read the result left to right and the first four glyphs are הבית
    // reversed, then the comma, then היום — which is what a Hebrew reader
    // sees, right to left, as "הבית, היום".
    expect(toVisualOrder("הבית, היום")).toBe("םויה ,תיבה");
  });

  it("is its own inverse, so nothing is lost in the round trip", () => {
    const line = "שינוי מחיר בשטח מחייב תמונה ואישור שלכם";
    expect(toVisualOrder(toVisualOrder(line))).toBe(line);
  });

  it("leaves a string it cannot handle exactly as it was", () => {
    // Returned untouched rather than thrown: an OG card is decoration on a
    // page that still has to render. The audit below is the real gate.
    const mixed = "דמי קבלת עבודה 35 ₪";
    expect(toVisualOrder(mixed)).toBe(mixed);
  });

  it("reverses by code point, not by UTF-16 unit", () => {
    // A surrogate pair torn in half is two replacement characters, and the
    // failure would only ever show up in a rendered image.
    expect(toVisualOrder("א😀ב")).toBe("ב😀א");
  });
});

describe("every line an OG card draws is one direction", () => {
  it("has no card copy that would need real bidi", () => {
    const unsafe = ogCopyValues().filter((line) => !isSingleDirection(line));

    expect(
      unsafe,
      `\n  These would render backwards in the card, silently:${unsafe
        .map((line) => `\n    ${line}`)
        .join("")}\n  Give the digit or Latin run its own element.\n`,
    ).toEqual([]);
  });
});
