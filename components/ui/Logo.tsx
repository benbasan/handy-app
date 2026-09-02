import Link from "next/link";

/**
 * The wordmark from design/screens: "Handy" in brand blue beside a filled
 * circle carrying an H. Latin text inside an RTL page, so it carries its own
 * dir rather than relying on the bidi algorithm to guess right.
 */
export function Logo({ href = "/" }: { href?: string }) {
  return (
    <Link
      href={href}
      dir="ltr"
      className="flex items-center gap-2 text-xl font-bold text-brand"
      aria-label="Handy — לעמוד הבית"
    >
      <span>Handy</span>
      <span
        aria-hidden
        className="flex size-7 items-center justify-center rounded-full bg-brand text-sm font-bold text-white"
      >
        H
      </span>
    </Link>
  );
}
