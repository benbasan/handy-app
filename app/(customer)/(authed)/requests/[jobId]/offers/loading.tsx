import { PageSkeleton, SkeletonRows } from "@/components/ui/Skeleton";

/**
 * The offers, plus a PostGIS count of the pros in radius.
 */
export default function Loading() {
  return (
    <PageSkeleton>
      <SkeletonRows count={3} />
    </PageSkeleton>
  );
}
