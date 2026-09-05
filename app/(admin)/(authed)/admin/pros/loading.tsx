import { AdminShell } from "@/components/admin/AdminShell";
import { PageSkeleton, SkeletonRows } from "@/components/ui/Skeleton";
import { ADMIN_ROUTES } from "@/lib/routes";

/**
 * The approvals queue, with each pro's documents beside them.
 *
 * The admin group's layout renders no chrome of its own — each screen draws
 * its own AdminShell — so this one does too, or the header would vanish for
 * as long as the page takes.
 */
export default function Loading() {
  return (
    <AdminShell current={ADMIN_ROUTES.pros}>
      <PageSkeleton>
        <SkeletonRows count={6} />
      </PageSkeleton>
    </AdminShell>
  );
}
