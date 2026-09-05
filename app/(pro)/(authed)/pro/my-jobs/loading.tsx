import {
  PageSkeleton,
  SkeletonRows,
  SkeletonStats,
} from "@/components/ui/Skeleton";

/**
 * Active jobs, completed jobs and the lifetime statistics, in parallel.
 */
export default function Loading() {
  return (
    <PageSkeleton>
      <SkeletonStats count={3} />
      <SkeletonRows count={5} />
    </PageSkeleton>
  );
}
