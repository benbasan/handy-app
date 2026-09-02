"use client";

import { useOptimistic, useTransition } from "react";
import { setAcceptingJobs } from "@/lib/actions/pros";

/**
 * "זמין לקריאות" — the switch in the pro header (design/screens/
 * pro-1.1-landing.png and every pro screen after it).
 *
 * It is a real setting, not a UI mood: `accepting_jobs` is one of the three
 * conditions in `pro_serves_job()`, so switching it off empties the feed in
 * the RLS policy rather than in the query. product-spec.md 4.9 promises that
 * turning it off does not harm the pro's rating, and nothing on this path can
 * touch `rating_avg` — a client holds no grant on that column.
 *
 * Optimistic because the switch has to feel like a switch; the server action
 * revalidates the pages that depend on it either way.
 */
export function AvailabilityToggle({ accepting }: { accepting: boolean }) {
  const [pending, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useOptimistic(accepting);

  const on = optimistic;

  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          setOptimistic(!on);
          const formData = new FormData();
          formData.set("accepting", on ? "0" : "1");
          await setAcceptingJobs(formData);
        })
      }
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors ${
        on
          ? "border-cta bg-cta/10 text-cta-strong"
          : "border-line bg-surface text-muted"
      }`}
    >
      <span
        aria-hidden
        className={`relative h-5 w-9 rounded-full transition-colors ${on ? "bg-cta" : "bg-line"}`}
      >
        {/* start-/end- rather than left-/right-: in RTL the "on" knob has to
            travel towards the trailing edge, which is the other way round. */}
        <span
          className={`absolute top-0.5 size-4 rounded-full bg-white transition-all ${
            on ? "end-0.5" : "start-0.5"
          }`}
        />
      </span>
      {on ? "זמין לקריאות" : "לא זמין"}
    </button>
  );
}
