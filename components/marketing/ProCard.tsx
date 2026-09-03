import Link from "next/link";
import { Badge } from "@/components/ui/primitives";
import { MARKETING_ROUTES } from "@/lib/routes";
import type { CategoryPro } from "@/lib/supabase/publicProfiles";

/**
 * One card in "בעלי מקצוע מומלצים באזור שלך" —
 * design/screens/customer-5.3-category-page.png.
 *
 * The mock's badge row (חדש ומאומת · מחיר קבוע · זמין הערב · מומלץ Handy) is
 * four different claims, and only two of them are things this product knows.
 * The card carries those two — whether the pro is currently accepting calls,
 * and how many jobs they have closed — and leaves the marketing labels out.
 */
export function ProCard({ pro }: { pro: CategoryPro }) {
  const initial = (pro.fullName ?? "?").trim().charAt(0);

  return (
    <article className="flex h-full flex-col items-center rounded-2xl border border-line bg-surface p-5 text-center">
      {pro.avatarUrl ? (
        /* A Supabase Storage origin is configured per deployment, so
           next/image would need remotePatterns for a host that changes with
           the environment. */
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={pro.avatarUrl}
          alt=""
          className="size-16 rounded-2xl object-cover"
        />
      ) : (
        <span
          aria-hidden
          className="flex size-16 items-center justify-center rounded-2xl bg-brand-soft text-xl font-bold text-brand"
        >
          {initial}
        </span>
      )}

      <h3 className="mt-3 font-bold text-ink">
        <Link
          href={MARKETING_ROUTES.proProfile(pro.slug)}
          className="hover:text-brand"
        >
          {pro.fullName ?? "בעל מקצוע מאומת"}
        </Link>
      </h3>

      <p className="mt-1 text-sm text-muted">
        {pro.ratingAvg === null ? (
          "עדיין ללא דירוג"
        ) : (
          <>
            <span aria-hidden>★</span>{" "}
            <span className="ltr-nums">{pro.ratingAvg.toFixed(2)}</span> ·{" "}
            <span className="ltr-nums">{pro.jobsCompletedCount}</span> עבודות
          </>
        )}
      </p>

      <div className="mt-2">
        {pro.acceptingJobs ? (
          <Badge tone="done">זמין לקריאות</Badge>
        ) : (
          <Badge tone="neutral">לא מקבל קריאות כרגע</Badge>
        )}
      </div>

      {pro.minPrice !== null && (
        <p className="mt-3 text-lg font-bold text-ink">
          מ-<span className="ltr-nums">{Math.round(pro.minPrice)}</span> ₪
        </p>
      )}

      <Link
        href={MARKETING_ROUTES.proProfile(pro.slug)}
        className="mt-4 w-full rounded-xl border border-line px-4 py-2.5 text-sm font-semibold text-ink transition-colors hover:border-brand hover:text-brand"
      >
        לפרופיל
      </Link>
    </article>
  );
}
