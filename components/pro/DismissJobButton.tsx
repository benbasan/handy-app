"use client";

import { useActionState } from "react";
import { BUTTON_QUIET } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/Toast";
import { dismissJob } from "@/lib/actions/pros";

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

  const [, formAction, pending] = useActionState(async () => {
    const data = new FormData();
    data.set("jobId", jobId);
    await dismissJob(data);
    toast("הקריאה הוסתרה מהפיד שלך");
    return null;
  }, null);

  return (
    <form action={formAction}>
      <button
        type="submit"
        disabled={pending}
        className={`${BUTTON_QUIET} w-full`}
      >
        {pending ? "מסתירים…" : "לא מתאים לי"}
      </button>
    </form>
  );
}
