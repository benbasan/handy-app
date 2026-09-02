/**
 * Google Maps Platform configuration.
 *
 * Two keys, deliberately:
 *
 *  * `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` ships to the browser and is what Places
 *    Autocomplete and the Maps JS API use. It is restricted by HTTP referrer
 *    in the Google Cloud Console, which is exactly why it is useless from a
 *    server.
 *  * `GOOGLE_MAPS_SERVER_API_KEY` never leaves the server and is restricted by
 *    IP instead. Geocoding runs there, because the coordinates written to
 *    `jobs.location` must not be dictated by the browser alone.
 *
 * With no key at all, the product still has to work: the address is typed by
 * hand and geocoded against the built-in gazetteer in ./geocode.ts. That
 * degraded mode is opt-in through `ALLOW_NO_MAPS_KEY`, so a production deploy
 * that simply forgot the key fails loudly instead of quietly saving every job
 * to the middle of Tel Aviv.
 */
export function getBrowserMapsKey(): string | null {
  return process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || null;
}

export function getServerMapsKey(): string | null {
  return (
    process.env.GOOGLE_MAPS_SERVER_API_KEY ||
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ||
    null
  );
}

/** Is running without a Maps key an accepted state, or a misconfiguration? */
export function mapsFallbackAllowed(): boolean {
  return (
    process.env.ALLOW_NO_MAPS_KEY === "1" ||
    process.env.NODE_ENV !== "production"
  );
}
