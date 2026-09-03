import { describe, expect, it } from "vitest";
import { haversineKm } from "@/lib/maps/geocode";
import {
  isLocationFresh,
  LOCATION_STALE_AFTER_MS,
  progressIndex,
  reportLocationSchema,
  sinceLabel,
} from "@/lib/validation/tracking";

/**
 * Live tracking's pure parts.
 *
 * The staleness rule is the one worth pinning down: a position nobody has
 * refreshed is a place somebody *was*, and the screen has to say so. Drawing
 * an hour-old pin as "מיקום חי" is a claim the customer has no way to check
 * from the screen, which is exactly the kind of claim this product exists to
 * not make.
 */

const AT = new Date("2026-09-05T10:00:00Z").getTime();

describe("reportLocationSchema", () => {
  const valid = {
    jobId: "d0000000-0000-4000-8000-000000000001",
    lat: 32.0853,
    lng: 34.7818,
    accuracyM: 20,
    etaMinutes: 12,
  };

  it("accepts a Tel Aviv reading off a phone", () => {
    expect(reportLocationSchema.safeParse(valid).success).toBe(true);
  });

  it("refuses a coordinate outside the service area", () => {
    // London. The database re-checks the same box, because a coordinate is an
    // input like any other and this one comes from a sensor.
    expect(
      reportLocationSchema.safeParse({ ...valid, lat: 51.5, lng: -0.12 })
        .success,
    ).toBe(false);
  });

  it("refuses swapped latitude and longitude", () => {
    // 34.78 is a valid latitude number but not one in Israel, which is what
    // catches the classic lat/lng transposition.
    expect(
      reportLocationSchema.safeParse({ ...valid, lat: 34.7818, lng: 32.0853 })
        .success,
    ).toBe(false);
  });

  it("treats accuracy and ETA as optional — a device may not know either", () => {
    const parsed = reportLocationSchema.safeParse({
      jobId: valid.jobId,
      lat: valid.lat,
      lng: valid.lng,
    });
    expect(parsed.success).toBe(true);
  });

  it("refuses a negative ETA", () => {
    expect(
      reportLocationSchema.safeParse({ ...valid, etaMinutes: -5 }).success,
    ).toBe(false);
  });
});

describe("isLocationFresh", () => {
  it("calls a reading from ten seconds ago live", () => {
    expect(isLocationFresh(new Date(AT - 10_000).toISOString(), AT)).toBe(true);
  });

  it("stops calling it live once it is past the staleness window", () => {
    expect(
      isLocationFresh(
        new Date(AT - LOCATION_STALE_AFTER_MS - 1).toISOString(),
        AT,
      ),
    ).toBe(false);
  });
});

describe("sinceLabel", () => {
  it("counts seconds while they still mean something", () => {
    expect(sinceLabel(new Date(AT - 40_000).toISOString(), AT)).toBe(
      "לפני 40 שניות",
    );
  });

  it("uses Hebrew's singular for one minute", () => {
    expect(sinceLabel(new Date(AT - 60_000).toISOString(), AT)).toBe(
      "לפני דקה",
    );
  });

  it("rolls up to hours", () => {
    expect(sinceLabel(new Date(AT - 2 * 3600_000).toISOString(), AT)).toBe(
      "לפני 2 שעות",
    );
  });

  it("never reports a future timestamp as negative", () => {
    expect(sinceLabel(new Date(AT + 5000).toISOString(), AT)).toBe(
      "לפני 0 שניות",
    );
  });
});

describe("progressIndex", () => {
  it("maps the three drawn steps in order", () => {
    expect(progressIndex("assigned")).toBe(0);
    expect(progressIndex("in_progress")).toBe(1);
    expect(progressIndex("completed")).toBe(2);
  });

  it("falls back to the first step for a status the bar does not draw", () => {
    expect(progressIndex("bidding")).toBe(0);
  });
});

describe("haversineKm", () => {
  it("measures a short city hop", () => {
    // Dizengoff 100 to a point a couple of streets away — a few hundred
    // metres on the ground, which is the scale this number is read at.
    const km = haversineKm(
      { lat: 32.0809, lng: 34.7806 },
      { lat: 32.079, lng: 34.783 },
    );
    expect(km).toBeGreaterThan(0.1);
    expect(km).toBeLessThan(0.5);
  });

  it("is zero for the same point", () => {
    const point = { lat: 32.0853, lng: 34.7818 };
    expect(haversineKm(point, point)).toBe(0);
  });

  it("gets Tel Aviv to Eilat roughly right", () => {
    const km = haversineKm(
      { lat: 32.0853, lng: 34.7818 },
      { lat: 29.5577, lng: 34.9482 },
    );
    expect(km).toBeGreaterThan(270);
    expect(km).toBeLessThan(300);
  });
});
