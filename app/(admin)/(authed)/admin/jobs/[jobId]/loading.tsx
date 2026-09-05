import { AdminShell } from "@/components/admin/AdminShell";
import {
  PageSkeleton,
  SkeletonCard,
  SkeletonRows,
} from "@/components/ui/Skeleton";
import { ADMIN_ROUTES } from "@/lib/routes";

/**
 * The heaviest screen in the app: four queries, then four more, then one per
 * offer for the conversations (TECHNICAL_DEBT #22).
 *
 * The admin group's layout renders no chrome of its own — each screen draws
 * its own AdminShell — so this one does too, or the header would vanish for
 * as long as the page takes.
 */
export default function Loading() {
  return (
    <AdminShell current={ADMIN_ROUTES.jobs}>
      <PageSkeleton>
        <SkeletonCard lines={4} />
        <SkeletonRows count={3} />
        <SkeletonCard lines={3} />
      </PageSkeleton>
    </AdminShell>
  );
}
