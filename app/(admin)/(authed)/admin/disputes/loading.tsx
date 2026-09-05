import { AdminShell } from "@/components/admin/AdminShell";
import {
  PageSkeleton,
  SkeletonRows,
  SkeletonStats,
} from "@/components/ui/Skeleton";
import { ADMIN_ROUTES } from "@/lib/routes";

/**
 * admin_disputes() beside admin_trust_metrics(), which averages decision
 * times across every case ever opened.
 *
 * The admin group's layout renders no chrome of its own — each screen draws
 * its own AdminShell — so this one does too, or the header would vanish for
 * as long as the page takes.
 */
export default function Loading() {
  return (
    <AdminShell current={ADMIN_ROUTES.disputes}>
      <PageSkeleton>
        <SkeletonStats count={3} />
        <SkeletonRows count={5} />
      </PageSkeleton>
    </AdminShell>
  );
}
