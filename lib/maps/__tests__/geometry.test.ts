import { describe, expect, it } from "vitest";
import { coordinatesInIsrael, toEwkt } from "../geometry";

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

describe("toEwkt", () => {
  it("writes longitude before latitude", () => {
    expect(toEwkt(32.08, 34.78)).toBe("SRID=4326;POINT(34.78 32.08)");
  });
});
