/**
 * Every line of Hebrew that appears inside an Open Graph card.
 *
 * In one module for two reasons. The first is the ordinary one — the same
 * reason `lib/content/` exists — that copy which several routes share should
 * have a single home.
 *
 * The second is specific and load-bearing: satori has no bidirectional-text
 * engine (see `./bidi.ts`), so every one of these strings has to be a single
 * direction throughout. A number or a Latin word inside one of them would
 * render backwards, silently, in a picture nobody looks at again after the day
 * it was written. `__tests__/bidi.test.ts` walks this object and fails the
 * build if any value would need real bidi — which is only possible because
 * they are all in one object to walk.
 *
 * So: **no digits and no Latin in any value here.** A card that needs "35 ₪"
 * gives it its own element, where it is a paragraph of its own.
 */
export const OG_COPY = {
  transparency: "שינוי מחיר בשטח מחייב תמונה ואישור שלכם",

  home: {
    eyebrow: "פרסום קריאה — חינם",
    title: "בעל מקצוע אמין ליד הבית, היום",
    subtitle: "הצעות מחיר אמיתיות מבעלי מקצוע מאומתים בסביבה, תוך דקות.",
  },
} as const;

/** Every Hebrew string above, flattened — what the audit walks. */
export function ogCopyValues(): string[] {
  const out: string[] = [];

  const walk = (node: unknown) => {
    if (typeof node === "string") out.push(node);
    else if (node && typeof node === "object")
      Object.values(node).forEach(walk);
  };

  walk(OG_COPY);
  return out;
}
