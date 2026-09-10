import {
  PageSkeleton,
  SkeletonCard,
  SkeletonRows,
} from "@/components/ui/Skeleton";

/**
 * האזור האישי — the customer's own calls, plus their saved pros and addresses.
 *
 * Permitted here because nothing in this segment or below it calls
 * `notFound()` — see tests/streamingStatus.test.ts, which is what stops a
 * skeleton turning one of this app's 404s into a 200.
 */
export default function Loading() {
  return (
    <PageSkeleton>
      <SkeletonRows count={3} />
      <SkeletonCard lines={2} />
    </PageSkeleton>
  );
}
