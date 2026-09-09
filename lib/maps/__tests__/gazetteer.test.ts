import { describe, expect, it } from "vitest";
import {
  LOCALITY_NAMES,
  matchLocality,
  nearestLocality,
  normalizeAddress,
} from "../gazetteer";
import { LOCALITIES } from "../localities.data";

/** The whole point of the matcher: a name, or an honest null. */
const cityOf = (address: string) => matchLocality(address)?.name ?? null;

describe("normalizeAddress", () => {
  it("drops a street prefix, a house number and a flat", () => {
    expect(normalizeAddress("רחוב הרצל 12, דירה 4, קומה 2, נס ציונה")).toEqual([
      "הרצל",
      "נס",
      "ציונה",
    ]);
  });

  it("keeps a street prefix that is the whole part, because it is a town", () => {
    // "שדרות" opens a street in one position and IS the city in the other.
    expect(normalizeAddress("שדרות רוטשילד 10")).toEqual(["רוטשילד"]);
    expect(normalizeAddress("הרצל 5, שדרות")).toEqual(["הרצל", "שדרות"]);
  });

  it("folds gershayim, maqaf and niqqud away", () => {
    expect(normalizeAddress("ת״א")).toEqual(["תא"]);
    expect(normalizeAddress("מודיעין־מכבים־רעות")).toEqual([
      "מודיעין",
      "מכבים",
      "רעות",
    ]);
    expect(normalizeAddress("תֵּל־אָבִיב")).toEqual(["תל", "אביב"]);
  });
});

describe("matchLocality", () => {
  it("reads the city out of an ordinary address", () => {
    expect(cityOf("רחוב דיזנגוף 100, תל אביב")).toBe("תל אביב-יפו");
    expect(cityOf("הרצל 5, ראשון לציון")).toBe("ראשון לציון");
  });

  it("finds the city with no comma to help it", () => {
    expect(cityOf("דיזנגוף 100 תל אביב")).toBe("תל אביב-יפו");
  });

  it("prefers the last part, which is where the city is and what job_city() reads", () => {
    // "הרצליה" is a street name in plenty of towns. The part after the last
    // comma decides, exactly as split_part(address_text, ',', -1) does in SQL.
    expect(cityOf("הרצליה 4, חיפה")).toBe("חיפה");
  });

  it("accepts the spellings people actually write", () => {
    expect(cityOf("הרצל 5, קרית גת")).toBe("קריית גת");
    expect(cityOf("הרצל 5, קריית גת")).toBe("קריית גת");
    expect(cityOf("הרצל 5, פתח תקוה")).toBe("פתח תקווה");
    expect(cityOf("הרצל 5, פתח תקווה")).toBe("פתח תקווה");
  });

  it("accepts an attached preposition", () => {
    expect(cityOf("דירה אצל דוד, בתל אביב")).toBe("תל אביב-יפו");
    expect(cityOf("מתקנים בראשון לציון")).toBe("ראשון לציון");
  });

  it("does not let the preposition pass eat a town that starts with one", () => {
    // Strip the ב from "בת ים" and you get "ת ים", which is nothing — but the
    // direct pass has to win first, or "בני ברק" becomes "ני ברק".
    expect(cityOf("רוטשילד 3, בת ים")).toBe("בת ים");
    expect(cityOf("רבי עקיבא 1, בני ברק")).toBe("בני ברק");
    expect(cityOf("הרצל 2, לוד")).toBe("לוד");
  });

  it("tells apart the towns that share a first word", () => {
    expect(cityOf("ביאליק 3, רמת גן")).toBe("רמת גן");
    expect(cityOf("ביאליק 3, רמת השרון")).toBe("רמת השרון");
    expect(cityOf("ביאליק 3, רמת ישי")).toBe("רמת ישי");
    expect(cityOf("ביאליק 3, בת חפר")).toBe("בת חפר");
    expect(cityOf("ביאליק 3, אור יהודה")).toBe("אור יהודה");
    expect(cityOf("ביאליק 3, אור עקיבא")).toBe("אור עקיבא");
  });

  it("matches an abbreviation only where it was punctuated as one", () => {
    // "פ״ת" is a town. Bare "פת" is a Hebrew word, and a word must not quietly
    // become a city sixty kilometres from where the customer is standing.
    expect(cityOf("הרצל 5, פ״ת")).toBe("פתח תקווה");
    expect(cityOf("ת״א")).toBe("תל אביב-יפו");
    expect(cityOf("מאפיית פת חמה 3")).toBeNull();
  });

  it("does not match a name buried inside a longer word", () => {
    // The gazetteer this replaced asked `address.includes(name)`, which is true
    // of "יפו" inside "יפואית" and of "לוד" inside "גלעדי".
    expect(cityOf("רחוב יפואית 3")).toBeNull();
    expect(cityOf("רחוב גלעדי 7")).toBeNull();
  });

  it("returns null rather than a guess when no locality is named", () => {
    expect(matchLocality("רחוב כלשהו 3")).toBeNull();
    expect(matchLocality("")).toBeNull();
    expect(matchLocality("   ")).toBeNull();
  });

  it("resolves a hyphenated town by either half", () => {
    expect(cityOf("הרצל 1, פרדס חנה")).toBe("פרדס חנה-כרכור");
    expect(cityOf("הרצל 1, כרכור")).toBe("פרדס חנה-כרכור");
    expect(cityOf("הרצל 1, מודיעין")).toBe("מודיעין־מכבים־רעות");
  });
});

describe("nearestLocality", () => {
  it("names the town a point is in", () => {
    expect(nearestLocality(32.794, 34.9896)?.name).toBe("חיפה");
    expect(nearestLocality(31.2518, 34.7913)?.name).toBe("באר שבע");
  });
});

describe("the generated data", () => {
  it("stores every form already folded — no niqqud, gershayim or maqaf", () => {
    // The generator folds; the matcher folds; this is the seam between them,
    // and a form that survives folding differently is a row that can never
    // match anything.
    for (const locality of LOCALITIES) {
      for (const form of [...locality.aliases, ...locality.abbreviations]) {
        expect(form).toBe(form.normalize("NFC"));
        expect(form).not.toMatch(/[֑-ׇ"'`׳״\u2010-\u2015-]/);
        expect(normalizeAddress(form).length).toBeGreaterThan(0);
      }
    }
  });

  it("holds every locality in the country box, with a real population", () => {
    for (const locality of LOCALITIES) {
      expect(locality.lat).toBeGreaterThan(29.3);
      expect(locality.lat).toBeLessThan(33.4);
      expect(locality.lng).toBeGreaterThan(34.2);
      expect(locality.lng).toBeLessThan(35.95);
      expect(locality.population).toBeGreaterThanOrEqual(2000);
    }
  });

  it("names no locality twice", () => {
    expect(new Set(LOCALITY_NAMES).size).toBe(LOCALITY_NAMES.length);
  });
});
