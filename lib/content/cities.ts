/**
 * The cities the category+city SEO pages are published for.
 *
 * Deliberately a curated list in code rather than a table. A city here is a
 * marketing page, not an entity the product has any other opinion about: no
 * row anywhere references one, `jobs` stores an address and derives its city
 * with `job_city()`, and a pro stores a point. What this list decides is which
 * URLs exist and which coordinates the "who covers this place" query is asked
 * about — a publishing decision, and publishing decisions belong in the repo
 * where they can be reviewed in a diff.
 *
 * Coordinates match the gazetteer in lib/maps/geocode.ts, which is the other
 * place in this codebase that knows where an Israeli city is. Keep them in
 * step: a page that counts pros around one point and a job placed at another
 * would quietly disagree about the same city.
 */
export type City = {
  /** The URL segment: /services/plumbing/tel-aviv. */
  slug: string;
  nameHe: string;
  lat: number;
  lng: number;
};

export const CITIES: readonly City[] = [
  { slug: "tel-aviv", nameHe: "תל אביב", lat: 32.0853, lng: 34.7818 },
  { slug: "jerusalem", nameHe: "ירושלים", lat: 31.7683, lng: 35.2137 },
  { slug: "haifa", nameHe: "חיפה", lat: 32.794, lng: 34.9896 },
  { slug: "rishon-lezion", nameHe: "ראשון לציון", lat: 31.9642, lng: 34.8044 },
  { slug: "petah-tikva", nameHe: "פתח תקווה", lat: 32.0878, lng: 34.8878 },
  { slug: "ashdod", nameHe: "אשדוד", lat: 31.8014, lng: 34.6435 },
  { slug: "netanya", nameHe: "נתניה", lat: 32.3215, lng: 34.8532 },
  { slug: "beer-sheva", nameHe: "באר שבע", lat: 31.2518, lng: 34.7913 },
  { slug: "bnei-brak", nameHe: "בני ברק", lat: 32.0807, lng: 34.8338 },
  { slug: "holon", nameHe: "חולון", lat: 32.0117, lng: 34.7725 },
  { slug: "ramat-gan", nameHe: "רמת גן", lat: 32.0684, lng: 34.8248 },
  { slug: "rehovot", nameHe: "רחובות", lat: 31.8928, lng: 34.8113 },
  { slug: "bat-yam", nameHe: "בת ים", lat: 32.0171, lng: 34.7457 },
  { slug: "herzliya", nameHe: "הרצליה", lat: 32.1624, lng: 34.8447 },
  { slug: "kfar-saba", nameHe: "כפר סבא", lat: 32.175, lng: 34.907 },
  { slug: "raanana", nameHe: "רעננה", lat: 32.1848, lng: 34.8713 },
  { slug: "givatayim", nameHe: "גבעתיים", lat: 32.0723, lng: 34.8107 },
  { slug: "modiin", nameHe: "מודיעין", lat: 31.8928, lng: 35.0104 },
];

export function findCity(slug: string): City | undefined {
  return CITIES.find((city) => city.slug === slug);
}

/**
 * "בתל אביב". Every name on the list takes a plain ב prefix — none of them
 * starts with a definite article, which is the case that would need a different
 * preposition. Written as a function anyway, so the exception has one place to
 * go when a city that needs one is added.
 */
export function inCity(city: City): string {
  return `ב${city.nameHe}`;
}
