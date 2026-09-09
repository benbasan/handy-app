import { describe, expect, it } from "vitest";
import {
  addressToStore,
  geocodeAddress,
  geocodeFromGazetteer,
  type GeocodeResult,
} from "../geocode";

/**
 * The gazetteer path is not an edge case: with no Maps key it is what CI, a
 * fresh clone and every deployment of this product actually run.
 */
describe("geocodeFromGazetteer", () => {
  it("places a Tel Aviv address in Tel Aviv", () => {
    const result = geocodeFromGazetteer("רחוב דיזנגוף 100, תל אביב");
    expect(result?.source).toBe("gazetteer");
    expect(result?.approximate).toBe(true);
    expect(result?.locality).toBe("תל אביב-יפו");
    expect(result?.lat).toBeCloseTo(32.08, 2);
    expect(result?.lng).toBeCloseTo(34.78, 2);
  });

  it("refuses an address that names no locality, rather than guessing", () => {
    // This is the change Phase 11 made. It used to answer with the middle of
    // Tel Aviv and a `source` nobody read, so a call in an unrecognised town
    // was broadcast to the wrong pros with nothing on screen to say so.
    expect(geocodeFromGazetteer("רחוב כלשהו 3")).toBeNull();
  });
});

describe("geocodeAddress", () => {
  it("uses the device's point when it is plausible", async () => {
    const result = await geocodeAddress("רחוב כלשהו 3, חיפה", {
      lat: 32.794,
      lng: 34.9896,
    });
    expect(result?.source).toBe("client");
    expect(result?.approximate).toBe(false);
  });

  it("ignores a device point outside Israel and reads the text instead", async () => {
    const result = await geocodeAddress("רחוב הרצל 1, חיפה", {
      lat: 48.8566,
      lng: 2.3522,
    });
    expect(result?.source).toBe("gazetteer");
    expect(result?.locality).toBe("חיפה");
  });
});

describe("addressToStore", () => {
  const gazetteerHit = (locality: string): GeocodeResult => ({
    lat: 32.32,
    lng: 34.85,
    formattedAddress: null,
    locality,
    source: "gazetteer",
    approximate: true,
  });

  it("appends the town when the address does not end with it", () => {
    // job_city() reads the last comma-separated part, so without this the
    // admin console would file this job under "דירה 4".
    expect(addressToStore("הרצל 12, דירה 4", gazetteerHit("נתניה"))).toBe(
      "הרצל 12, דירה 4, נתניה",
    );
  });

  it("leaves an address that already ends with its town alone", () => {
    expect(addressToStore("הרצל 12, נתניה", gazetteerHit("נתניה"))).toBe(
      "הרצל 12, נתניה",
    );
  });

  it("appends the canonical name, not the spelling that was typed", () => {
    expect(addressToStore("הרצל 12, קרית גת", gazetteerHit("קריית גת"))).toBe(
      "הרצל 12, קרית גת",
    );
  });

  it("keeps Google's own formatted address untouched", () => {
    expect(
      addressToStore("הרצל 12", {
        lat: 32.32,
        lng: 34.85,
        formattedAddress: "הרצל 12, נתניה, ישראל",
        locality: null,
        source: "google",
        approximate: false,
      }),
    ).toBe("הרצל 12, נתניה, ישראל");
  });

  it("leaves a device-resolved address alone — there is no town to add", () => {
    expect(
      addressToStore("הרצל 12, נתניה", {
        lat: 32.32,
        lng: 34.85,
        formattedAddress: null,
        locality: null,
        source: "client",
        approximate: false,
      }),
    ).toBe("הרצל 12, נתניה");
  });
});
