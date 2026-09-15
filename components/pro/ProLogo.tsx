import Link from "next/link";
import { BrandMark } from "@/components/ui/BrandMark";
import { PRO_ROUTES } from "@/lib/routes";

/**
 * "Handy Pro" — the same mark and wordmark as the customer Logo, with the
 * house in the pro side's dark petrol and "Pro" in the brand petrol. Since
 * Phase 19 the two sides are one brand rather than a blue one and an indigo
 * one. Latin text inside an RTL page, so it declares its own direction.
 */
export function ProLogo({ href = PRO_ROUTES.landing }: { href?: string }) {
  return (
    <Link
      href={href}
      dir="ltr"
      className="flex items-center gap-2 font-display text-2xl font-bold"
      aria-label="Handy Pro — לאזור בעלי המקצוע"
    >
      <span className="text-ink">Handy</span>
      <span className="text-brand">Pro</span>
      <BrandMark tone="pro" className="size-8" />
    </Link>
  );
}
