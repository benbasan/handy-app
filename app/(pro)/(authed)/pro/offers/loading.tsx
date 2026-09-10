import { PageSkeleton, SkeletonRows } from "@/components/ui/Skeleton";

/**
 * ההצעות שלי — a list of the pro's own bids, each with a clock.
 *
 * Permitted here because nothing in this segment or below it calls
 * `notFound()` — see tests/streamingStatus.test.ts, which is what stops a
 * skeleton turning one of this app's 404s into a 200.
 */
export default function Loading() {
  return (
    <PageSkeleton>
      <SkeletonRows count={4} />
    </PageSkeleton>
  );
}
