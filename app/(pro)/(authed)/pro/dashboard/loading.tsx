import {
  PageSkeleton,
  SkeletonCard,
  SkeletonRows,
  SkeletonStats,
} from "@/components/ui/Skeleton";

/**
 * Five parallel reads, one of which is open_jobs_for_pro() — the linear scan
 * of TECHNICAL_DEBT #26, and the slowest query in the product.
 */
export default function Loading() {
  return (
    <PageSkeleton>
      <SkeletonStats count={3} />
      <SkeletonCard lines={2} />
      <SkeletonRows count={4} />
    </PageSkeleton>
  );
}
