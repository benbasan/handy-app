"use client";

import { useActionState, useState } from "react";
import { BUTTON_QUIET } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/Toast";
import { dismissJob } from "@/lib/actions/pros";
import { PASS_REASONS, PASS_REASON_LABEL } from "@/lib/validation/pros";

/**
 * "לא מתאים לי" — the one press in the feed that changes a row and leaves the
 * screen looking almost the same.
 *
 * `dismissJob` writes a `job_dismissals` row and revalidates, so the card
 * disappears. That is correct and it is also indistinguishable from a card that
 * expired, or from a mis-tap on the card below it — which is why this is the
 * first thing wired to the toast.
 *
 * A client component around the button rather than around the card: FeedJobCard
 * renders a signed Storage URL and stays on the server.
 *
 * **No undo yet, and that is a scope line rather than a limitation.**
 * `job_dismissals` has carried `delete` for `authenticated` and a "pro deletes
 * own" policy since Phase 3, so undo needs no migration — only an
 * `undismissJob` action. Phase 13.5 deliberately changes nothing under
 * `lib/actions/`, which is what lets the whole phase be reviewed as presentation.
 */
export function DismissJobButton({ jobId }: { jobId: string }) {
  const toast = useToast();
  const [asking, setAsking] = useState(false);

  // Phase 16: hiding a call asks why — optionally, one tap either way. The
  // reason is the only data that will ever let matching be smarter than a
  // radius, and it reaches nobody but Handy's team.
  const [, formAction, pending] = useActionState(
    async (_prev: null, data: FormData) => {
      data.set("jobId", jobId);
      await dismissJob(data);
      toast("הקריאה הוסתרה מהפיד שלך");
      return null;
    },
    null,
  );

  if (!asking) {
    return (
      <button
        type="button"
        onClick={() => setAsking(true)}
        className={`${BUTTON_QUIET} w-full`}
      >
        לא מתאים לי
      </button>
    );
  }

  return (
    <form action={formAction} className="space-y-2">
      <p className="text-xs font-semibold text-muted">למה? (לא חובה)</p>
      <div className="flex flex-wrap gap-2">
        {PASS_REASONS.map((reason) => (
          <button
            key={reason}
            type="submit"
            name="reason"
            value={reason}
            disabled={pending}
            className="inline-flex min-h-11 items-center rounded-full border border-line px-3 text-xs font-semibold text-ink hover:border-pro disabled:opacity-60"
          >
            {PASS_REASON_LABEL[reason]}
          </button>
        ))}
      </div>
      <button
        type="submit"
        disabled={pending}
        className="text-xs font-semibold text-muted underline underline-offset-2"
      >
        {pending ? "מסתירים…" : "הסתרה בלי סיבה"}
      </button>
    </form>
  );
}
