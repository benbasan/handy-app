import Link from "next/link";
import { notFound } from "next/navigation";
import { ChatPanel } from "@/components/ui/ChatPanel";
import { ChatThreadList } from "@/components/ui/ChatThreadList";
import { MarkThreadRead } from "@/components/ui/MarkThreadRead";
import { BUTTON_QUIET, Card } from "@/components/ui/primitives";
import { CUSTOMER_ROUTES } from "@/lib/routes";
import { getJob } from "@/lib/supabase/jobs";
import { listMyThreads, listThreadMessages } from "@/lib/supabase/messages";
import { requireRole } from "@/lib/supabase/session";
import { jobReference } from "@/lib/validation/jobs";

export const metadata = { title: "הודעות על הקריאה — Handy" };

export const dynamic = "force-dynamic";

/**
 * The customer's half of the chat — product-spec.md 3.3, "שלח הודעה" beside
 * every offer on design/screens/customer-2.2-compare-bids.png.
 *
 * Scoped to one job, with one thread per pro who made an offer. That is the
 * shape of the data and not a UI choice: a thread is keyed (job, pro), so on a
 * call with three offers the customer is holding three separate conversations
 * and no pro can read any of the others.
 *
 * The design puts this chat in a floating panel on the live-tracking screen,
 * which is Phase 5. Until that screen exists it is a page of its own rather
 * than a panel with nothing to float over.
 */
export default async function CustomerChatPage({
  params,
  searchParams,
}: PageProps<"/requests/[jobId]/chat">) {
  await requireRole("customer");

  const [{ jobId }, query] = await Promise.all([params, searchParams]);

  const job = await getJob(jobId);
  if (!job) notFound();

  const threads = (await listMyThreads()).filter(
    (thread) => thread.jobId === jobId,
  );

  const requestedPro = Array.isArray(query.pro) ? query.pro[0] : query.pro;
  const active =
    threads.find((thread) => thread.proId === requestedPro) ??
    threads[0] ??
    null;

  const messages = active
    ? await listThreadMessages(active.jobId, active.proId)
    : [];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-ink">הודעות</h1>
          <p className="mt-2 text-muted">
            {job.categoryName ?? "קריאה"} ·{" "}
            <span dir="ltr" className="font-mono">
              {jobReference(job.id)}
            </span>{" "}
            · {job.addressText}
          </p>
        </div>

        <Link href={CUSTOMER_ROUTES.offers(jobId)} className={BUTTON_QUIET}>
          חזרה להצעות
        </Link>
      </header>

      {threads.length === 0 ? (
        <Card className="p-10 text-center">
          <p className="text-lg font-bold text-ink">
            אין עדיין עם מי לשוחח על הקריאה הזו
          </p>
          <p className="mt-2 text-muted">
            שיחה נפתחת ברגע שבעל מקצוע מגיש הצעת מחיר. עד אז אין צד שני.
          </p>
        </Card>
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
                      {active.jobDescription.split("\n")[0]}
                    </p>
                  </div>
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
              בעלי המקצוע שהציעו
            </h2>
            <ChatThreadList
              threads={threads}
              activeJobId={active?.jobId ?? null}
              activeProId={active?.proId ?? null}
              hrefFor={(thread) =>
                `${CUSTOMER_ROUTES.chat(jobId)}?pro=${thread.proId}`
              }
              tone="brand"
            />
          </Card>
        </div>
      )}
    </div>
  );
}
