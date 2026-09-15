import Link from "next/link";
import { BrandMark } from "@/components/ui/BrandMark";
import { ADMIN_ROUTES } from "@/lib/routes";

/**
 * "Handy Admin" — the wordmark on all four design/screens/admin-*.png.
 *
 * Same shape as the customer and pro marks, in ink rather than either side's
 * accent: the console belongs to neither side of the marketplace. Latin text
 * inside an RTL page, so it declares its own direction instead of leaving the
 * bidi algorithm to guess.
 */
export function AdminLogo({ href = ADMIN_ROUTES.home }: { href?: string }) {
  return (
    <Link
      href={href}
      dir="ltr"
      className="flex items-center gap-2 font-display text-2xl font-bold"
      aria-label="Handy Admin — ללוח הניהול"
    >
      <span className="text-ink">Handy</span>
      <span className="text-muted">Admin</span>
      <BrandMark tone="ink" className="size-8" />
    </Link>
  );
}
