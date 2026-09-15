import Link from "next/link";
import { BrandMark } from "@/components/ui/BrandMark";

/**
 * The wordmark: "Handy" in the display face beside the mark (Phase 19). Latin
 * text inside an RTL page, so it carries its own dir rather than relying on the
 * bidi algorithm to guess right.
 */
export function Logo({ href = "/" }: { href?: string }) {
  return (
    <Link
      href={href}
      dir="ltr"
      className="flex items-center gap-2 font-display text-2xl font-bold text-ink"
      aria-label="Handy — לעמוד הבית"
    >
      <span>Handy</span>
      <BrandMark className="size-8" />
    </Link>
  );
}
