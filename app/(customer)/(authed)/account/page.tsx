import Link from "next/link";
import { CurrentUserCard } from "@/components/ui/CurrentUserCard";
import {
  Badge,
  BUTTON_CTA,
  BUTTON_QUIET,
  Card,
} from "@/components/ui/primitives";
import { categoryIcon } from "@/lib/categories";
import { CUSTOMER_ROUTES } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";
import { listMyJobs, type JobSummary } from "@/lib/supabase/jobs";
import { requireRole } from "@/lib/supabase/session";
import {
  PREFERRED_TIME_LABEL,
  jobReference,
  type PreferredTime,
} from "@/lib/validation/jobs";

export const metadata = { title: "האזור האישי — Handy" };

/** design/screens/customer-5.1-my-account.png. */
export default async function CustomerAccountPage() {
  const user = await requireRole("customer");
  const jobs = await listMyJobs();

  const supabase = await createClient();
  const { count: savedProsCount } = await supabase
    .from("saved_pros")
    .select("pro_id", { count: "exact", head: true });

  const memberSince = new Date(user.createdAt).getFullYear();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <header>
          <h1 className="text-3xl font-bold text-ink">
            שלום{user.fullName ? ` ${user.fullName}` : ""}
          </h1>
          <p className="mt-2 text-muted">
            {countLabel(jobs.length, "קריאה אחת", "קריאות")} ·{" "}
            {countLabel(
              savedProsCount ?? 0,
              "בעל מקצוע שמור אחד",
              "בעלי מקצוע שמורים",
            )}{" "}
            · חבר Handy מ-{memberSince}
          </p>
        </header>

        <Link href="/new-request" className={BUTTON_CTA}>
          קריאה חדשה
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <Card className="p-0">
          <h2 className="border-b border-line p-5 text-lg font-bold text-ink sm:p-6">
            הקריאות שלי
          </h2>

          {jobs.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-muted">עוד לא פרסמתם קריאה.</p>
              <Link
                href="/new-request"
                className={`${BUTTON_CTA} mt-4 inline-flex`}
              >
                פרסום קריאה ראשונה
              </Link>
            </div>
          ) : (
            <ul className="divide-y divide-line">
              {jobs.map((job) => (
                <JobRow key={job.id} job={job} />
              ))}
            </ul>
          )}
        </Card>

        <aside className="space-y-6">
          <Card>
            <h2 className="text-lg font-bold text-ink">בעלי המקצוע שלי</h2>
            <p className="mt-2 text-sm text-muted">
              בעלי מקצוע שתשמרו בסיום עבודה יופיעו כאן, להזמנה חוזרת בלחיצה אחת.
            </p>
          </Card>

          <CurrentUserCard user={user} />
        </aside>
      </div>
    </div>
  );
}

/** Hebrew has a singular form for one; "1 קריאות" reads as a bug. */
function countLabel(count: number, one: string, many: string): string {
  return count === 1 ? one : `${count} ${many}`;
}

const STATUS_LABEL: Record<
  string,
  { text: string; tone: "open" | "waiting" | "done" | "neutral" }
> = {
  draft: { text: "טיוטה", tone: "neutral" },
  open: { text: "ממתין להצעות", tone: "waiting" },
  bidding: { text: "מתקבלות הצעות", tone: "waiting" },
  assigned: { text: "נבחר בעל מקצוע", tone: "open" },
  in_progress: { text: "בעבודה", tone: "open" },
  completed: { text: "הושלם", tone: "done" },
  cancelled: { text: "בוטל", tone: "neutral" },
};

function JobRow({ job }: { job: JobSummary }) {
  const status = STATUS_LABEL[job.status] ?? {
    text: job.status,
    tone: "neutral" as const,
  };

  const title = job.description.split("\n")[0]!.slice(0, 80);
  const when = job.preferredTime
    ? (PREFERRED_TIME_LABEL[job.preferredTime as PreferredTime] ??
      job.preferredTime)
    : null;

  return (
    <li className="flex flex-wrap items-center gap-4 p-5 sm:p-6">
      <span
        aria-hidden
        className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-canvas text-2xl"
      >
        {categoryIcon(job.categorySlug ?? "")}
      </span>

      <div className="min-w-48 flex-1">
        <p className="font-bold text-ink">{title}</p>
        <p className="mt-1 text-sm text-muted">
          <span dir="ltr" className="font-mono">
            {jobReference(job.id)}
          </span>
          {job.categoryName ? ` · ${job.categoryName}` : ""}
          {when ? ` · ${when}` : ""}
        </p>
      </div>

      <Badge tone={status.tone}>{status.text}</Badge>

      {/* Where a call lives depends on how far along it is: the offers
          screen while it is collecting bids, the tracking screen once
          somebody is on the way. The publish confirmation is only
          interesting on the way out of the form. */}
      <Link
        href={
          job.status === "draft"
            ? CUSTOMER_ROUTES.published(job.id)
            : job.status === "assigned" || job.status === "in_progress"
              ? CUSTOMER_ROUTES.track(job.id)
              : CUSTOMER_ROUTES.offers(job.id)
        }
        className={`${BUTTON_QUIET} px-4 py-2 text-sm`}
      >
        {job.status === "open" || job.status === "bidding"
          ? "צפייה בהצעות"
          : job.status === "assigned" || job.status === "in_progress"
            ? "מעקב חי"
            : "פתח"}
      </Link>
    </li>
  );
}
