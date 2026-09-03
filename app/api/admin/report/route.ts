import { listAdminJobs } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/supabase/session";
import {
  ADMIN_JOB_STATE_LABEL,
  adminJobFiltersSchema,
} from "@/lib/validation/admin";
import { jobReference } from "@/lib/validation/jobs";

/**
 * "יצוא דוח" — the button in the admin header on all four
 * design/screens/admin-*.png.
 *
 * The second route handler in the app, and for the reason
 * docs/architecture.md section 2 reserves `/api` for: what comes back is a
 * file and a `Content-Disposition`, not a re-render. It exports exactly what
 * the jobs table is showing, filters and all, so the spreadsheet and the
 * screen can never be two different questions.
 *
 * The role check here is real rather than courteous: a route handler sits
 * outside the `(authed)` layout, so `requireRole()` never runs for it. The
 * database is still the thing that decides — `admin_jobs()` asks `is_admin()`
 * itself and raises for anybody else, which would arrive as an empty file —
 * but an empty CSV is a confusing way to say 403.
 */
export const runtime = "nodejs";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("unauthorized", { status: 401 });
  if (user.role !== "admin") return new Response("forbidden", { status: 403 });

  const params = new URL(request.url).searchParams;
  const filters = adminJobFiltersSchema.parse({
    search: params.get("search") ?? undefined,
    status: params.get("status") ?? undefined,
    category: params.get("category") ?? undefined,
    city: params.get("city") ?? undefined,
    days: params.get("days") ?? undefined,
  });

  const jobs = await listAdminJobs(filters);

  const rows = [
    [
      "קריאה",
      "תחום",
      "עיר",
      "כתובת",
      "הצעות",
      "סטטוס",
      "סכום",
      "לקוח",
      "בעל מקצוע",
      "נפתחה",
    ],
    ...jobs.map((job) => [
      jobReference(job.jobId),
      job.categoryName,
      job.city ?? "",
      job.addressText,
      String(job.bidsCount),
      ADMIN_JOB_STATE_LABEL[job.state],
      job.amount === null ? "" : String(job.amount),
      job.customerName ?? "",
      job.proName ?? "",
      job.createdAt,
    ]),
  ];

  // A BOM, because the audience for this file opens it in Excel on Windows and
  // Excel reads a BOM-less UTF-8 CSV as Latin-1 — which turns every Hebrew
  // column heading into mojibake.
  const csv = "﻿" + rows.map((row) => row.map(csvCell).join(",")).join("\r\n");

  const stamp = new Date().toISOString().slice(0, 10);

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="handy-jobs-${stamp}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}

/**
 * One CSV cell. Always quoted and always with inner quotes doubled: a job
 * description or an address can carry a comma, a quote or a newline, and a
 * cell that is only quoted "when it looks like it needs it" is a bug waiting
 * for the first address with a comma in it.
 */
function csvCell(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}
