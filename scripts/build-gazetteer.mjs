#!/usr/bin/env node
/**
 * Generate lib/maps/localities.data.ts — the list of Israeli localities the
 * address field and the server-side geocoder match a typed address against.
 *
 *   npm run gazetteer:build
 *
 * Run by hand, never in the build. The output is committed, so a clone, CI and
 * a deploy all read the same rows and nothing depends on Wikidata being up.
 *
 * WHY THIS IS GENERATED RATHER THAN TYPED. CLAUDE.md section 3 forbids an
 * invented figure on a page, and a coordinate is a figure: a gazetteer written
 * from memory is 280 numbers nobody can check. Every row here has a Wikidata
 * item behind it, the header records the queries that produced it, and
 * refreshing the file is one command rather than an afternoon of proofreading.
 *
 * WHY THE ALIASES MATTER MORE THAN THE COUNT. Israeli addresses are written in
 * whatever spelling the writer prefers — "פתח תקוה" beside "פתח תקווה",
 * "קרית גת" beside "קריית גת". Those are `skos:altLabel` values on the same
 * item, so pulling them is both free and honest; guessing them is neither.
 *
 * WHY MOST ALIASES ARE THROWN AWAY AGAIN. `skos:altLabel` mixes two unrelated
 * things: spellings of the name, and nicknames for the place. Jerusalem's
 * aliases include "ציון" and "אריאל" — and Ariel is a different city forty
 * kilometres away. A nickname in a gazetteer is not a near miss, it is a job
 * broadcast to the pros of the wrong town, so `keepAlias` below keeps only what
 * is demonstrably a spelling OF THE NAME: a variant close enough to be the same
 * string mistyped, one half of a hyphenated name, or the name's initials.
 */

import { writeFileSync } from "node:fs";

const ENDPOINT = "https://query.wikidata.org/sparql";
const OUT = new URL("../lib/maps/localities.data.ts", import.meta.url);

/** Below this, a place is not somewhere a customer posts a call from. */
const MIN_POPULATION = 2000;

/**
 * `P17 = Israel` plus a population is not enough on its own: districts,
 * sub-districts, regional councils and the country itself all satisfy it, and
 * "מחוז המרכז" is not an address. An allowlist of `P31` types is used rather
 * than a blocklist so that a new administrative class appearing in Wikidata
 * fails closed — it is left out until somebody looks at it.
 *
 * Neighbourhoods and quarters are deliberately IN: "רמות", "פסגת זאב" and
 * "פלורנטין" are what people actually type, and each carries its own point,
 * which is closer to the door than the city centre would be.
 */
const ALLOWED_TYPES = new Set([
  "human settlement",
  "city",
  "town",
  "village",
  "big city",
  "city or town",
  "border city",
  "development town",
  "planned community",
  "urban-type settlement",
  "hamlet",
  "locality",
  "municipality",
  "municipality of Israel",
  "local council",
  "local council in Israel",
  "city council",
  "community settlement",
  "Israeli settlement",
  "Nahal settlement",
  "Zionist settlement",
  "moshav",
  "kibbutz",
  "neighborhood",
  "neighborhood of Jerusalem",
  "quarter",
  "christian quarter",
]);

const localitiesQuery = (where) => `
SELECT ?item ?name (MAX(?pop) AS ?population)
       (SAMPLE(?lat) AS ?latitude) (SAMPLE(?lon) AS ?longitude)
       (GROUP_CONCAT(DISTINCT ?typeLabel; separator="|") AS ?types) WHERE {
  ${where}
  ?item wdt:P1082 ?pop ; p:P625/psv:P625 ?node .
  ?node wikibase:geoLatitude ?lat ; wikibase:geoLongitude ?lon .
  ?item rdfs:label ?name . FILTER(lang(?name) = "he")
  ?item wdt:P31 ?type . ?type rdfs:label ?typeLabel . FILTER(lang(?typeLabel) = "en")
}
GROUP BY ?item ?name
HAVING (MAX(?pop) >= ${MIN_POPULATION})
`;

/**
 * Two queries rather than one, because Wikidata does not agree with itself
 * about which country the settlements are in: Ariel, Ma'ale Adumim, Beitar
 * Illit and Modi'in Illit carry `P17` values of Palestine or the West Bank, so
 * a country filter alone silently loses four towns of 20,000–76,000 people whose
 * residents would be reaching this product. `Q582706` (Israeli settlement) picks
 * exactly those up and does not reach Ramallah, Nablus or Gaza, which are not
 * this marketplace's service area.
 */
const QUERIES = [
  ["in Israel", localitiesQuery("?item wdt:P17 wd:Q801 .")],
  ["Israeli settlements", localitiesQuery("?item wdt:P31 wd:Q582706 .")],
];

const aliasesQuery = (qids) => `
SELECT ?item ?alt WHERE {
  VALUES ?item { ${qids.map((id) => `wd:${id}`).join(" ")} }
  ?item skos:altLabel ?alt . FILTER(lang(?alt) = "he")
}
`;

/**
 * The public endpoint answers a cold query in a second and times out on the
 * next one for no reason anybody can see, so every call gets three tries.
 */
async function sparql(query, label) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Accept: "application/sparql-results+json",
        "Content-Type": "application/x-www-form-urlencoded",
        // Wikidata asks for a descriptive agent and throttles anonymous ones.
        "User-Agent":
          "handy-app gazetteer build (https://github.com/handy-app)",
      },
      body: new URLSearchParams({ query }),
    });

    if (response.ok) return (await response.json()).results.bindings;

    process.stderr.write(
      `  ${label}: HTTP ${response.status} on attempt ${attempt}\n`,
    );
    if (attempt < 3) await new Promise((r) => setTimeout(r, 5000 * attempt));
  }
  throw new Error(`${label}: gave up after three attempts`);
}

/**
 * Hebrew combining marks — niqqud, cantillation, shin/sin dots. Deliberately
 * NOT the whole U+0591–U+05C7 block: U+05BE MAQAF lives in it and is a hyphen,
 * not a vowel. Sweeping it up turns "מודיעין־מכבים־רעות" into one long word
 * that matches nothing a person would type.
 */
const MARKS = /[֑-ׇֽֿׁׂׅׄ]/g;
const QUOTES = /["'`׳״‘’“”]/g;
const HYPHENS = /[-־‐-―–—]/g;
const HAS_QUOTE = /["'`׳״‘’“”]/;
const HAS_HYPHEN = /[-־‐-―–—]/;

const stripMarks = (value) => value.normalize("NFC").replace(MARKS, "").trim();

/** What the matcher will see. Kept in step with normalizeAddress() by a test. */
const collapse = (value) =>
  stripMarks(value)
    .replace(QUOTES, "")
    .replace(HYPHENS, " ")
    .replace(/[(),]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/**
 * A hyphen in a Hebrew locality name is two different things. In "תל אביב-יפו",
 * "פרדס חנה-כרכור" and "מודיעין־מכבים־רעות" it joins names of places that each
 * stand alone, and both halves are what people write. In an Arabic name written
 * in Hebrew — "אום אל-פחם", "א-סייד", "ג׳סר א-זרקא" — it attaches the article,
 * and the halves are "אום אל" and "פחם", neither of which is anywhere. So the
 * split is skipped entirely when the name carries an article, and a half has to
 * be long enough to be a name rather than a particle.
 */
const ARABIC_ARTICLE = /(^|[\s־-])א[לל]?[\s־-]|אבו\s/;

function hyphenHalves(name) {
  const marked = stripMarks(name);
  if (!HAS_HYPHEN.test(marked)) return [];
  if (ARABIC_ARTICLE.test(marked)) return [];
  return marked
    .split(HYPHENS)
    .map((half) => collapse(half))
    .filter((half) => half.length >= 4);
}

/** Plain Levenshtein. Small strings, called a few thousand times. */
function distance(a, b) {
  const rows = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    let previous = rows[0];
    rows[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const kept = rows[j];
      rows[j] = Math.min(
        rows[j] + 1,
        rows[j - 1] + 1,
        previous + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      previous = kept;
    }
  }
  return rows[b.length];
}

const similarity = (a, b) =>
  a && b ? 1 - distance(a, b) / Math.max(a.length, b.length) : 0;

/** "תל אביב" → "תא". What the gershayim forms in Wikidata abbreviate. */
const initialsOf = (name) =>
  name
    .split(" ")
    .filter(Boolean)
    .map((word) => word[0])
    .join("");

async function main() {
  const rows = new Map();
  for (const [label, query] of QUERIES) {
    process.stderr.write(`Querying Wikidata — localities ${label}…\n`);
    const bindings = await sparql(query, label);
    process.stderr.write(`  ${bindings.length} rows\n`);
    for (const binding of bindings) rows.set(binding.item.value, binding);
  }
  process.stderr.write(`  ${rows.size} distinct items across both queries\n`);

  const kept = [...rows.values()].filter((row) =>
    row.types.value.split("|").some((type) => ALLOWED_TYPES.has(type)),
  );
  process.stderr.write(
    `  ${kept.length} are a place somebody lives (${rows.size - kept.length} districts, regions and blocs dropped)\n`,
  );

  // One entry per NAME, not per item: two Wikidata items can carry the same
  // Hebrew label (a town and the neighbourhood named after it), and an address
  // cannot tell them apart. The larger one wins, because it is the one a
  // customer typing that name almost certainly means.
  const byName = new Map();
  for (const row of kept) {
    const name = stripMarks(row.name.value);
    const population = Number(row.population.value);
    const existing = byName.get(name);
    if (existing && existing.population >= population) continue;
    byName.set(name, {
      qid: row.item.value.split("/").pop(),
      name,
      lat: Number(Number(row.latitude.value).toFixed(5)),
      lng: Number(Number(row.longitude.value).toFixed(5)),
      population,
    });
  }
  process.stderr.write(`  ${byName.size} distinct names\n`);

  process.stderr.write("Querying Hebrew aliases…\n");
  const entries = [...byName.values()];
  const rawAliases = new Map();
  for (let i = 0; i < entries.length; i += 100) {
    const batch = entries.slice(i, i + 100);
    const bindings = await sparql(
      aliasesQuery(batch.map((entry) => entry.qid)),
      `aliases ${Math.floor(i / 100) + 1}`,
    );
    for (const binding of bindings) {
      const qid = binding.item.value.split("/").pop();
      if (!rawAliases.has(qid)) rawAliases.set(qid, []);
      rawAliases.get(qid).push(binding.alt.value);
    }
  }

  const canonical = new Set(entries.map((entry) => collapse(entry.name)));

  /**
   * Anything close enough to the name — or to one half of it — to be the same
   * string written differently. 0.6 keeps "פתח תקוה"/"פתח תקווה" and
   * "סכנין"/"סחנין"; it drops "ציון" for Jerusalem and "נווה יהושע" for Ramat
   * Gan, which are nicknames and neighbourhoods, not spellings.
   */
  const SPELLING_SIMILARITY = 0.6;

  for (const entry of entries) {
    const self = collapse(entry.name);
    const halves = hyphenHalves(entry.name);
    const forms = [self, ...halves];

    const seen = new Set([self]);
    entry.aliases = [
      ...halves.filter((half) => !seen.has(half) && seen.add(half)),
    ];
    entry.abbreviations = [];

    for (const raw of rawAliases.get(entry.qid) ?? []) {
      const cleaned = collapse(raw);
      if (!cleaned || seen.has(cleaned)) continue;

      // An alias that is another locality's real name is worse than no alias:
      // it would place every address in that town at this one instead.
      if (canonical.has(cleaned)) continue;

      const abbreviation =
        HAS_QUOTE.test(stripMarks(raw)) &&
        forms.some((form) => initialsOf(form) === cleaned);

      const spelling =
        cleaned.length >= 3 &&
        forms.some((form) => similarity(form, cleaned) >= SPELLING_SIMILARITY);

      if (!abbreviation && !spelling) continue;

      seen.add(cleaned);
      (abbreviation ? entry.abbreviations : entry.aliases).push(cleaned);
    }
  }

  // A form two localities both claim identifies neither. Dropped from both,
  // rather than handed to whichever happened to sort first.
  const claims = new Map();
  for (const entry of entries) {
    for (const form of [...entry.aliases, ...entry.abbreviations]) {
      claims.set(form, (claims.get(form) ?? 0) + 1);
    }
  }
  let contested = 0;
  for (const entry of entries) {
    const drop = (form) => {
      const keep = claims.get(form) === 1;
      if (!keep) contested += 1;
      return keep;
    };
    entry.aliases = entry.aliases.filter(drop);
    entry.abbreviations = entry.abbreviations.filter(drop);
  }
  process.stderr.write(`  ${contested} contested forms dropped\n`);

  entries.sort((a, b) => a.name.localeCompare(b.name, "he"));

  const generated = new Date().toISOString().slice(0, 10);
  const body = entries
    .map(
      (entry) =>
        `  { name: ${JSON.stringify(entry.name)}, aliases: ${JSON.stringify(entry.aliases)}, abbreviations: ${JSON.stringify(entry.abbreviations)}, lat: ${entry.lat}, lng: ${entry.lng}, population: ${entry.population} },`,
    )
    .join("\n");

  writeFileSync(
    OUT,
    `/**
 * GENERATED FILE — do not edit by hand.
 *
 * Written by scripts/build-gazetteer.mjs on ${generated} from Wikidata's public
 * SPARQL endpoint (https://query.wikidata.org/sparql), under CC0. Every locality
 * in Israel with a recorded population of ${MIN_POPULATION.toLocaleString("en-US")} or more, a coordinate, a Hebrew
 * label and an instance-of type that means somewhere people live — plus the
 * Israeli settlements, which Wikidata files under a different country.
 *
 * \`aliases\` are spellings of the name, not nicknames for the place: a Hebrew
 * \`skos:altLabel\` close enough to the name to be it mistyped ("פתח תקוה"), or
 * one half of a hyphenated name ("פרדס חנה", "כרכור"). See the script for why
 * the rest are thrown away — Jerusalem's altLabels include "אריאל".
 *
 * \`abbreviations\` are the gershayim forms — "ת״א", "פ״ת" — and are matched ONLY
 * against a token the writer actually punctuated that way. Bare "פת" is a Hebrew
 * word, and a word must not silently become a city.
 *
 * Every form here is stored already normalised: no niqqud, no gershayim,
 * hyphens folded to spaces. lib/maps/gazetteer.ts puts a typed address through
 * the same folding before comparing, and a test asserts the two agree.
 *
 * ${entries.length} localities. To refresh: npm run gazetteer:build
 */
export type Locality = {
  name: string;
  /** Normalised spellings of the name, including each half of a hyphenated one. */
  aliases: readonly string[];
  /** Normalised gershayim forms. Matched only against punctuated input. */
  abbreviations: readonly string[];
  lat: number;
  lng: number;
  /** Breaks a tie when two localities match an address equally well. */
  population: number;
};

export const LOCALITIES: readonly Locality[] = [
${body}
];
`,
    "utf8",
  );

  const withAliases = entries.filter(
    (entry) => entry.aliases.length + entry.abbreviations.length > 0,
  ).length;
  process.stderr.write(
    `\nWrote ${entries.length} localities (${withAliases} with a spelling variant) to lib/maps/localities.data.ts\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});
