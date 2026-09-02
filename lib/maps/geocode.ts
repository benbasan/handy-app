import { getServerMapsKey, mapsFallbackAllowed } from "./config";

/**
 * Turning an address into the point stored in `jobs.location`.
 *
 * Three sources, in descending order of trust:
 *
 *  1. Google's Geocoding API, called from the server with the server key.
 *  2. The coordinates the browser already resolved through Places
 *     Autocomplete, passed along with the form. Cheaper than geocoding the
 *     same string twice, and still validated here — see `coordinatesInIsrael`.
 *  3. The built-in city gazetteer, for a deployment with no Maps key at all.
 *     Approximate by construction, and the UI says so.
 *
 * Every result carries its `source`, so a screen can tell the customer that
 * their pin is a city centre rather than their door.
 *
 * No `server-only` marker, so the pure parts stay unit-testable. Nothing leaks
 * by importing this from the client either: the server key is read through a
 * non-`NEXT_PUBLIC_` variable, which Next never inlines into a browser bundle.
 */
export type GeocodeSource = "google" | "client" | "gazetteer" | "default";

export type GeocodeResult = {
  lat: number;
  lng: number;
  /** What Google called the place, when it had an opinion. */
  formattedAddress: string | null;
  source: GeocodeSource;
  /** True when the point is a city centre or the country default. */
  approximate: boolean;
};

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

/** Central Tel Aviv: the last-resort pin, and the map's initial viewport. */
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

/**
 * Enough of Israel's population centres to place a typed address in the right
 * city when there is no Maps key. Not a substitute for geocoding, and not
 * pretending to be one — a hit here is always flagged `approximate`.
 *
 * Ordered longest-name-first at match time so that "תל אביב יפו" does not lose
 * to a shorter substring, and "ראשון לציון" is not shadowed by "ציון".
 */
const CITY_GAZETTEER: ReadonlyArray<{
  names: readonly string[];
  lat: number;
  lng: number;
}> = [
  { names: ["תל אביב", "תל-אביב", "יפו"], lat: 32.0853, lng: 34.7818 },
  { names: ["ירושלים"], lat: 31.7683, lng: 35.2137 },
  { names: ["חיפה"], lat: 32.794, lng: 34.9896 },
  { names: ["ראשון לציון", "ראשל״צ", "ראשלצ"], lat: 31.9642, lng: 34.8044 },
  { names: ["פתח תקווה", "פתח תקוה"], lat: 32.0878, lng: 34.8878 },
  { names: ["אשדוד"], lat: 31.8014, lng: 34.6435 },
  { names: ["נתניה"], lat: 32.3215, lng: 34.8532 },
  { names: ["באר שבע"], lat: 31.2518, lng: 34.7913 },
  { names: ["בני ברק"], lat: 32.0807, lng: 34.8338 },
  { names: ["חולון"], lat: 32.0117, lng: 34.7725 },
  { names: ["רמת גן"], lat: 32.0684, lng: 34.8248 },
  { names: ["אשקלון"], lat: 31.6688, lng: 34.5743 },
  { names: ["רחובות"], lat: 31.8928, lng: 34.8113 },
  { names: ["בת ים"], lat: 32.0171, lng: 34.7457 },
  { names: ["הרצליה"], lat: 32.1624, lng: 34.8447 },
  { names: ["כפר סבא"], lat: 32.175, lng: 34.907 },
  { names: ["חדרה"], lat: 32.434, lng: 34.9196 },
  { names: ["מודיעין"], lat: 31.8928, lng: 35.0104 },
  { names: ["רעננה"], lat: 32.1848, lng: 34.8713 },
  { names: ["רמלה"], lat: 31.9288, lng: 34.8667 },
  { names: ["לוד"], lat: 31.9515, lng: 34.8953 },
  { names: ["נצרת"], lat: 32.7009, lng: 35.2035 },
  { names: ["עכו"], lat: 32.9281, lng: 35.0818 },
  { names: ["אילת"], lat: 29.5577, lng: 34.9482 },
  { names: ["טבריה"], lat: 32.7922, lng: 35.5312 },
  { names: ["גבעתיים"], lat: 32.0723, lng: 34.8107 },
  { names: ["קריית גת", "קרית גת"], lat: 31.61, lng: 34.7642 },
  { names: ["נהריה"], lat: 33.0085, lng: 35.0947 },
  { names: ["רהט"], lat: 31.3925, lng: 34.7542 },
  { names: ["ביתר עילית"], lat: 31.6994, lng: 35.1136 },
];

/**
 * Best-effort placement of a hand-typed address, with no network call.
 * Exported so it can be unit-tested directly — it is the path CI and any
 * key-less deployment actually take.
 */
export function geocodeFromGazetteer(address: string): GeocodeResult {
  const haystack = address.replace(/[־–—]/g, "-").trim();

  const matches = CITY_GAZETTEER.flatMap((city) =>
    city.names
      .filter((name) => haystack.includes(name))
      .map((name) => ({ city, name })),
  ).sort((a, b) => b.name.length - a.name.length);

  const best = matches[0];

  if (!best) {
    return {
      ...DEFAULT_CENTER,
      formattedAddress: null,
      source: "default",
      approximate: true,
    };
  }

  return {
    lat: best.city.lat,
    lng: best.city.lng,
    formattedAddress: null,
    source: "gazetteer",
    approximate: true,
  };
}

type GoogleGeocodeResponse = {
  status: string;
  results?: Array<{
    formatted_address?: string;
    geometry?: { location?: { lat?: number; lng?: number } };
  }>;
};

async function geocodeWithGoogle(
  address: string,
  key: string,
): Promise<GeocodeResult | null> {
  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("address", address);
  url.searchParams.set("key", key);
  // Bias and constrain to Israel, and ask for Hebrew back so the stored
  // formatted address matches the language of the rest of the record.
  url.searchParams.set("region", "il");
  url.searchParams.set("language", "he");
  url.searchParams.set("components", "country:IL");

  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) return null;

  const body = (await response.json()) as GoogleGeocodeResponse;
  const first = body.results?.[0];
  const lat = first?.geometry?.location?.lat;
  const lng = first?.geometry?.location?.lng;

  if (
    body.status !== "OK" ||
    typeof lat !== "number" ||
    typeof lng !== "number" ||
    !coordinatesInIsrael(lat, lng)
  ) {
    return null;
  }

  return {
    lat,
    lng,
    formattedAddress: first?.formatted_address ?? null,
    source: "google",
    approximate: false,
  };
}

export class MapsNotConfiguredError extends Error {
  constructor() {
    super(
      "Google Maps is not configured. Set GOOGLE_MAPS_SERVER_API_KEY (or NEXT_PUBLIC_GOOGLE_MAPS_API_KEY), or set ALLOW_NO_MAPS_KEY=1 to accept approximate, gazetteer-based coordinates.",
    );
    this.name = "MapsNotConfiguredError";
  }
}

/**
 * Resolve the point to store for a job.
 *
 * `clientPoint` is what Places Autocomplete produced in the browser, when it
 * was available. It is preferred over a second round trip, but only after it
 * has been checked against the country box — the browser is not trusted to
 * decide where a job is.
 */
export async function geocodeAddress(
  address: string,
  clientPoint?: { lat: number; lng: number } | null,
): Promise<GeocodeResult> {
  if (clientPoint && coordinatesInIsrael(clientPoint.lat, clientPoint.lng)) {
    return {
      lat: clientPoint.lat,
      lng: clientPoint.lng,
      formattedAddress: null,
      source: "client",
      approximate: false,
    };
  }

  const key = getServerMapsKey();

  if (key) {
    const resolved = await geocodeWithGoogle(address, key);
    if (resolved) return resolved;
  }

  if (!key && !mapsFallbackAllowed()) {
    throw new MapsNotConfiguredError();
  }

  return geocodeFromGazetteer(address);
}

/** EWKT for a PostGIS geography column. Longitude first — X before Y. */
export function toEwkt(lat: number, lng: number): string {
  return `SRID=4326;POINT(${lng} ${lat})`;
}
