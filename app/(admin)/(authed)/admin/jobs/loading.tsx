import { AdminShell } from "@/components/admin/AdminShell";
import { PageSkeleton, SkeletonRows } from "@/components/ui/Skeleton";
import { ADMIN_ROUTES } from "@/lib/routes";

/**
 * The jobs table filters on job_city() and a regexp over the id, neither of
 * which an index can help with (TECHNICAL_DEBT #28).
 *
 * The admin group's layout renders no chrome of its own — each screen draws
 * its own AdminShell — so this one does too, or the header would vanish for
 * as long as the page takes.
 */
export default function Loading() {
  return (
    <AdminShell current={ADMIN_ROUTES.jobs}>
      <PageSkeleton>
        <SkeletonRows count={8} />
      </PageSkeleton>
    </AdminShell>
  );
}
