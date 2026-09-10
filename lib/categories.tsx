import {
  BoltIcon,
  BrushIcon,
  HammerIcon,
  KeyIcon,
  LeafIcon,
  ShowerIcon,
  SnowflakeIcon,
  SprayIcon,
  ToolsIcon,
  WaterproofIcon,
  WrenchIcon,
  type IconComponent,
  type IconProps,
} from "@/components/ui/icons";

/**
 * The pictogram each service category is drawn with in design/screens
 * (customer-1.1-landing, customer-2.1-post-job). Keyed by `categories.slug`
 * rather than by name, so renaming a category in Hebrew does not silently
 * blank its icon.
 *
 * These were emoji until Phase 13.5, and the reason they no longer are is
 * written at the top of components/ui/icons.tsx. The short version is the
 * selected state: a category tile signals selection by changing its border,
 * its ground *and* its text colour, and an emoji does not inherit
 * `currentColor` — so the one element in the middle of the tile was the only
 * thing on it that never changed.
 *
 * The glyphs still follow the design's choices (a shower for plumbing, a bolt
 * for electrical); what changed is that they are now drawn rather than quoted.
 */
const CATEGORY_ICON: Record<string, IconComponent> = {
  plumbing: ShowerIcon,
  electrical: BoltIcon,
  hvac: SnowflakeIcon,
  carpentry: HammerIcon,
  painting: BrushIcon,
  locksmith: KeyIcon,
  gardening: LeafIcon,
  cleaning: SprayIcon,
  "furniture-assembly": WrenchIcon,
  waterproofing: WaterproofIcon,
};

/**
 * The icon for a slug, as an element.
 *
 * A component rather than a `categoryIcon(slug)` lookup that hands the caller a
 * component to render. That first shape typechecks and works, and the React
 * Compiler lint rule `react-hooks/static-components` is right to refuse it: a
 * component value created during render is a new identity on every pass, so
 * React remounts the subtree under it rather than updating it. Harmless for a
 * leaf `<svg>` and a trap the moment one of these ever holds state.
 *
 * ```tsx
 * <CategoryIcon slug={category.slug} className="size-7" />
 * ```
 */
export function CategoryIcon({ slug, ...props }: IconProps & { slug: string }) {
  const Icon = CATEGORY_ICON[slug] ?? ToolsIcon;
  return <Icon {...props} />;
}
