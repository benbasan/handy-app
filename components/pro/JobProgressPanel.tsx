"use client";

import { useActionState } from "react";
import { ErrorText } from "@/components/ui/primitives";
import { EMPTY_JOB_PROGRESS_STATE } from "@/lib/actions/state";
import { markJobInProgress } from "@/lib/actions/tracking";
import {
  JOB_PROGRESS_LABEL_PRO,
  JOB_PROGRESS_STEPS,
  progressIndex,
} from "@/lib/validation/tracking";

/**
 * "התקדמות העבודה" and the big blue button under it —
 * design/screens/pro-3.1-manage-job-price-update.png.
 *
 * Three segments, one of which is filled. The step the pro can actually take
 * is the only button on the panel: `assigned → in_progress`, which is
 * `mark_job_in_progress()` and nothing the browser writes itself, because
 * `jobs.status` lost its column grant in Phase 4.
 *
 * The third segment (הושלם) is drawn because the design draws it, and it has
 * no button: finishing a job creates a commission charge and a receipt, and
 * that is Phase 6's to build. A button that half-works would be worse than the
 * honest line of text under it.
 */
export function JobProgressPanel({
  jobId,
  status,
}: {
  jobId: string;
  status: string;
}) {
  const [state, formAction, pending] = useActionState(
    markJobInProgress,
    EMPTY_JOB_PROGRESS_STATE,
  );

  // The action's answer wins over the prop until the router catches up, so the
  // bar moves the moment the database says it did.
  const current = state.status ?? status;
  const reached = progressIndex(current);

  return (
    <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
      <h2 className="text-lg font-bold text-ink">התקדמות העבודה</h2>

      <ol className="mt-4 grid grid-cols-3 gap-3">
        {JOB_PROGRESS_STEPS.map((step, index) => {
          const done = index <= reached;
          return (
            <li key={step}>
              <span
                aria-hidden
                className={`block h-2 rounded-full ${done ? "bg-cta" : "bg-line"}`}
              />
              <span
                className={`mt-2 block text-center text-sm font-semibold ${
                  done ? "text-cta-strong" : "text-muted"
                }`}
                aria-current={index === reached ? "step" : undefined}
              >
                {JOB_PROGRESS_LABEL_PRO[step]}
              </span>
            </li>
          );
        })}
      </ol>

      {current === "assigned" ? (
        <form action={formAction} className="mt-5">
          <input type="hidden" name="jobId" value={jobId} />
          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-xl bg-brand px-5 py-4 text-lg font-bold text-white transition-colors hover:bg-brand-strong disabled:opacity-60"
          >
            {pending ? "מעדכן…" : "לחץ: הגעתי ללקוח"}
          </button>
        </form>
      ) : (
        <p className="mt-5 rounded-xl bg-canvas p-4 text-center text-sm text-muted">
          העבודה בביצוע. סיום העבודה, גביית התשלום והקבלה נבנים בשלב הבא.
        </p>
      )}

      {state.error && (
        <div className="mt-3">
          <ErrorText>{state.error}</ErrorText>
        </div>
      )}
    </section>
  );
}
