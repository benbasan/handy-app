import { PageSkeleton, SkeletonRows } from "@/components/ui/Skeleton";

/**
 * התראות הלקוח, under /account so PROTECTED_AREAS already covers it.
 *
 * Permitted here because nothing in this segment or below it calls
 * `notFound()` — see tests/streamingStatus.test.ts, which is what stops a
 * skeleton turning one of this app's 404s into a 200.
 */
export default function Loading() {
  return (
    <PageSkeleton>
      <SkeletonRows count={6} />
    </PageSkeleton>
  );
}
