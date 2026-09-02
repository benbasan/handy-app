"use server";

import { revalidatePath } from "next/cache";
import type { AdminDecisionState } from "@/lib/actions/state";
import { ADMIN_ROUTES } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/supabase/session";
import { setVerificationSchema } from "@/lib/validation/pros";

/**
 * The temporary approvals desk — roadmap Phase 3 asks for "a way, even a
 * temporary one, to move a pro to verified" so the whole pro flow can be
 * walked end to end without waiting for the full admin dashboard in Phase 7.
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
