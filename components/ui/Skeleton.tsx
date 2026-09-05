import { CARD_CLASS } from "@/components/ui/primitives";

/**
 * The shapes a `loading.tsx` is built from.
 *
 * Every screen behind a session in this app is `force-dynamic` and blocks on
 * its own queries — the job dossier runs nine before it emits a byte — so
 * until now a slow one was a white page. These are what sits there instead.
 *
 * Two rules the whole file follows:
 *
 *  * **A skeleton is announced, not just drawn.** A screen of grey rectangles
 *    is nothing at all to a screen reader, and the person who most needs to be
 *    told the page is still working is the one who cannot see it happening.
 *    `PageSkeleton` carries the live region; the pieces below are `aria-hidden`
 *    because they are decoration for it.
 *  * **A skeleton is the shape of the answer, not a spinner.** Blocks stand
 *    where the real content will, so the page does not jump when it arrives.
 *
 * Sizes are in logical properties throughout (CLAUDE.md section 3) — a
 * skeleton mirrors like everything else.
 */

const PULSE = "animate-pulse rounded-lg bg-line/70";

/** One grey bar. `w` is any Tailwind width utility. */
export function SkeletonLine({
  w = "w-full",
  h = "h-4",
}: {
  w?: string;
  h?: string;
}) {
  return <div aria-hidden className={`${PULSE} ${h} ${w}`} />;
}

/** A card-shaped block with a few bars in it — the repeating unit of most screens. */
export function SkeletonCard({ lines = 3 }: { lines?: number }) {
  return (
    <div aria-hidden className={CARD_CLASS}>
      <div className="space-y-3">
        <SkeletonLine w="w-1/3" h="h-5" />
        {Array.from({ length: lines }, (_, index) => (
          <SkeletonLine
            key={index}
            w={index === lines - 1 ? "w-2/3" : "w-full"}
          />
        ))}
      </div>
    </div>
  );
}

/** The four-up figure strip at the top of the admin screens and the wallet. */
export function SkeletonStats({ count = 4 }: { count?: number }) {
  return (
    <div
      aria-hidden
      className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[repeat(auto-fit,minmax(12rem,1fr))]"
    >
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className={CARD_CLASS}>
          <div className="space-y-3">
            <SkeletonLine w="w-2/3" h="h-3" />
            <SkeletonLine w="w-1/2" h="h-8" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** A list or table of rows, as the jobs table and both feeds draw one. */
export function SkeletonRows({ count = 5 }: { count?: number }) {
  return (
    <div aria-hidden className={CARD_CLASS}>
      <div className="space-y-4">
        {Array.from({ length: count }, (_, index) => (
          <div key={index} className="flex items-center gap-4">
            <SkeletonLine w="w-10" h="h-10" />
            <div className="flex-1 space-y-2">
              <SkeletonLine w="w-1/2" />
              <SkeletonLine w="w-1/4" h="h-3" />
            </div>
            <SkeletonLine w="w-20" h="h-8" />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * The frame every loading screen uses: the heading block, then whatever the
 * screen is made of, wrapped in the one live region that speaks for all of it.
 *
 * `aria-busy` rather than a visually hidden "טוען" paragraph, so the
 * announcement stops on its own when the content swaps in.
 */
export function PageSkeleton({ children }: { children: React.ReactNode }) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-live="polite"
      className="space-y-6"
    >
      <span className="sr-only">הדף נטען</span>
      <div className="space-y-3">
        <SkeletonLine w="w-1/3" h="h-9" />
        <SkeletonLine w="w-1/2" h="h-4" />
      </div>
      {children}
    </div>
  );
}
