import { AdminShell } from "@/components/admin/AdminShell";
import {
  PageSkeleton,
  SkeletonRows,
  SkeletonStats,
} from "@/components/ui/Skeleton";
import { ADMIN_ROUTES } from "@/lib/routes";

/**
 * admin_overview(), admin_jobs_by_day() and admin_category_mix() run in
 * parallel and every one of them aggregates across the whole marketplace.
 *
 * The admin group's layout renders no chrome of its own — each screen draws
 * its own AdminShell — so this one does too, or the header would vanish for
 * as long as the page takes.
 */
export default function Loading() {
  return (
    <AdminShell current={ADMIN_ROUTES.home}>
      <PageSkeleton>
        <SkeletonStats />
        <SkeletonRows count={4} />
      </PageSkeleton>
    </AdminShell>
  );
}
