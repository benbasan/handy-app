import { PageSkeleton, SkeletonCard } from "@/components/ui/Skeleton";

/**
 * The receipt, the approved price updates and any open dispute.
 */
export default function Loading() {
  return (
    <PageSkeleton>
      <SkeletonCard lines={5} />
      <SkeletonCard lines={2} />
    </PageSkeleton>
  );
}
