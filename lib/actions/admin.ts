"use server";

import { revalidatePath } from "next/cache";
import type {
  AdminDecisionState,
  ProEnforcementActionState,
  ResolveDisputeState,
} from "@/lib/actions/state";
import { ADMIN_ROUTES } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/supabase/session";
import { proEnforcementSchema } from "@/lib/validation/admin";
import { resolveDisputeSchema } from "@/lib/validation/disputes";
import { setVerificationSchema } from "@/lib/validation/pros";

/**
 * אישור בעלי מקצוע — design/screens/admin-7.2-pro-approvals.png, and since
 * Phase 7 also the השעיה half of the enforcement tools in product-spec.md 5.4.
 * It arrived in Phase 3 as a temporary desk so the pro flow could be walked
 * end to end; nothing about it needed to change, which is the point.
 *
 * `requireRole("admin")` here is the courteous half. The half that matters is
 * `set_pro_verification()`, which checks `is_admin()` inside the database:
 * no client role holds an UPDATE grant on `pro_profiles.verification_status`
 * at all, so this action has no privileged path to offer even if the layout
 * gate above it were removed.
 */
export async function decideProVerification(
  _prevState: AdminDecisionState,
  formData: FormData,
): Promise<AdminDecisionState> {
  await requireRole("admin");

  const parsed = setVerificationSchema.safeParse({
    proId: formData.get("proId"),
    status: formData.get("status"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "קלט לא תקין" };
  }

  const supabase = await createClient();

  const { data, error } = await supabase.rpc("set_pro_verification", {
    p_pro_id: parsed.data.proId,
    p_status: parsed.data.status,
  });

  if (error) {
    return { error: "עדכון הסטטוס נכשל. רעננו את הדף ונסו שוב." };
  }

  revalidatePath(ADMIN_ROUTES.pros);
  return { decidedProId: parsed.data.proId, decidedStatus: data ?? undefined };
}

/**
 * "הכרעה וזיכוי" — design/screens/admin-7.4-disputes-control.png.
 *
 * `requireRole("admin")` is again the courteous half. `resolve_dispute()`
 * checks `is_admin()` inside the database, and `disputes` has never held an
 * UPDATE grant for any client role — so neither side of a job can close their
 * own case or write themselves a credit, whatever they post at this action.
 */
export async function resolveDispute(
  _prevState: ResolveDisputeState,
  formData: FormData,
): Promise<ResolveDisputeState> {
  await requireRole("admin");

  const parsed = resolveDisputeSchema.safeParse({
    disputeId: formData.get("disputeId"),
    decision: formData.get("decision"),
    note: formData.get("note"),
    creditAmount: formData.get("creditAmount"),
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0];
      if (typeof field === "string" && !fieldErrors[field]) {
        fieldErrors[field] = issue.message;
      }
    }
    return {
      error: parsed.error.issues[0]?.message ?? "הטופס אינו תקין.",
      fieldErrors,
    };
  }

  const supabase = await createClient();

  const { data, error } = await supabase.rpc("resolve_dispute", {
    p_id: parsed.data.disputeId,
    p_status: parsed.data.decision,
    p_note: parsed.data.note,
    p_credit_amount: parsed.data.creditAmount,
  });

  if (error) {
    return {
      error: "ההכרעה לא נשמרה: ייתכן שהמחלוקת כבר הוכרעה. רעננו את הדף.",
    };
  }

  revalidatePath(ADMIN_ROUTES.disputes);
  revalidatePath(ADMIN_ROUTES.home);
  return { decision: data ?? parsed.data.decision };
}

/**
 * כלי אכיפה — product-spec.md 5.4, minus the two that already had a home:
 * suspension is `decideProVerification` above, and the customer's credit is
 * part of the dispute's own decision.
 *
 * Blocking field price updates is not a hidden button: the flag is checked
 * inside `request_price_update()`, the one function that can write the table.
 * Demanding fresh documents puts the pro back to `pending`, which
 * `is_verified_pro()` answers false to — so it actually stops them taking new
 * work rather than displaying a warning.
 */
export async function applyProEnforcement(
  _prevState: ProEnforcementActionState,
  formData: FormData,
): Promise<ProEnforcementActionState> {
  await requireRole("admin");

  const parsed = proEnforcementSchema.safeParse({
    proId: formData.get("proId"),
    action: formData.get("action"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "קלט לא תקין" };
  }

  const supabase = await createClient();

  const { data, error } = await supabase.rpc("set_pro_enforcement", {
    p_pro_id: parsed.data.proId,
    p_action: parsed.data.action,
  });

  if (error) {
    return { error: "הפעולה נכשלה. רעננו את הדף ונסו שוב." };
  }

  revalidatePath(ADMIN_ROUTES.disputes);
  revalidatePath(ADMIN_ROUTES.pros);
  return { applied: data ?? parsed.data.action };
}
