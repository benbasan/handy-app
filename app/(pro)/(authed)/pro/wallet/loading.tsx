import {
  PageSkeleton,
  SkeletonRows,
  SkeletonStats,
} from "@/components/ui/Skeleton";

/**
 * my_earnings_stats() sums every commission row in the range before the page
 * can draw a single figure.
 */
export default function Loading() {
  return (
    <PageSkeleton>
      <SkeletonStats />
      <SkeletonRows count={5} />
    </PageSkeleton>
  );
}
