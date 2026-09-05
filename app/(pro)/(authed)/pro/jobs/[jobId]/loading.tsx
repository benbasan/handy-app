import { PageSkeleton, SkeletonCard } from "@/components/ui/Skeleton";

/**
 * Six parallel reads — the job, the contact, the live position, the price
 * updates, the threads and the pro's own profile.
 */
export default function Loading() {
  return (
    <PageSkeleton>
      <SkeletonCard lines={4} />
      <SkeletonCard lines={3} />
    </PageSkeleton>
  );
}
