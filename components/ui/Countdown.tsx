"use client";

import { useEffect, useState } from "react";
import { ClockIcon } from "@/components/ui/icons";
import { minutesLeft, timeLeftLabel } from "@/lib/validation/bids";

/**
 * A deadline that visibly runs out.
 *
 * **This reverses a deliberate decision, and only half of it.** The comment
 * this replaced (on OfferAnswerCard) argued that a countdown must not tick
 * because "a countdown that runs in the browser drifts from the database the
 * moment a tab is backgrounded, and the only clock that decides anything is the
 * one inside `accept_job()`". The second half of that is still true and nothing
 * here touches it: `accept_job()` re-reads `accept_deadline` itself and refuses
 * a late press whatever this element says.
 *
 * The first half is what does not hold. This does not *run* a clock — it
 * recomputes from the absolute timestamp the database wrote, on an interval, so
 * a backgrounded tab does not drift; it simply stops recomputing and catches up
 * on the next tick. The failure it was written to prevent is a timer seeded
 * once with a duration, which is a different thing.
 *
 * What the frozen version cost: on the pro's acceptance card — two hours, 35 ₪,
 * and the one press in this product that takes money — "עוד שעה ו-12 דק׳" was a
 * string rendered at request time that then sat there unchanged for as long as
 * the tab stayed open. A pro who left the page open over lunch came back to a
 * number that was an hour wrong in the reassuring direction.
 *
 * The server value renders first and is what a crawler and a no-JS reader see;
 * the interval only takes over after hydration, so there is no mismatch.
 */
export function Countdown({
  deadline,
  /** Minutes below which the deadline is drawn as urgent. */
  urgentBelow = 30,
  className = "",
}: {
  deadline: string;
  urgentBelow?: number;
  className?: string;
}) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    // Every 15s rather than every second: the label's smallest unit is a
    // minute, so a per-second tick would re-render sixty times to change the
    // text once — and 15s bounds how stale a minute boundary can look.
    const tick = () => setNow(Date.now());
    tick();
    const timer = window.setInterval(tick, 15_000);
    return () => window.clearInterval(timer);
  }, []);

  // `undefined` on the server and on the first client render, which is what
  // makes both produce the same markup; the helpers default to Date.now().
  const at = now ?? undefined;
  const left = minutesLeft(deadline, at);
  const urgent = left <= urgentBelow;

  return (
    <span
      /* The server renders with the server's clock and the first client render
         with the browser's. They agree to the second and can still straddle a
         minute boundary, which React reports as a text mismatch — this is the
         documented answer for a timestamp, and it suppresses exactly one text
         node rather than a subtree. */
      suppressHydrationWarning
      className={`inline-flex items-center gap-1.5 font-semibold ${
        left <= 0 ? "text-muted" : urgent ? "text-alert" : "text-ink"
      } ${className}`}
    >
      <ClockIcon className="size-4 shrink-0" />
      {timeLeftLabel(deadline, at)}
    </span>
  );
}
