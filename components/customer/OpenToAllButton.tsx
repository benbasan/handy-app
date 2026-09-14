"use client";

import { useActionState } from "react";
import { openJobToAll } from "@/lib/actions/jobs";
import { BUTTON_QUIET, ErrorText } from "@/components/ui/primitives";

/**
 * "פתחו לכל בעלי המקצוע באזור" (Phase 13.8). A directed call waits on its pro
 * until they pass, by the user's decision — and this is what keeps that from
 * leaving a customer stuck in front of somebody who never answers.
 */
export function OpenToAllButton({ jobId }: { jobId: string }) {
  const [state, formAction, pending] = useActionState(openJobToAll, {});

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="jobId" value={jobId} />
      <button
        type="submit"
        disabled={pending}
        className={`${BUTTON_QUIET} w-full`}
      >
        {pending ? "פותחים…" : "פתחו לכל בעלי המקצוע באזור"}
      </button>
      {state.error && <ErrorText>{state.error}</ErrorText>}
    </form>
  );
}
