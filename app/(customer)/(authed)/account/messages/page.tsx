import Link from "next/link";
import { ChatPanel } from "@/components/ui/ChatPanel";
import { ChatThreadList } from "@/components/ui/ChatThreadList";
import { MessageIcon } from "@/components/ui/icons";
import { MarkThreadRead } from "@/components/ui/MarkThreadRead";
import {
  BUTTON_COMPACT,
  BUTTON_QUIET,
  Card,
  EmptyState,
  PAGE_LEAD,
  PAGE_TITLE,
} from "@/components/ui/primitives";
import { CUSTOMER_ROUTES } from "@/lib/routes";
import { listMyThreads, listThreadMessages } from "@/lib/supabase/messages";
import { requireRole } from "@/lib/supabase/session";
import { jobReference } from "@/lib/validation/jobs";

export const metadata = { title: "הודעות — Handy" };

export const dynamic = "force-dynamic";

/**
 * The customer's inbox across every call (Phase 17).
 *
 * A pro has had /pro/messages since Phase 4; a customer could only reach a
 * conversation from inside the call it belonged to, so "which pro was it who
 * said they could come tonight?" meant opening calls one by one. The threads
 * come from `my_message_threads()`, the same reader the pro's inbox uses, and
 * a thread is still (job, pro): one conversation per offer, and no pro reads
 * another's.
 */
export default async function CustomerMessagesPage({
  searchParams,
}: PageProps<"/account/messages">) {
  await requireRole("customer");

  const [threads, params] = await Promise.all([listMyThreads(), searchParams]);

  const first = (value: string | string[] | undefined) =>
    Array.isArray(value) ? value[0] : value;
  const requestedJob = first(params.job);
  const requestedPro = first(params.pro);

  const active =
    threads.find(
      (thread) =>
        thread.jobId === requestedJob &&
        (!requestedPro || thread.proId === requestedPro),
    ) ??
    threads[0] ??
    null;

  const messages = active
    ? await listThreadMessages(active.jobId, active.proId)
    : [];

  return (
    <div className="space-y-6">
      <header>
        <h1 className={PAGE_TITLE}>הודעות</h1>
        <p className={PAGE_LEAD}>
          כל השיחות עם בעלי מקצוע, מכל הקריאות שלכם — שיחה אחת לכל הצעה.
        </p>
      </header>

      {threads.length === 0 ? (
        <EmptyState
          icon={MessageIcon}
          title="אין עדיין שיחות"
          body="שיחה נפתחת כשבעל מקצוע מגיש הצעה על קריאה שלכם."
          action={
            <Link href={CUSTOMER_ROUTES.account} className={BUTTON_QUIET}>
              לקריאות שלי
            </Link>
          }
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
          <Card className="order-1 min-w-0 p-0">
            {active && (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-5">
                  <div>
                    <h2 className="font-bold text-ink">
                      {active.counterpartName ?? "בעל מקצוע"}
                    </h2>
                    <p className="mt-1 text-sm text-muted">
                      <span dir="ltr" className="font-mono">
                        {jobReference(active.jobId)}
                      </span>{" "}
                      · {active.jobDescription.split("\n")[0]}
                    </p>
                  </div>

                  <Link
                    href={CUSTOMER_ROUTES.offers(active.jobId)}
                    className={`${BUTTON_QUIET} ${BUTTON_COMPACT}`}
                  >
                    לקריאה
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
                  tone="brand"
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
              activeProId={active?.proId ?? null}
              hrefFor={(thread) =>
                `${CUSTOMER_ROUTES.messages}?job=${thread.jobId}&pro=${thread.proId}`
              }
              tone="brand"
            />
          </Card>
        </div>
      )}
    </div>
  );
}
