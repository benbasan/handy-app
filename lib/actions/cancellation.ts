"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { fieldErrorsOf } from "@/lib/actions/formData";
import { logExpectedRefusal, logServerError } from "@/lib/observability";
import { ADMIN_ROUTES, CUSTOMER_ROUTES, PRO_ROUTES } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, requireRole } from "@/lib/supabase/session";
import {
  cancelAssignedJobSchema,
  cancelJobSchema,
  rateCustomerSchema,
} from "@/lib/validation/cancellation";

export type CancellationState = {
  error?: string;
  fieldErrors?: Record<string, string>;
  saved?: boolean;
};

/**
 * "ביטול הקריאה" — the customer, before any pro has taken the job (Phase 15).
 * `cancel_job()` decides whether it still can be; this turns its refusal into
 * a sentence.
 */
export async function cancelJob(
  _prev: CancellationState,
  formData: FormData,
): Promise<CancellationState> {
  await requireRole("customer");

  const parsed = cancelJobSchema.safeParse({
    jobId: formData.get("jobId"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) {
    logExpectedRefusal("cancellation.cancelJob.invalid", parsed.error, {});
    return {
      error: "בחרו סיבה לביטול.",
      fieldErrors: fieldErrorsOf(parsed.error),
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_job", {
    p_job_id: parsed.data.jobId,
    p_reason: parsed.data.reason,
  });

  if (error) {
    const context = { jobId: parsed.data.jobId };
    if (error.code === "22023") {
      logExpectedRefusal("cancellation.cancelJob", error, context);
      return {
        error:
          "בעל מקצוע כבר אישר את הקריאה, ולכן אי אפשר לבטל אותה מכאן. כתבו לו בצ׳אט או פנו לתמיכה.",
      };
    }
    logServerError("cancellation.cancelJob", error, context);
    return { error: "הביטול נכשל. נסו שוב בעוד רגע." };
  }

  revalidatePath(CUSTOMER_ROUTES.account);
  revalidatePath(CUSTOMER_ROUTES.offers(parsed.data.jobId));
  return { saved: true };
}

/**
 * "הלקוח ביטל את העבודה" — the pro who took the job, or an admin (Phase 15).
 * The credit and the customer's notification are `cancel_assigned_job()`'s,
 * written in the same statement as the cancellation.
 */
export async function cancelAssignedJob(
  _prev: CancellationState,
  formData: FormData,
): Promise<CancellationState> {
  const user = await getCurrentUser();
  if (user?.role !== "pro" && user?.role !== "admin") {
    return {
      error: "רק בעל המקצוע שלקח את העבודה, או צוות Handy, יכולים לבטל אותה.",
    };
  }

  const parsed = cancelAssignedJobSchema.safeParse({
    jobId: formData.get("jobId"),
  });
  if (!parsed.success) {
    logExpectedRefusal(
      "cancellation.cancelAssignedJob.invalid",
      parsed.error,
      {},
    );
    return { error: "מזהה קריאה לא תקין." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_assigned_job", {
    p_job_id: parsed.data.jobId,
  });

  if (error) {
    const context = { jobId: parsed.data.jobId, role: user.role };
    if (error.code === "22023") {
      logExpectedRefusal("cancellation.cancelAssignedJob", error, context);
      return { error: "העבודה כבר לא פעילה — ייתכן שהיא נסגרה או בוטלה." };
    }
    logServerError("cancellation.cancelAssignedJob", error, context);
    return { error: "הביטול נכשל. נסו שוב בעוד רגע." };
  }

  if (user.role === "admin") {
    revalidatePath(ADMIN_ROUTES.job(parsed.data.jobId));
    return { saved: true };
  }

  revalidatePath(PRO_ROUTES.myJobs);
  redirect(`${PRO_ROUTES.myJobs}?cancelled=1`);
}

/** "דרגו את הלקוח" — private, read only by an admin (Phase 15). */
export async function rateCustomer(
  _prev: CancellationState,
  formData: FormData,
): Promise<CancellationState> {
  await requireRole("pro");

  const parsed = rateCustomerSchema.safeParse({
    jobId: formData.get("jobId"),
    rating: formData.get("rating"),
    comment: formData.get("comment") ?? "",
  });
  if (!parsed.success) {
    logExpectedRefusal("cancellation.rateCustomer.invalid", parsed.error, {});
    return {
      error: "בחרו דירוג בין 1 ל-5.",
      fieldErrors: fieldErrorsOf(parsed.error),
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("rate_customer", {
    p_job_id: parsed.data.jobId,
    p_rating: parsed.data.rating,
    p_comment: parsed.data.comment,
  });

  if (error) {
    const context = { jobId: parsed.data.jobId };
    if (error.code === "23505") {
      logExpectedRefusal("cancellation.rateCustomer", error, context);
      return { saved: true };
    }
    logServerError("cancellation.rateCustomer", error, context);
    return { error: "הדירוג לא נשמר. נסו שוב בעוד רגע." };
  }

  revalidatePath(PRO_ROUTES.myJobs);
  return { saved: true };
}
