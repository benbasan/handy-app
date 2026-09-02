/**
 * The pictogram each service category is drawn with in design/screens
 * (customer-1.1-landing, customer-2.1-post-job). Keyed by `categories.slug`
 * rather than by name, so renaming a category in Hebrew does not silently
 * blank its icon.
 *
 * Emoji rather than an icon set: the design uses exactly these glyphs, they
 * need no bundle, and they render in Hebrew UIs without a font fallback dance.
 */
const CATEGORY_ICON: Record<string, string> = {
  plumbing: "🚿",
  electrical: "⚡",
  hvac: "❄️",
  carpentry: "🔨",
  painting: "🖌️",
  locksmith: "🔑",
  gardening: "🌿",
  cleaning: "🧽",
  "furniture-assembly": "🔧",
  waterproofing: "☂️",
};

export function categoryIcon(slug: string): string {
  return CATEGORY_ICON[slug] ?? "🛠️";
}
