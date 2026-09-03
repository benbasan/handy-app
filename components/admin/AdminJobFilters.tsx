import { INPUT_CLASS } from "@/components/ui/primitives";
import { ADMIN_ROUTES } from "@/lib/routes";
import type { Category } from "@/lib/supabase/jobs";
import {
  ADMIN_JOB_STATUS_FILTERS,
  ADMIN_JOB_STATUS_FILTER_LABEL,
  ADMIN_RANGE_DAYS,
  ADMIN_RANGE_LABEL,
  type AdminJobFilters as Filters,
} from "@/lib/validation/admin";

/**
 * The search box and four chips above the table on
 * design/screens/admin-7.3-jobs-management.png.
 *
 * A plain GET form rather than a client component: every filter belongs in the
 * URL anyway — an admin looking at "קריאות ללא הצעות בתל אביב" wants to be
 * able to send that link to somebody — and the server component below it
 * re-reads them on every navigation. `submit` on change is the one piece of
 * behaviour that needs JS, and without it the form still works from the
 * keyboard.
 */
const CHIP_CLASS =
  "rounded-xl border border-line bg-surface px-4 py-2.5 text-sm font-semibold text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/20";

export function AdminJobFilters({
  filters,
  categories,
  cities,
}: {
  filters: Filters;
  categories: readonly Category[];
  cities: ReadonlyArray<{ city: string; jobsCount: number }>;
}) {
  return (
    <form
      action={ADMIN_ROUTES.jobs}
      method="get"
      className="flex flex-wrap items-center gap-3"
    >
      <div className="min-w-64 flex-1">
        <label htmlFor="admin-job-search" className="sr-only">
          חיפוש קריאה
        </label>
        <input
          id="admin-job-search"
          type="search"
          name="search"
          defaultValue={filters.search ?? ""}
          placeholder="חפש לפי מספר קריאה, לקוח או בעל מקצוע"
          className={INPUT_CLASS}
        />
      </div>

      <label htmlFor="admin-job-category" className="sr-only">
        תחום
      </label>
      <select
        id="admin-job-category"
        name="category"
        defaultValue={filters.category ?? ""}
        className={CHIP_CLASS}
      >
        <option value="">כל התחומים</option>
        {categories.map((category) => (
          <option key={category.slug} value={category.slug}>
            {category.nameHe}
          </option>
        ))}
      </select>

      <label htmlFor="admin-job-city" className="sr-only">
        עיר
      </label>
      <select
        id="admin-job-city"
        name="city"
        defaultValue={filters.city ?? ""}
        className={CHIP_CLASS}
      >
        <option value="">כל הערים</option>
        {cities.map((city) => (
          <option key={city.city} value={city.city}>
            {city.city}
          </option>
        ))}
      </select>

      <label htmlFor="admin-job-status" className="sr-only">
        סטטוס
      </label>
      <select
        id="admin-job-status"
        name="status"
        defaultValue={filters.status ?? ""}
        className={CHIP_CLASS}
      >
        <option value="">סטטוס: הכל</option>
        {ADMIN_JOB_STATUS_FILTERS.map((status) => (
          <option key={status} value={status}>
            {ADMIN_JOB_STATUS_FILTER_LABEL[status]}
          </option>
        ))}
      </select>

      <label htmlFor="admin-job-days" className="sr-only">
        טווח זמן
      </label>
      <select
        id="admin-job-days"
        name="days"
        defaultValue={String(filters.days)}
        className={CHIP_CLASS}
      >
        {ADMIN_RANGE_DAYS.map((days) => (
          <option key={days} value={days}>
            {ADMIN_RANGE_LABEL[days]}
          </option>
        ))}
      </select>

      <button
        type="submit"
        className="rounded-xl bg-admin px-5 py-2.5 text-sm font-semibold text-white hover:bg-admin-strong"
      >
        סנן
      </button>
    </form>
  );
}
