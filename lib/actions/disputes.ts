"use server";

import { revalidatePath } from "next/cache";
import type { OpenDisputeState } from "@/lib/actions/state";
import { CUSTOMER_ROUTES, PRO_ROUTES } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/supabase/session";
import { openDisputeSchema } from "@/lib/validation/disputes";

/**
 * "יש בעיה עם החיוב?" — the one write path into `disputes` a customer or a pro
 * holds, and the only place in the product where they meet the admin.
 *
 * Phase 6 named this moment without building it: a payment method the customer
 * disputes is a dispute, not a button on the summary screen, because Handy is
 * not a party to the payment (business rule 4) and cannot know what happened.
 *
 * Three columns reach the table — job_id, opened_by, reason — because those
 * are the only three the INSERT grant covers since the Phase 7 migration.
 * `status` takes its `open` default and `credit_amount` stays null: what a
 * complaint is worth is `resolve_dispute()`'s answer, never the complainant's.
 *
 * `requireRole` is not used here on purpose — either side of a job may open a
 * case, and which side is asking is decided by the policy on the table
 * (`is_job_owner(job_id) or is_bidding_pro(job_id)`), not by a role name.
 */
export async function openDispute(
  _prevState: OpenDisputeState,
  formData: FormData,
): Promise<OpenDisputeState> {
  const user = await getCurrentUser();
  if (!user) return { error: "צריך להתחבר כדי לפתוח פנייה." };

  const parsed = openDisputeSchema.safeParse({
    jobId: formData.get("jobId"),
    reason: formData.get("reason"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "הטופס אינו תקין." };
  }

  const supabase = await createClient();

  const { error } = await supabase.from("disputes").insert({
    job_id: parsed.data.jobId,
    opened_by: user.id,
    reason: parsed.data.reason,
  });

  if (error) {
    // 23505 is the partial unique index: one live case per job. Anything else
    // is the policy refusing a job the caller is not a side of.
    return {
      error:
        error.code === "23505"
          ? "כבר קיימת פנייה פתוחה על הקריאה הזו. צוות Handy יחזור אליכם."
          : "לא ניתן לפתוח פנייה על הקריאה הזו.",
    };
  }

  revalidatePath(CUSTOMER_ROUTES.summary(parsed.data.jobId));
  revalidatePath(PRO_ROUTES.myJobs);
  return { opened: true };
}
