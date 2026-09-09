import { getServerMapsKey, mapsFallbackAllowed } from "./config";
import { matchLocality } from "./gazetteer";
import { coordinatesInIsrael } from "./geometry";

/**
 * Turning an address into the point stored in `jobs.location`.
 *
 * Three sources, in descending order of trust:
 *
 *  1. The coordinates the device already resolved — a GPS fix, a saved address,
 *     or Places Autocomplete when a Maps key exists. Exact, and cheaper than
 *     geocoding a string that describes a place somebody is standing in. Still
 *     validated here — see `coordinatesInIsrael`: the browser is not trusted to
 *     decide where a job is, only to suggest it.
 *  2. Google's Geocoding API, called from the server with the server key.
 *  3. The built-in gazetteer in ./gazetteer.ts, which is what runs in every
 *     deployment of this product today, because there is no Maps key by choice
 *     (CLAUDE.md §2). Locality-level by construction, and flagged `approximate`.
 *
 * Every result carries its `source`, so a screen can tell the customer that
 * their pin is a town centre rather than their door.
 *
 * WHAT THIS NO LONGER DOES. An address naming no locality anybody recognises
 * used to come back as the middle of Tel Aviv. Nothing said so, the job was
 * broadcast to the wrong pros, and the customer's only clue was that nobody
 * bid. `null` is the answer now, and the caller asks the customer for a city.
 *
 * No `server-only` marker, so the pure parts stay unit-testable. Nothing leaks
 * by importing this from the client either: the server key is read through a
 * non-`NEXT_PUBLIC_` variable, which Next never inlines into a browser bundle.
 */
export type GeocodeSource = "google" | "client" | "gazetteer";

export type GeocodeResult = {
  lat: number;
  lng: number;
  /** What Google called the place, when it had an opinion. */
  formattedAddress: string | null;
  /** The town the gazetteer recognised, when that is how the point was found. */
  locality: string | null;
  source: GeocodeSource;
  /** True when the point is a town centre rather than the address itself. */
  approximate: boolean;
};

/**
 * Best-effort placement of a hand-typed address, with no network call.
 * Exported so it can be unit-tested directly — it is the path CI and every
 * key-less deployment actually take.
 */
export function geocodeFromGazetteer(address: string): GeocodeResult | null {
  const locality = matchLocality(address);
  if (!locality) return null;

  return {
    lat: locality.lat,
    lng: locality.lng,
    formattedAddress: null,
    locality: locality.name,
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
    locality: null,
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
 * Resolve the point to store for a job, or `null` when the address names no
 * place this product can find.
 *
 * `clientPoint` is what the device produced — a GPS fix, a saved address, or
 * Places Autocomplete. It is preferred over a round trip, but only after it has
 * been checked against the country box.
 *
 * Throws `MapsNotConfiguredError` when there is no key AND running without one
 * has not been asked for by name. That is an operations failure, not a bad
 * address, and the two must not reach the customer as the same sentence.
 */
export async function geocodeAddress(
  address: string,
  clientPoint?: { lat: number; lng: number } | null,
): Promise<GeocodeResult | null> {
  if (clientPoint && coordinatesInIsrael(clientPoint.lat, clientPoint.lng)) {
    return {
      lat: clientPoint.lat,
      lng: clientPoint.lng,
      formattedAddress: null,
      locality: null,
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

/**
 * The string to write to `address_text`.
 *
 * A customer types "הרצל 12, דירה 4" and means Netanya; `job_city()` in the
 * database reads the last comma-separated part and would file that job under
 * "דירה 4". So when the gazetteer found a town the address does not end with,
 * the town is appended — the admin console then groups by a real place, and the
 * point that was stored and the city that is displayed come from one decision
 * instead of two.
 *
 * Google's own `formatted_address` is left exactly as it came: it already ends
 * with the locality, in Hebrew, and second-guessing it would be inventing.
 */
export function addressToStore(typed: string, point: GeocodeResult): string {
  if (point.formattedAddress) return point.formattedAddress;
  if (!point.locality) return typed;

  const parts = typed.split(",");
  const lastPart = parts[parts.length - 1] ?? "";
  if (matchLocality(lastPart)?.name === point.locality) return typed;

  return `${typed.trim().replace(/,+$/, "")}, ${point.locality}`;
}
