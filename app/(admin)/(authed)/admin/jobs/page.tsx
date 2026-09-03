import Link from "next/link";
import { AdminJobFilters } from "@/components/admin/AdminJobFilters";
import { AdminShell } from "@/components/admin/AdminShell";
import { Card } from "@/components/ui/primitives";
import { ADMIN_ROUTES } from "@/lib/routes";
import { listAdminJobs, listJobCities } from "@/lib/supabase/admin";
import { listCategories } from "@/lib/supabase/jobs";
import { requireRole } from "@/lib/supabase/session";
import {
  ADMIN_JOB_STATE_LABEL,
  ADMIN_JOB_STATE_TONE,
  adminJobFiltersSchema,
} from "@/lib/validation/admin";
import { jobReference } from "@/lib/validation/jobs";
import { formatIls } from "@/lib/validation/priceUpdates";

export const metadata = { title: "קריאות במערכת — Handy Admin" };

export const dynamic = "force-dynamic";

const STATE_CLASS = {
  alert: "text-danger",
  warn: "text-admin",
  ok: "text-cta-strong",
  muted: "text-muted",
} as const;

/**
 * design/screens/admin-7.3-jobs-management.png — product-spec.md 5.3.
 *
 * The סכום column is `job_effective_price()`, the same function the customer
 * and the pro read, which is why a call nobody has been chosen for shows "—"
 * without a special case: there is no price until there is a chosen bid, and
 * this table is not the place to invent one.
 *
 * Every filter arrives from the query string and is re-validated with Zod
 * before it reaches the database function — a category slug is matched against
 * a pattern, a status against the five the table can hold, and a nonsense
 * range falls back to seven days rather than erroring at an operator.
 */
export default async function AdminJobsPage({
  searchParams,
}: PageProps<"/admin/jobs">) {
  await requireRole("admin");

  const params = await searchParams;
  const filters = adminJobFiltersSchema.parse({
    search: first(params.search),
    status: first(params.status),
    category: first(params.category),
    city: first(params.city),
    days: first(params.days),
  });

  const [jobs, cities, categories] = await Promise.all([
    listAdminJobs(filters),
    listJobCities(),
    listCategories(),
  ]);

  return (
    <AdminShell current={ADMIN_ROUTES.jobs}>
      <div className="space-y-6">
        <header>
          <h1 className="text-3xl font-bold text-ink sm:text-4xl">
            קריאות במערכת
          </h1>
          <p className="mt-2 text-muted">
            {jobs.length === 0
              ? "אין קריאות שתואמות את הסינון"
              : `${jobs.length} קריאות`}{" "}
            · הסכום הוא המחיר בפועל של הקריאה, כולל עדכוני מחיר שהלקוח אישר
          </p>
        </header>

        <AdminJobFilters
          filters={filters}
          categories={categories}
          cities={cities}
        />

        {jobs.length === 0 ? (
          <Card className="p-10 text-center">
            <p className="text-lg font-bold text-ink">אין מה להציג</p>
            <p className="mt-2 text-muted">
              אף קריאה לא תואמת את הסינון הנוכחי. נסו טווח זמן רחב יותר.
            </p>
          </Card>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
            <table className="w-full min-w-3xl border-collapse text-sm">
              <thead>
                <tr className="border-b border-line text-muted">
                  <th className="p-4 text-start font-semibold">קריאה</th>
                  <th className="p-4 text-start font-semibold">תחום</th>
                  <th className="p-4 text-start font-semibold">עיר</th>
                  <th className="p-4 text-start font-semibold">הצעות</th>
                  <th className="p-4 text-start font-semibold">סטטוס</th>
                  <th className="p-4 text-start font-semibold">סכום</th>
                  <th className="p-4 text-start font-semibold">פעולה</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => (
                  <tr
                    key={job.jobId}
                    className="border-b border-line last:border-0"
                  >
                    <td className="p-4">
                      <span dir="ltr" className="font-bold text-ink">
                        {jobReference(job.jobId)}
                      </span>
                    </td>
                    <td className="p-4 text-ink">{job.categoryName}</td>
                    <td className="p-4 text-ink">{job.city ?? "—"}</td>
                    <td className="p-4">
                      <span className="ltr-nums text-ink">{job.bidsCount}</span>
                    </td>
                    <td
                      className={`p-4 font-bold ${STATE_CLASS[ADMIN_JOB_STATE_TONE[job.state]]}`}
                    >
                      {ADMIN_JOB_STATE_LABEL[job.state]}
                    </td>
                    <td className="p-4 font-bold text-ink">
                      {job.amount === null ? (
                        "— ₪"
                      ) : (
                        <>
                          <span className="ltr-nums">
                            {formatIls(job.amount)}
                          </span>{" "}
                          ₪
                        </>
                      )}
                    </td>
                    <td className="p-4">
                      <Link
                        href={ADMIN_ROUTES.job(job.jobId)}
                        className="font-semibold text-brand hover:underline"
                      >
                        פתח
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AdminShell>
  );
}

/** A query parameter can legitimately repeat; the filters take the first. */
function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
