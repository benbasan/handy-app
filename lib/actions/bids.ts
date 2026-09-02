"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { BidFormState, SelectBidState } from "@/lib/actions/state";
import { CUSTOMER_ROUTES, PRO_ROUTES } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/supabase/session";
import {
  selectBidSchema,
  submitBidSchema,
  updateBidSchema,
} from "@/lib/validation/bids";
import type { z } from "zod";

/**
 * The write paths for bidding — product-spec.md 3.3 and 4.4.
 *
 * Everything with a ₪ in front of it is decided in the database, not here:
 *
 *  * The 45-minute deadline is a column default and a trigger. This file never
 *    sends an `expires_at`, and the pro holds no INSERT grant on the column,
 *    so it could not send a useful one.
 *  * The 12% commission is arithmetic on the price, shown to the pro before
 *    they send. It is never a field, here or in the form.
 *  * `select_bid()` is what fixes a job's price. It re-checks the caller, the
 *    job's status and the bid's deadline inside the database, and locks every
 *    rival in the same statement — the customer holds no grant on
 *    `jobs.selected_bid_id` at all.
 */

function optional(value: FormDataEntryValue | null): string | undefined {
  const text = typeof value === "string" ? value.trim() : "";
  return text === "" ? undefined : text;
}

function fieldErrorsOf(error: z.ZodError): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    fieldErrors[key] ??= issue.message;
  }
  return fieldErrors;
}

const INVALID: BidFormState = {
  error: "יש לתקן את השדות המסומנים לפני שליחת ההצעה.",
};

/**
 * Submit an offer — design/screens/pro-2.3-submit-bid.png.
 *
 * The insert carries only what a pro is entitled to say: job, self, price, ETA
 * and a note. Whether they may say it at all about *this* job is the insert
 * policy's question, and it asks `can_bid_on_job()` — the same verified,
 * accepting, inside-both-radii test the feed runs. A forged job id in the form
 * therefore fails in the database rather than here.
 */
export async function submitBid(
  _prevState: BidFormState,
  formData: FormData,
): Promise<BidFormState> {
  const user = await requireRole("pro");

  const parsed = submitBidSchema.safeParse({
    jobId: formData.get("jobId"),
    price: formData.get("price"),
    etaMinutes: formData.get("etaMinutes"),
    note: formData.get("note") ?? "",
  });

  if (!parsed.success) {
    return { ...INVALID, fieldErrors: fieldErrorsOf(parsed.error) };
  }

  const supabase = await createClient();

  const { error } = await supabase.from("bids").insert({
    job_id: parsed.data.jobId,
    pro_id: user.id,
    price: parsed.data.price,
    eta_minutes: parsed.data.etaMinutes,
    note: parsed.data.note ?? null,
  });

  if (error) {
    // 23505 is the unique (job_id, pro_id) constraint: one offer per pro per
    // call, and the honest fix is to edit the one already sent.
    if (error.code === "23505") {
      return {
        error: "כבר הגשתם הצעה לקריאה הזו. אפשר לעדכן אותה במסך ״ההצעות שלי״.",
      };
    }

    return {
      error:
        "לא ניתן להגיש הצעה לקריאה הזו: ייתכן שהיא כבר נסגרה, או שהיא מחוץ לרדיוס שהלקוח ביקש.",
    };
  }

  revalidatePath(PRO_ROUTES.jobs);
  revalidatePath(PRO_ROUTES.offers);
  redirect(`${PRO_ROUTES.offers}?sent=1`);
}

/**
 * "עדכן הצעה" — design/screens/pro-2.4-my-bids.png.
 *
 * Re-pricing restarts the 45 minutes, and a settled bid refuses the update
 * outright. Both rules live in the `bids_guard_update` trigger, so they hold
 * for anything that ever writes the table; this action just turns the
 * database's refusal into Hebrew.
 */
export async function updateBid(
  _prevState: BidFormState,
  formData: FormData,
): Promise<BidFormState> {
  await requireRole("pro");

  const parsed = updateBidSchema.safeParse({
    bidId: formData.get("bidId"),
    price: formData.get("price"),
    etaMinutes: formData.get("etaMinutes"),
    note: formData.get("note") ?? "",
  });

  if (!parsed.success) {
    return { ...INVALID, fieldErrors: fieldErrorsOf(parsed.error) };
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from("bids")
    .update({
      price: parsed.data.price,
      eta_minutes: parsed.data.etaMinutes,
      note: parsed.data.note ?? null,
    })
    .eq("id", parsed.data.bidId);

  if (error) {
    return {
      error:
        "לא ניתן לעדכן את ההצעה: היא כבר נסגרה, פג תוקפה, או שהלקוח כבר בחר.",
    };
  }

  revalidatePath(PRO_ROUTES.offers);
  return { saved: true };
}

/**
 * The customer picks one offer — design/screens/customer-2.2-compare-bids.png.
 *
 * Nothing about the decision is computed here. `select_bid()` checks that the
 * caller owns the job, that no bid has been chosen yet and that this one has
 * not lapsed, then marks every rival rejected and moves the job to `assigned`
 * — one statement, so there is no window in which two offers are live.
 */
export async function selectBid(
  _prevState: SelectBidState,
  formData: FormData,
): Promise<SelectBidState> {
  await requireRole("customer");

  const parsed = selectBidSchema.safeParse({ bidId: formData.get("bidId") });
  if (!parsed.success) {
    return { error: "מזהה הצעה לא תקין." };
  }

  const jobId = optional(formData.get("jobId"));

  const supabase = await createClient();
  const { error } = await supabase.rpc("select_bid", {
    p_bid_id: parsed.data.bidId,
  });

  if (error) {
    return {
      error:
        "לא ניתן לבחור את ההצעה הזו: ייתכן שפג תוקפה, או שכבר נבחרה הצעה אחרת לקריאה.",
    };
  }

  if (jobId) {
    revalidatePath(CUSTOMER_ROUTES.offers(jobId));
  }
  revalidatePath(CUSTOMER_ROUTES.account);

  return { selectedBidId: parsed.data.bidId };
}
