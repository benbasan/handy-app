import { createClient } from "./server";
import { isDisputeStatus, type DisputeStatus } from "@/lib/validation/disputes";

/**
 * Read side of מחלוקת, for the two people a dispute is about.
 *
 * Deliberately not in lib/supabase/admin.ts, even though the admin console
 * reads it too: `disputes` is one of the tables both sides hold a policy on
 * (`disputes: participants read`), so the customer's summary screen and the
 * pro's history read exactly these rows through exactly this function, and
 * the console gets no privileged projection of them. The admin's *queue* —
 * every case across every job, with both parties named — is the aggregate,
 * and that one lives in admin.ts behind `is_admin()`.
 */

/**
 * The disputes on one call, for the dossier screen and for the two sides'
 * own screens. Plain rows: `disputes: participants read` and
 * `disputes: admin reads all` are what scope this, and restating either in the
 * query would suggest the query is the thing keeping other people out.
 */
export type JobDispute = {
  disputeId: string;
  reason: string;
  status: DisputeStatus;
  creditAmount: number | null;
  resolutionNote: string | null;
  openedById: string;
  createdAt: string;
  resolvedAt: string | null;
};

export async function listJobDisputes(jobId: string): Promise<JobDispute[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("disputes")
    .select(
      "id, reason, status, credit_amount, resolution_note, opened_by, created_at, resolved_at",
    )
    .eq("job_id", jobId)
    .order("created_at", { ascending: false });

  return (data ?? []).map((row) => ({
    disputeId: row.id,
    reason: row.reason,
    status: isDisputeStatus(row.status) ? row.status : "open",
    creditAmount: row.credit_amount === null ? null : Number(row.credit_amount),
    resolutionNote: row.resolution_note,
    openedById: row.opened_by,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at,
  }));
}
