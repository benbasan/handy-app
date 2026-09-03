import type { JobsPerDay } from "@/lib/supabase/admin";
import type { CategoryShare } from "@/lib/supabase/admin";
import { hebrewWeekday } from "@/lib/validation/admin";

/**
 * "קריאות לפי יום" and the trade legend beneath it —
 * design/screens/admin-7.1-overview.png.
 *
 * Bars rather than a charting library: seven values with one highlighted is a
 * flex row, and a dependency that draws it would be a dependency to keep
 * current for the rest of the project. The busiest day is the one in brand
 * blue, which is what the design highlights.
 *
 * Both halves come from the same window (`p_days`), so the picture and its key
 * can never be describing two different weeks.
 */
const LEGEND_TONES = [
  "bg-brand",
  "bg-pro",
  "bg-cta",
  "bg-alert",
  "bg-ink",
] as const;

export function JobsPerDayChart({
  days,
  mix,
  rangeLabel,
}: {
  days: readonly JobsPerDay[];
  mix: readonly CategoryShare[];
  rangeLabel: string;
}) {
  const peak = Math.max(...days.map((day) => day.jobsCount), 1);
  const total = days.reduce((sum, day) => sum + day.jobsCount, 0);

  return (
    <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-bold text-ink">קריאות לפי יום</h2>
        <p className="text-sm text-muted">{rangeLabel}</p>
      </div>

      {total === 0 ? (
        <p className="mt-8 text-muted">
          לא נפתחה אף קריאה בטווח הזה. זה מצב אמיתי בשבוע הראשון של אזור חדש —
          ולא גרף ריק שמחכה לנתונים.
        </p>
      ) : (
        <div
          className="mt-6 flex h-48 items-end gap-2 sm:gap-3"
          role="img"
          aria-label={`קריאות לפי יום, ${rangeLabel}: ${days
            .map(
              (day) => `${hebrewWeekday(new Date(day.day))} ${day.jobsCount}`,
            )
            .join(", ")}`}
        >
          {days.map((day) => (
            <div key={day.day} className="flex flex-1 flex-col items-center">
              <span className="mb-1 text-xs font-semibold text-muted">
                {day.jobsCount}
              </span>
              <div
                className={`w-full rounded-lg ${
                  day.jobsCount === peak ? "bg-brand" : "bg-brand-soft"
                }`}
                style={{
                  height: `${Math.max((day.jobsCount / peak) * 100, 4)}%`,
                }}
              />
              <span className="mt-2 text-sm text-muted">
                {hebrewWeekday(new Date(day.day))}
              </span>
            </div>
          ))}
        </div>
      )}

      {mix.length > 0 && (
        <ul className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-line pt-4 text-sm">
          {mix.slice(0, 5).map((share, index) => (
            <li
              key={share.categorySlug}
              className="flex items-center gap-2 text-muted"
            >
              <span
                aria-hidden
                className={`size-2.5 rounded-full ${LEGEND_TONES[index % LEGEND_TONES.length]}`}
              />
              <span className="font-semibold text-ink">
                {share.categoryName}
              </span>
              <span className="ltr-nums">{share.sharePct}%</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
