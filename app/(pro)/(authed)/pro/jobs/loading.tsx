import { PageSkeleton, SkeletonRows } from "@/components/ui/Skeleton";

/**
 * The feed itself: open_jobs_for_pro(), which reads and tests every open call
 * in the table (TECHNICAL_DEBT #26).
 */
export default function Loading() {
  return (
    <PageSkeleton>
      <SkeletonRows count={6} />
    </PageSkeleton>
  );
}
