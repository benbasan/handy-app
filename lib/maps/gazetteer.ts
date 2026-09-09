import { LOCALITIES, type Locality } from "./localities.data";
import { haversineKm } from "./geometry";

/**
 * Finding the locality inside a hand-typed Hebrew address.
 *
 * This is what stands in for a Geocoding API in a deployment with no Google
 * Maps key, which is every deployment of this product today (CLAUDE.md §2). It
 * resolves a town, never a door: the point it hands back is the middle of a
 * place, and `geocodeAddress` flags it `approximate` so a screen can say so.
 *
 * Pure, and free of `server-only` on purpose — components/ui/AddressField.tsx
 * runs the same functions in the browser as the customer types, so the answer
 * arrives before the form is submitted rather than as an error afterwards. The
 * browser's answer is a convenience; the server runs it again and is the
 * authority.
 *
 * WHY TOKENS RATHER THAN `String.includes`. The previous gazetteer asked
 * whether the address contained the city's name anywhere in it, which is true
 * of "יפו" inside "יפואי" and of "לוד" inside a dozen surnames. Comparing runs
 * of whole words removes that class of mistake outright, and makes
 * longest-match fall out for free: "רמת השרון" beats "רמת גן" on an address
 * that says the former, because it matches more words, not because it happens
 * to sort first.
 */

export type { Locality };

/** Every locality name, for a "choose your city" control. Sorted for display. */
export const LOCALITY_NAMES: readonly string[] = LOCALITIES.map(
  (locality) => locality.name,
).sort((a, b) => a.localeCompare(b, "he"));

/**
 * Hebrew combining marks — niqqud, cantillation, shin/sin dots. Deliberately
 * NOT the whole U+0591–U+05C7 block: U+05BE MAQAF lives in it and is a hyphen,
 * not a vowel, and swallowing it turns "מודיעין־מכבים־רעות" into one word that
 * matches nothing. Kept identical to scripts/build-gazetteer.mjs, which folds
 * the stored forms the same way; tests/gazetteerData.test.ts asserts they agree.
 */
const MARKS = /[֑-ׇֽֿׁׂׅׄ]/g;
const QUOTES = /["'`׳״‘’“”]/g;
const HAS_QUOTE = /["'`׳״‘’“”]/;
const SEPARATORS = /[-־‐-―(),./]/g;

/**
 * Words that introduce a street rather than name one. Dropped only from the
 * START of a comma-separated part, and only when something follows: "שדרות"
 * begins "שדרות רוטשילד 10" and IS the town in "הרצל 5, שדרות", and the
 * position is the only thing that tells the two apart.
 */
const STREET_PREFIXES = new Set([
  "רחוב",
  "רח",
  "שדרות",
  "שדרת",
  "שד",
  "סמטת",
  "סמטה",
  "דרך",
  "כיכר",
  "ככר",
  "שכונת",
  "שכ",
]);

/**
 * A flat, a floor, an entrance, a PO box. Each takes the token after it too,
 * because that token is its number and would otherwise be read as a house
 * number that is already gone.
 */
const UNIT_WORDS = new Set([
  "דירה",
  "דירת",
  "קומה",
  "כניסה",
  "בניין",
  "בנין",
  "תד",
  "מיקוד",
  "כניסת",
]);

/** ב/ל/מ/ו/כ/ש — "בתל אביב", "לראשון לציון". Tried only as a second pass. */
const ATTACHED_PREFIXES = new Set(["ב", "ל", "מ", "ו", "כ", "ש"]);

const fold = (value: string) =>
  value
    .normalize("NFC")
    .replace(MARKS, "")
    .replace(QUOTES, "")
    .replace(SEPARATORS, " ")
    .replace(/\s+/g, " ")
    .trim();

type Part = {
  tokens: string[];
  /** Folded tokens the writer punctuated — "ת״א" → "תא". Abbreviations only. */
  punctuated: Set<string>;
};

function toPart(raw: string): Part {
  const punctuated = new Set<string>();
  const tokens: string[] = [];

  for (const rawToken of raw.split(/[\s־‐-―(),./-]+/)) {
    if (!rawToken) continue;
    const marked = rawToken.normalize("NFC").replace(MARKS, "");
    const folded = fold(marked);
    if (!folded) continue;
    if (HAS_QUOTE.test(marked)) punctuated.add(folded);
    // A folded token can still contain a space, when the raw one held a
    // separator that split into two words. Flatten it back into the stream.
    for (const word of folded.split(" ")) tokens.push(word);
  }

  const cleaned: string[] = [];
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (UNIT_WORDS.has(token)) {
      // Skip the word and the number that belongs to it.
      if (/^\d+$/.test(tokens[i + 1] ?? "")) i += 1;
      continue;
    }
    // A bare number is a house number, a floor or a postcode. Never a place.
    if (/^\d+$/.test(token)) continue;
    cleaned.push(token);
  }

  if (cleaned.length > 1 && STREET_PREFIXES.has(cleaned[0])) cleaned.shift();

  return { tokens: cleaned, punctuated };
}

/**
 * The words of an address, in order, with the noise taken out. Exported for
 * the tests, and because it is the one place that decides what "the same word"
 * means for everything downstream.
 */
export function normalizeAddress(raw: string): string[] {
  return raw.split(",").flatMap((part) => toPart(part).tokens);
}

/** name → its own token run, plus every alias's. Built once, at module load. */
type Form = { locality: Locality; words: string[] };

const FORMS_BY_FIRST_WORD = new Map<string, Form[]>();
const ABBREVIATIONS = new Map<string, Locality[]>();

for (const locality of LOCALITIES) {
  for (const form of [locality.name, ...locality.aliases]) {
    // Indexed through the very function the address goes through, so a stored
    // form can never be shaped differently from what the matcher will look for.
    // "שכונת גבעת שאול" is filed under גבעת/שאול, because that is what is left
    // of it once an address has been read.
    const words = normalizeAddress(form);
    if (words.length === 0) continue;
    const bucket = FORMS_BY_FIRST_WORD.get(words[0]);
    if (bucket) bucket.push({ locality, words });
    else FORMS_BY_FIRST_WORD.set(words[0], [{ locality, words }]);
  }
  for (const abbreviation of locality.abbreviations) {
    const bucket = ABBREVIATIONS.get(abbreviation);
    if (bucket) bucket.push(locality);
    else ABBREVIATIONS.set(abbreviation, [locality]);
  }
}

type Hit = { locality: Locality; words: number };

/** A longer run of words beats a shorter one; a tie goes to the bigger town. */
function better(a: Hit | null, b: Hit): Hit {
  if (!a) return b;
  if (b.words !== a.words) return b.words > a.words ? b : a;
  return b.locality.population > a.locality.population ? b : a;
}

/**
 * Every locality whose name runs through `tokens` starting at `at`.
 *
 * `firstWord` is what to match the token AT that position against, and is only
 * ever different from the token itself on the preposition pass, where "בתל"
 * has to open "תל אביב" while every word after it still has to match verbatim.
 */
function runsAt(tokens: string[], at: number, firstWord: string): Hit[] {
  const hits: Hit[] = [];
  for (const form of FORMS_BY_FIRST_WORD.get(firstWord) ?? []) {
    const matches = form.words.every((word, offset) =>
      offset === 0 ? word === firstWord : tokens[at + offset] === word,
    );
    if (matches)
      hits.push({ locality: form.locality, words: form.words.length });
  }
  return hits;
}

function bestInPart(part: Part): Hit | null {
  let best: Hit | null = null;

  for (let i = 0; i < part.tokens.length; i += 1) {
    for (const hit of runsAt(part.tokens, i, part.tokens[i]))
      best = better(best, hit);
  }

  // Only if nothing matched as written: "בתל אביב", "לראשון לציון". Held back
  // to a second pass because stripping a letter first would break the towns
  // whose names begin with one — בת ים, בני ברק, לוד, מודיעין.
  if (!best) {
    for (let i = 0; i < part.tokens.length; i += 1) {
      const token = part.tokens[i];
      if (token.length < 2 || !ATTACHED_PREFIXES.has(token[0])) continue;
      for (const hit of runsAt(part.tokens, i, token.slice(1))) {
        // The stripped word has to be the whole first word of the form, so
        // "בתל" may open "תל אביב" but the rest must still match verbatim.
        best = better(best, hit);
      }
    }
  }

  // An abbreviation counts only where the writer actually punctuated it. Bare
  // "פת" is a Hebrew word; "פ״ת" is a town, and the gershayim is the difference.
  for (const token of part.punctuated) {
    for (const locality of ABBREVIATIONS.get(token) ?? []) {
      best = better(best, { locality, words: 1 });
    }
  }

  return best;
}

/**
 * The locality a typed address is in, or null when none of them is named in it.
 *
 * Null is a real answer and the caller has to handle it. The gazetteer this
 * replaced returned the middle of Tel Aviv instead, which meant a call in a
 * town it did not recognise was quietly broadcast to the wrong pros with
 * nothing on any screen to say so.
 *
 * The LAST comma-separated part is tried first, because that is where an
 * Israeli address puts its city and because `job_city()` in the database reads
 * exactly the same part (`split_part(address_text, ',', -1)`). Agreeing with it
 * by construction is what keeps the stored point and the admin console's idea
 * of the same job's city from drifting apart.
 */
export function matchLocality(raw: string): Locality | null {
  if (!raw.trim()) return null;

  const parts = raw.split(",").map(toPart);

  for (let i = parts.length - 1; i >= 0; i -= 1) {
    const hit = bestInPart(parts[i]);
    if (hit) return hit.locality;
  }

  // Nothing per part — try the whole string, so a name split across a comma
  // ("פרדס חנה, כרכור") still lands.
  const whole: Part = {
    tokens: parts.flatMap((part) => part.tokens),
    punctuated: new Set(parts.flatMap((part) => [...part.punctuated])),
  };
  return bestInPart(whole)?.locality ?? null;
}

/**
 * The locality closest to a point. This is how a GPS fix becomes a name the
 * customer can recognise and a pro can read — the point itself is kept, and is
 * far better than the town centre this returns.
 */
export function nearestLocality(lat: number, lng: number): Locality | null {
  let best: Locality | null = null;
  let bestKm = Infinity;

  for (const locality of LOCALITIES) {
    const km = haversineKm({ lat, lng }, locality);
    if (km < bestKm) {
      bestKm = km;
      best = locality;
    }
  }

  return best;
}
