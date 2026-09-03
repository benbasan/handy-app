import { AdminShell } from "@/components/admin/AdminShell";
import { ProApprovalRow } from "@/components/admin/ProApprovalRow";
import { Card } from "@/components/ui/primitives";
import { ADMIN_ROUTES } from "@/lib/routes";
import { listProApplications, signVerificationDocs } from "@/lib/supabase/pros";
import { requireRole } from "@/lib/supabase/session";

export const metadata = { title: "אישור בעלי מקצוע — Handy Admin" };

// A queue other people are pushing into; a cached copy would be a stale one.
export const dynamic = "force-dynamic";

/**
 * design/screens/admin-7.2-pro-approvals.png — product-spec.md 5.2.
 *
 * The screen itself is unchanged from Phase 3, which is the point: the desk
 * built then to unblock the pro flow was already the real thing, because the
 * decision behind it was already `set_pro_verification()` checking `is_admin()`
 * in the database rather than a column a client could write. Phase 7 gave it
 * the console's frame, the 24-hour target from the design, and the two
 * enforcement flags a reviewer needs to see before deciding.
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
    <AdminShell current={ADMIN_ROUTES.pros}>
      <div className="space-y-6">
        <header>
          <h1 className="text-3xl font-bold text-ink sm:text-4xl">
            אישור בעלי מקצוע
          </h1>
          <p className="mt-2 text-muted">
            {pending.length === 0
              ? "אין בקשות ממתינות"
              : `${pending.length} בקשות ממתינות`}{" "}
            · יעד מענה: 24 שעות
          </p>
        </header>

        {pending.length === 0 ? (
          <Card className="p-10 text-center">
            <p className="text-lg font-bold text-ink">התור ריק</p>
            <p className="mt-2 text-muted">
              כל הבקשות שהוגשו טופלו. בקשה חדשה תופיע כאן ברגע שבעל מקצוע ישלח
              את הפרופיל שלו לאישור.
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
    </AdminShell>
  );
}
