"use server";

import { revalidatePath } from "next/cache";
import type {
  PriceDecisionState,
  PriceUpdateFormState,
} from "@/lib/actions/state";
import { CUSTOMER_ROUTES, PRO_ROUTES } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/supabase/session";
import {
  decidePriceUpdateSchema,
  requestPriceUpdateSchema,
} from "@/lib/validation/priceUpdates";
import type { z } from "zod";

/**
 * The write paths for עדכון מחיר בשטח — product-spec.md 3.5 and 4.5, the rule
 * the product is built around.
 *
 * Neither action decides anything with a ₪ in front of it:
 *
 *  * `request_price_update()` reads `original_price` from
 *    `job_effective_price()` itself. This file never sends one, and the pro
 *    holds no INSERT grant on the table at all, so it could not send a useful
 *    one.
 *  * `decide_price_update()` is the only way a request leaves `pending`, it
 *    checks the caller owns the job, and it is one-way. No client role holds
 *    an UPDATE grant on `status`.
 *  * The job's price is never written anywhere, because there is no column to
 *    write it to. Refusing a request is not an action that "keeps" the old
 *    price — it is the absence of the only thing that could have moved it.
 *
 * What is validated here is the shape of what the browser sent, so a broken
 * form produces a Hebrew sentence instead of a database error code.
 */

function fieldErrorsOf(error: z.ZodError): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    fieldErrors[key] ??= issue.message;
  }
  return fieldErrors;
}

/**
 * "שלח בקשת אישור ללקוח" — design/screens/pro-3.1-manage-job-price-update.png.
 *
 * The photo is compulsory before the request can go out (product-spec.md 4.5).
 * It is enforced in three places on purpose: the form will not submit without
 * one, the schema below requires a path in this pro's own folder for this job,
 * and the column has been NOT NULL and non-blank since Phase 1.
 */
export async function requestPriceUpdate(
  _prevState: PriceUpdateFormState,
  formData: FormData,
): Promise<PriceUpdateFormState> {
  const user = await requireRole("pro");

  const jobId = String(formData.get("jobId") ?? "");

  const parsed = requestPriceUpdateSchema(user.id, jobId).safeParse({
    jobId,
    newPrice: formData.get("newPrice"),
    photoPath: formData.get("photoPath") ?? "",
    note: formData.get("note") ?? "",
  });

  if (!parsed.success) {
    return {
      error: "יש לתקן את השדות המסומנים לפני שליחת הבקשה.",
      fieldErrors: fieldErrorsOf(parsed.error),
    };
  }

  const supabase = await createClient();

  const { error } = await supabase.rpc("request_price_update", {
    p_job_id: parsed.data.jobId,
    p_new_price: parsed.data.newPrice,
    p_photo_url: parsed.data.photoPath,
    p_note: parsed.data.note ?? undefined,
  });

  if (error) {
    return {
      error:
        "לא ניתן לשלוח את הבקשה: ייתכן שכבר יש בקשה שממתינה לאישור הלקוח, או שהעבודה כבר אינה פעילה.",
    };
  }

  revalidatePath(PRO_ROUTES.manageJob(parsed.data.jobId));
  revalidatePath(PRO_ROUTES.myJobs);
  return { sent: true };
}

/**
 * "מאשר" / "לא מאשר" — the modal state of
 * design/screens/customer-3.1-tracking-chat.png.
 *
 * Two outcomes, one decision, no way back. Refusing is not a softer version of
 * approving: it is what leaves `job_effective_price()` reporting the price
 * that was agreed, for every reader, permanently.
 */
export async function decidePriceUpdate(
  _prevState: PriceDecisionState,
  formData: FormData,
): Promise<PriceDecisionState> {
  await requireRole("customer");

  const parsed = decidePriceUpdateSchema.safeParse({
    priceUpdateId: formData.get("priceUpdateId"),
    decision: formData.get("decision"),
  });

  if (!parsed.success) {
    return { error: "בקשת עדכון המחיר אינה תקינה." };
  }

  const supabase = await createClient();

  const { data, error } = await supabase.rpc("decide_price_update", {
    p_id: parsed.data.priceUpdateId,
    p_approve: parsed.data.decision === "approve",
  });

  if (error) {
    return {
      error:
        "לא ניתן להשיב לבקשה הזו: ייתכן שכבר הוכרעה, או שהיא אינה שייכת לקריאה שלך.",
    };
  }

  const jobId = String(formData.get("jobId") ?? "");
  if (jobId) {
    revalidatePath(CUSTOMER_ROUTES.track(jobId));
    revalidatePath(CUSTOMER_ROUTES.offers(jobId));
  }
  revalidatePath(CUSTOMER_ROUTES.account);

  return { decision: data ?? undefined };
}
