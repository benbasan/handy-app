import { describe, expect, it } from "vitest";
import {
  DEFAULT_CENTER,
  coordinatesInIsrael,
  geocodeAddress,
  geocodeFromGazetteer,
  toEwkt,
} from "../geocode";

/**
 * The gazetteer path is not an edge case: with no Maps key it is what CI, a
 * fresh clone and any not-yet-provisioned deploy actually run.
 */
describe("geocodeFromGazetteer", () => {
  it("places a Tel Aviv address in Tel Aviv", () => {
    const result = geocodeFromGazetteer("רחוב דיזנגוף 100, תל אביב");
    expect(result.source).toBe("gazetteer");
    expect(result.approximate).toBe(true);
    expect(result.lat).toBeCloseTo(32.0853, 3);
    expect(result.lng).toBeCloseTo(34.7818, 3);
  });

  it("prefers the longest matching city name", () => {
    // "ראשון לציון" contains no shorter entry, but the sort is what stops a
    // future two-word city from losing to a one-word substring of itself.
    const result = geocodeFromGazetteer("הרצל 5, ראשון לציון");
    expect(result.lat).toBeCloseTo(31.9642, 3);
  });

  it("falls back to the country default when no city is recognised", () => {
    const result = geocodeFromGazetteer("רחוב כלשהו 3");
    expect(result.source).toBe("default");
    expect(result).toMatchObject(DEFAULT_CENTER);
  });
});

describe("coordinatesInIsrael", () => {
  it("accepts a point inside the country", () => {
    expect(coordinatesInIsrael(32.0853, 34.7818)).toBe(true);
  });

  it("rejects a swapped lat/lng pair", () => {
    expect(coordinatesInIsrael(34.7818, 32.0853)).toBe(false);
  });

  it("rejects null island and non-numbers", () => {
    expect(coordinatesInIsrael(0, 0)).toBe(false);
    expect(coordinatesInIsrael(Number.NaN, 34.8)).toBe(false);
  });
});

describe("geocodeAddress", () => {
  it("uses the browser's point when it is plausible", async () => {
    const result = await geocodeAddress("רחוב כלשהו 3, חיפה", {
      lat: 32.794,
      lng: 34.9896,
    });
    expect(result.source).toBe("client");
    expect(result.approximate).toBe(false);
  });

  it("ignores a browser point outside Israel and geocodes the text", async () => {
    const result = await geocodeAddress("רחוב הרצל 1, חיפה", {
      lat: 48.8566,
      lng: 2.3522,
    });
    expect(result.source).toBe("gazetteer");
    expect(result.lat).toBeCloseTo(32.794, 2);
  });
});

describe("toEwkt", () => {
  it("writes longitude before latitude", () => {
    expect(toEwkt(32.08, 34.78)).toBe("SRID=4326;POINT(34.78 32.08)");
  });
});
