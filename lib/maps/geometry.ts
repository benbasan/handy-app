/**
 * Points, boxes and distances. No configuration, no data, no network — which
 * is what lets both the gazetteer and the geocoder sit on top of it without
 * importing each other.
 */

/**
 * A generous box around Israel. Its job is to reject nonsense — a swapped
 * lat/lng pair, a zero-zero default, an address that geocoded to another
 * country — not to draw a border.
 */
export const ISRAEL_BOUNDS = {
  minLat: 29.3,
  maxLat: 33.4,
  minLng: 34.2,
  maxLng: 35.95,
} as const;

/**
 * Central Tel Aviv. The initial viewport of a map that has nothing to show yet
 * — and deliberately NOT a fallback for an address that could not be placed:
 * see lib/maps/geocode.ts, where refusing beats guessing.
 */
export const DEFAULT_CENTER = { lat: 32.0853, lng: 34.7818 } as const;

export function coordinatesInIsrael(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= ISRAEL_BOUNDS.minLat &&
    lat <= ISRAEL_BOUNDS.maxLat &&
    lng >= ISRAEL_BOUNDS.minLng &&
    lng <= ISRAEL_BOUNDS.maxLng
  );
}

/** EWKT for a PostGIS geography column. Longitude first — X before Y. */
export function toEwkt(lat: number, lng: number): string {
  return `SRID=4326;POINT(${lng} ${lat})`;
}

/**
 * Straight-line distance in kilometres.
 *
 * Used by the tracking screens to say how far the pro still is. Deliberately
 * not a Distance Matrix call: this number is rendered beside a live pin that
 * moves every fifteen seconds, and a billed round trip per ping to turn "1.2
 * km away" into "4 minutes by road" is not a trade worth making. The pro's own
 * ETA, which they report from their device, is the number that carries that
 * meaning.
 */
export function haversineKm(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
): number {
  const EARTH_RADIUS_KM = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const dLat = toRad(to.lat - from.lat);
  const dLng = toRad(to.lng - from.lng);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(from.lat)) *
      Math.cos(toRad(to.lat)) *
      Math.sin(dLng / 2) ** 2;

  return EARTH_RADIUS_KM * 2 * Math.asin(Math.sqrt(a));
}
