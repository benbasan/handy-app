"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type {
  CompleteJobState,
  SaveProState,
  ReviewFormState,
} from "@/lib/actions/state";
import { CUSTOMER_ROUTES, PRO_ROUTES } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/supabase/session";
import {
  completeJobSchema,
  saveProSchema,
  submitReviewSchema,
} from "@/lib/validation/completion";

/**
 * The write paths for סיום עבודה, תשלום, עמלה וקבלה.
 *
 * As with the price-update actions, none of these decides anything with a ₪ in
 * front of it:
 *
 *  * `complete_job()` reads the base from the selected bid and the total from
 *    `job_effective_price()`, and computes the 12% itself. This file sends one
 *    fact — how the pro was paid — because that is the only thing about the
 *    closing the server cannot work out on its own.
 *  * `submit_job_review()` refuses a job that is not finished and is the only
 *    write path into `reviews` at all; the customer's grants were revoked in
 *    the Phase 6 migration.
 *
 * Zod runs in front of each anyway (CLAUDE.md section 3), so a broken form
 * produces a Hebrew sentence rather than a Postgres error code.
 */

/**
 * "סיימתי — עדכן גבייה" — design/screens/pro-3.1-manage-job-price-update.png.
 *
 * Redirects to the history tab on success: the job leaves `my_active_jobs()`
 * the instant it completes, so the screen the pro is standing on stops
 * existing. Sending them to where the job now lives is more honest than
 * re-rendering a 404.
 */
export async function completeJob(
  _prevState: CompleteJobState,
  formData: FormData,
): Promise<CompleteJobState> {
  await requireRole("pro");

  const parsed = completeJobSchema.safeParse({
    jobId: formData.get("jobId"),
    paymentMethod: formData.get("paymentMethod"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "הטופס אינו תקין." };
  }

  const supabase = await createClient();

  const { error } = await supabase.rpc("complete_job", {
    p_job_id: parsed.data.jobId,
    p_payment_method: parsed.data.paymentMethod,
  });

  if (error) {
    return {
      error:
        "לא ניתן לסגור את העבודה: ייתכן שהיא כבר נסגרה, או שהיא אינה משובצת אליך.",
    };
  }

  revalidatePath(PRO_ROUTES.myJobs);
  revalidatePath(PRO_ROUTES.wallet);
  revalidatePath(PRO_ROUTES.dashboard);

  redirect(`${PRO_ROUTES.myJobs}?tab=history`);
}

/**
 * "איך היה השירות?" — design/screens/customer-4.1-summary-receipt-rating.png.
 *
 * Stays on the page: the stars, the receipt and the save-for-next-time card
 * are one screen, and a redirect after rating would take the customer away
 * from the download they came for.
 */
export async function submitJobReview(
  _prevState: ReviewFormState,
  formData: FormData,
): Promise<ReviewFormState> {
  await requireRole("customer");

  const parsed = submitReviewSchema.safeParse({
    jobId: formData.get("jobId"),
    rating: formData.get("rating"),
    comment: formData.get("comment") ?? "",
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "הטופס אינו תקין." };
  }

  const supabase = await createClient();

  const { error } = await supabase.rpc("submit_job_review", {
    p_job_id: parsed.data.jobId,
    p_rating: parsed.data.rating,
    p_comment: parsed.data.comment ?? undefined,
  });

  if (error) {
    return {
      error: "לא ניתן לשמור את הדירוג: ניתן לדרג רק קריאה שלכם שכבר הסתיימה.",
    };
  }

  revalidatePath(CUSTOMER_ROUTES.summary(parsed.data.jobId));

  return { rating: parsed.data.rating };
}

/**
 * "שמור לפעם הבאה" — the dark card on the same screen, and what finally fills
 * the "בעלי המקצוע שלי" panel the account page has been promising since
 * Phase 2.
 *
 * `saved_pros` is Phase 1's table with its own grants and policies, so this is
 * a plain insert under the caller's RLS rather than a definer function: a
 * customer's private list is exactly the kind of row a customer may write.
 * Saving twice is not an error — the primary key already says the pair is
 * unique, and the button is idempotent by design.
 */
export async function saveProForNextTime(
  _prevState: SaveProState,
  formData: FormData,
): Promise<SaveProState> {
  const user = await requireRole("customer");

  const parsed = saveProSchema.safeParse({
    proId: formData.get("proId"),
    jobId: formData.get("jobId"),
  });

  if (!parsed.success) {
    return { error: "לא הצלחנו לשמור את בעל המקצוע." };
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from("saved_pros")
    .upsert(
      { customer_id: user.id, pro_id: parsed.data.proId },
      { onConflict: "customer_id,pro_id", ignoreDuplicates: true },
    );

  if (error) {
    return { error: "לא הצלחנו לשמור את בעל המקצוע. נסו שוב." };
  }

  revalidatePath(CUSTOMER_ROUTES.summary(parsed.data.jobId));
  revalidatePath(CUSTOMER_ROUTES.account);

  return { saved: true };
}
