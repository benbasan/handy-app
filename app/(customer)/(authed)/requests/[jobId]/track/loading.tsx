import { PageSkeleton, SkeletonCard } from "@/components/ui/Skeleton";

/**
 * Four parallel reads behind a map: the contact, the last known position,
 * the price updates and the thread.
 */
export default function Loading() {
  return (
    <PageSkeleton>
      <SkeletonCard lines={2} />
      <SkeletonCard lines={4} />
    </PageSkeleton>
  );
}
