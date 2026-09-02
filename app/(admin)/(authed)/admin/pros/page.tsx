import Link from "next/link";
import { ProApprovalRow } from "@/components/admin/ProApprovalRow";
import { Card } from "@/components/ui/primitives";
import { ADMIN_ROUTES } from "@/lib/routes";
import { listProApplications, signVerificationDocs } from "@/lib/supabase/pros";
import { requireRole } from "@/lib/supabase/session";

export const metadata = { title: "אישור בעלי מקצוע — Handy" };

// A queue other people are pushing into; a cached copy would be a stale one.
export const dynamic = "force-dynamic";

/**
 * design/screens/admin-7.2-pro-approvals.png, in the minimal form Phase 3 asks
 * for: "a way, even a temporary one, to approve a pro", so the whole pro flow
 * can be walked end to end without waiting for Phase 7.
 *
 * The full dashboard — the overview, jobs table, disputes and trust metrics —
 * is Phase 7 and is not started here.
 */
export default async function AdminProApprovalsPage() {
  await requireRole("admin");

  const pending = await listProApplications(["pending"]);
  const decided = await listProApplications([
    "verified",
    "rejected",
    "suspended",
  ]);

  const allDocPaths = [...pending, ...decided].flatMap((application) =>
    application.docs.map((doc) => doc.filePath),
  );
  const signed = await signVerificationDocs(allDocPaths);
  const docUrls = Object.fromEntries(signed);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-ink">אישור בעלי מקצוע</h1>
          <p className="mt-2 text-muted">
            {pending.length === 0
              ? "אין בקשות ממתינות"
              : `${pending.length} בקשות ממתינות`}{" "}
            · יעד מענה: 24 שעות
          </p>
        </div>

        <Link
          href={ADMIN_ROUTES.home}
          className="text-sm font-semibold text-brand hover:underline"
        >
          חזרה ללוח הניהול
        </Link>
      </header>

      {pending.length === 0 ? (
        <Card className="p-10 text-center">
          <p className="text-lg font-bold text-ink">התור ריק</p>
          <p className="mt-2 text-muted">
            כל הבקשות שהוגשו טופלו. בקשה חדשה תופיע כאן ברגע שבעל מקצוע ישלח את
            הפרופיל שלו לאישור.
          </p>
        </Card>
      ) : (
        <ul className="space-y-4">
          {pending.map((application) => (
            <ProApprovalRow
              key={application.userId}
              application={application}
              docUrls={docUrls}
            />
          ))}
        </ul>
      )}

      {decided.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-bold text-ink">בקשות שטופלו</h2>
          <ul className="space-y-4">
            {decided.map((application) => (
              <ProApprovalRow
                key={application.userId}
                application={application}
                docUrls={docUrls}
              />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
