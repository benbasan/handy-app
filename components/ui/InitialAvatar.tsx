/**
 * A pro with no portrait, drawn as their initial on a warm ground (Phase 19).
 *
 * Every such pro used to be the same pale-blue square with a blue letter, so a
 * row of three pros on a category page read as three copies of one
 * placeholder. The ground is picked from the name, so the same person is the
 * same colour on every page they appear on — the category card, the public
 * profile — without storing a colour anywhere.
 *
 * Ink on each ground clears 14:1.
 */
const GROUNDS = ["bg-accent-soft", "bg-brand-soft", "bg-pro-soft"] as const;

function groundFor(name: string): (typeof GROUNDS)[number] {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.codePointAt(0)!) >>> 0;
  return GROUNDS[hash % GROUNDS.length];
}

export function InitialAvatar({
  name,
  className = "size-16 text-xl",
}: {
  name: string;
  /** Size and type size; the shape, ground and weight are this component's. */
  className?: string;
}) {
  const initial = name.trim().charAt(0) || "?";

  return (
    <span
      aria-hidden
      className={`flex shrink-0 items-center justify-center rounded-2xl font-display font-bold text-ink ${groundFor(name)} ${className}`}
    >
      {initial}
    </span>
  );
}
