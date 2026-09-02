import Link from "next/link";
import { ChatPanel } from "@/components/ui/ChatPanel";
import { ChatThreadList } from "@/components/ui/ChatThreadList";
import { MarkThreadRead } from "@/components/ui/MarkThreadRead";
import { BUTTON_QUIET, Card } from "@/components/ui/primitives";
import { PRO_ROUTES } from "@/lib/routes";
import { listMyThreads, listThreadMessages } from "@/lib/supabase/messages";
import { requireRole } from "@/lib/supabase/session";
import { jobReference } from "@/lib/validation/jobs";

export const metadata = { title: "הודעות — Handy" };

export const dynamic = "force-dynamic";

/**
 * design/screens/pro-5.3-messages.png — הודעות: the open conversation beside
 * the list of the rest.
 *
 * One thread per job the pro bid on, and a thread is keyed (job, pro) — so a
 * pro sees their own conversation with each customer and never the one that
 * customer is having with a competitor on the same call. That separation is in
 * the policies on `messages`, not in this query.
 *
 * The design's third row is a "תמיכת Handy" conversation. There is no support
 * inbox in the data model and inventing one would be a Phase 8 feature built
 * early, so the list carries only real threads.
 */
export default async function ProMessagesPage({
  searchParams,
}: PageProps<"/pro/messages">) {
  const user = await requireRole("pro");

  const [threads, params] = await Promise.all([listMyThreads(), searchParams]);

  const requestedJob = Array.isArray(params.job) ? params.job[0] : params.job;
  const active =
    threads.find((thread) => thread.jobId === requestedJob) ??
    threads[0] ??
    null;

  const messages = active
    ? await listThreadMessages(active.jobId, active.proId)
    : [];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold text-ink sm:text-4xl">הודעות</h1>
        <p className="mt-2 text-muted">
          שיחה אחת לכל קריאה שהגשתם עליה הצעה. הלקוח רואה רק את השיחה איתכם.
        </p>
      </header>

      {threads.length === 0 ? (
        <Card className="p-10 text-center">
          <p className="text-lg font-bold text-ink">אין עדיין שיחות</p>
          <p className="mt-2 text-muted">
            שיחה נפתחת ברגע שאתם מגישים הצעת מחיר על קריאה.
          </p>
          <Link
            href={PRO_ROUTES.jobs}
            className={`${BUTTON_QUIET} mt-5 inline-flex`}
          >
            לפיד הקריאות
          </Link>
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
          <Card className="order-1 min-w-0 p-0">
            {active && (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-5">
                  <div>
                    <h2 className="font-bold text-ink">
                      {active.counterpartName ?? "לקוח"}
                    </h2>
                    <p className="mt-1 text-sm text-muted">
                      <span dir="ltr" className="font-mono">
                        {jobReference(active.jobId)}
                      </span>{" "}
                      · {active.jobDescription.split("\n")[0]}
                    </p>
                  </div>

                  <Link
                    href={PRO_ROUTES.offers}
                    className={`${BUTTON_QUIET} px-4 py-2 text-sm`}
                  >
                    ההצעות שלי
                  </Link>
                </div>

                <MarkThreadRead
                  jobId={active.jobId}
                  proId={active.proId}
                  unreadCount={active.unreadCount}
                />

                <ChatPanel
                  jobId={active.jobId}
                  proId={active.proId}
                  messages={messages}
                  tone="pro"
                />
              </>
            )}
          </Card>

          <Card className="order-2 min-w-0 p-0">
            <h2 className="border-b border-line p-5 font-bold text-ink">
              כל השיחות
            </h2>
            <ChatThreadList
              threads={threads}
              activeJobId={active?.jobId ?? null}
              activeProId={user.id}
              hrefFor={(thread) => `${PRO_ROUTES.messages}?job=${thread.jobId}`}
              tone="pro"
            />
          </Card>
        </div>
      )}
    </div>
  );
}
