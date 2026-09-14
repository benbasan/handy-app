/**
 * Which trade a sentence like "המזגן מטפטף מים" is about — the landing page's
 * "מה קרה?" box (Phase 13.7).
 *
 * Deliberately a word list and not a model. The box has one job — to save the
 * visitor a tap on a tile — and the form it hands over to asks the question
 * again anyway, so a miss costs nothing and a *wrong* hit costs a little. That
 * asymmetry is the whole design:
 *
 *  * **Whole words only**, the same rule `lib/maps/gazetteer.ts` settled on.
 *    "ברזל" is not "ברז", and a substring match would say it is.
 *  * **A tie is no answer.** "ניקוי מזגן" names two trades; picking one would
 *    be the box guessing, so it returns null and the form leaves step 1 open.
 *  * **Words that belong to two trades are left out entirely** rather than
 *    weighted. "מטפטף" is a tap and an air conditioner, "דלת" is a carpenter
 *    and a locksmith, "דוד" is a boiler and a man's name. A list that holds
 *    only words that point one way cannot be argued with.
 *
 * Keyed by `categories.slug`, like lib/content/categories.ts, so renaming a
 * trade in Hebrew cannot silently break it.
 */

const KEYWORDS: Readonly<Record<string, readonly string[]>> = {
  plumbing: [
    "אינסטלטור",
    "אינסטלציה",
    "ברז",
    "ברזים",
    "נזילה",
    "נזילות",
    "דולף",
    "דולפת",
    "דולפים",
    "סתימה",
    "סתימות",
    "סתום",
    "סתומה",
    "כיור",
    "אסלה",
    "ניאגרה",
    "צנרת",
    "צינור",
    "צינורות",
    "ביוב",
    "בוילר",
    "מקלחת",
    "אמבטיה",
    "סיפון",
  ],
  electrical: [
    "חשמל",
    "חשמלאי",
    "שקע",
    "שקעים",
    "קצר",
    "מפסק",
    "מפסקים",
    "פחת",
    "נורה",
    "נורות",
    "תאורה",
    "מנורה",
    "ממסר",
  ],
  hvac: ["מזגן", "מזגנים", "מיזוג", "קירור", "מעבה"],
  carpentry: [
    "נגר",
    "נגרות",
    "ארון",
    "ארונות",
    "מגירה",
    "מגירות",
    "ציר",
    "צירים",
    "מדף",
    "מדפים",
  ],
  painting: ["צבע", "צביעה", "צבעי", "לצבוע", "סיוד", "קילופים"],
  locksmith: [
    "מנעול",
    "מנעולים",
    "מנעולן",
    "צילינדר",
    "נעול",
    "נעולה",
    "ננעלתי",
    "ננעלה",
    "מפתח",
    "מפתחות",
  ],
  gardening: [
    "גינה",
    "גינון",
    "גנן",
    "דשא",
    "השקיה",
    "גיזום",
    "ממטרה",
    "ממטרות",
  ],
  cleaning: ["ניקיון", "נקיון", "לנקות", "ניקוי", "מנקה", "פוליש"],
  "furniture-assembly": [
    "הרכבה",
    "להרכיב",
    "הרכבת",
    "איקאה",
    "ikea",
    "רהיט",
    "רהיטים",
    "מיטה",
  ],
  waterproofing: ["איטום", "רטיבות", "עובש", "גג", "זפת", "חדירת"],
};

/**
 * The one-letter words Hebrew glues to the front of the next one: ה, ו, ב, ל,
 * מ, ש, כ. "והמזגן", "בכיור", "מהברז". Up to two are peeled, which covers
 * every real combination ("שב", "וה", "מה") without reaching three, where a
 * genuine word starts to be mistaken for a prefixed one.
 */
const PREFIXES = new Set(["ה", "ו", "ב", "ל", "מ", "ש", "כ"]);

/** Niqqud and cantillation — a pasted sentence sometimes carries them. */
const MARKS = /[֑-ׇ]/g;

const INDEX = new Map<string, string>();
for (const [slug, words] of Object.entries(KEYWORDS)) {
  for (const word of words) {
    const existing = INDEX.get(word);
    // Loud at import rather than quiet at runtime: a word filed under two
    // trades is exactly the ambiguity this list promises not to contain.
    if (existing && existing !== slug) {
      throw new Error(
        `intent: "${word}" is listed under ${existing} and ${slug}`,
      );
    }
    INDEX.set(word, slug);
  }
}

/** The words of a sentence, folded the way the index was built. */
export function intentWords(text: string): string[] {
  return text
    .normalize("NFC")
    .replace(MARKS, "")
    .toLowerCase()
    .split(/[^\p{L}]+/u)
    .filter(Boolean);
}

function slugForWord(word: string): string | null {
  const direct = INDEX.get(word);
  if (direct) return direct;

  // A stem shorter than two letters is not a word any list here contains, and
  // letting "בה" become "ה" would be matching on noise.
  for (let peel = 1; peel <= 2 && word.length - peel >= 2; peel += 1) {
    if (!PREFIXES.has(word[peel - 1]!)) break;
    const stem = INDEX.get(word.slice(peel));
    if (stem) return stem;
  }

  return null;
}

/**
 * The slug of the one trade a sentence is clearly about, or null.
 *
 * Null is a real answer and the common one — "משהו לא עובד בבית" names
 * nothing, and a tie names too much. Either way the caller carries the text
 * over and lets the visitor pick the tile.
 */
export function matchCategoryIntent(text: string): string | null {
  const scores = new Map<string, number>();
  for (const word of intentWords(text)) {
    const slug = slugForWord(word);
    if (slug) scores.set(slug, (scores.get(slug) ?? 0) + 1);
  }

  let best: string | null = null;
  let bestScore = 0;
  let tied = false;
  for (const [slug, score] of scores) {
    if (score > bestScore) {
      best = slug;
      bestScore = score;
      tied = false;
    } else if (score === bestScore) {
      tied = true;
    }
  }

  return tied ? null : best;
}

/** Every slug the list knows about — for the test that keeps it in step with the seed. */
export const INTENT_SLUGS: readonly string[] = Object.keys(KEYWORDS);
