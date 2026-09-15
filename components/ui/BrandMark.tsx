/**
 * The Handy mark (Phase 19): a house that talks — a roofline with a chat tail,
 * a check inside it, and a saffron dot where a chimney would be. Picked by the
 * user from three on the brand board, because it says both halves of the
 * product at once: somebody verified comes to the house, and you talk first.
 *
 * One component, so the header, the pro header, the tab icon, the home-screen
 * icon and the share card cannot drift into five drawings of it. The image
 * routes (`app/icon.tsx` and friends) cannot use Tailwind classes, so they take
 * the raw paths from `BRAND_MARK_PATHS` with literal colours instead.
 */

export const BRAND_MARK_PATHS = {
  house: "M5 14.2 16 5l11 9.2V24a2 2 0 0 1-2 2H13l-5.5 4.2V26H7a2 2 0 0 1-2-2Z",
  check: "m11.2 17.2 3.3 3.3 6.3-6.5",
  dot: { cx: 23, cy: 8.6, r: 2.4 },
} as const;

/** The token values the image routes need, where no stylesheet exists. */
export const BRAND_HEX = {
  brand: "#0b6b5d",
  pro: "#123c37",
  accent: "#eea63a",
  canvas: "#f8f4ec",
  ink: "#1f1a14",
} as const;

export function BrandMark({
  tone = "brand",
  className = "size-8",
}: {
  tone?: "brand" | "pro" | "ink";
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 32 32"
      aria-hidden
      focusable="false"
      className={`shrink-0 ${className}`}
    >
      <path
        d={BRAND_MARK_PATHS.house}
        className={
          tone === "pro"
            ? "fill-pro"
            : tone === "ink"
              ? "fill-ink"
              : "fill-brand"
        }
      />
      <path
        d={BRAND_MARK_PATHS.check}
        fill="none"
        stroke="white"
        strokeWidth={2.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle {...BRAND_MARK_PATHS.dot} className="fill-accent" />
    </svg>
  );
}
