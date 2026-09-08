"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { fieldErrorsOf, optional } from "@/lib/actions/formData";
import type {
  BidFormState,
  SelectBidState,
  WithdrawSelectionState,
} from "@/lib/actions/state";
import { logExpectedRefusal, logServerError } from "@/lib/observability";
import { CUSTOMER_ROUTES, PRO_ROUTES } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/supabase/session";
import {
  selectBidSchema,
  submitBidSchema,
  updateBidSchema,
  withdrawSelectionSchema,
} from "@/lib/validation/bids";

/**
 * The write paths for bidding — product-spec.md 3.3 and 4.4.
 *
 * Everything with a ₪ in front of it is decided in the database, not here:
 *
 *  * The 45-minute deadline is a column default and a trigger. This file never
 *    sends an `expires_at`, and the pro holds no INSERT grant on the column,
 *    so it could not send a useful one.
 *  * The fee is a flat 35 ₪ shown to the pro before they send, and charged
 *    only if they later accept the job. It is never a field, here or in the
 *    form.
 *  * `select_bid()` offers the job. Since Phase 10 it does not fix the price:
 *    it stamps a two-hour deadline and leaves the rivals alone, because the
 *    pro has not answered yet. `accept_job()` is what assigns — see
 *    lib/actions/acceptance.ts — and the customer holds no grant on
 *    `jobs.selected_bid_id` at all.
 */

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
      logExpectedRefusal("bids.submitBid", error, {
        jobId: parsed.data.jobId,
        proId: user.id,
      });
      return {
        error: "כבר הגשתם הצעה לקריאה הזו. אפשר לעדכן אותה במסך ״ההצעות שלי״.",
      };
    }

    // Everything else is the insert policy refusing — `can_bid_on_job()` said
    // no, and which of its four tests failed is only in the error.
    logServerError("bids.submitBid", error, {
      jobId: parsed.data.jobId,
      proId: user.id,
    });
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
    logServerError("bids.updateBid", error, { bidId: parsed.data.bidId });
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
 * caller owns the job, that no pro has taken it yet and that this offer has
 * not lapsed, then hands it to that pro for two hours. Calling it again on a
 * job nobody has answered moves the offer to somebody else, which is the whole
 * of "אפשר להתחרט" — so the refusal below is about a job already taken, not
 * about a second choice.
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
    // select_bid() is what fixes a job's price, so a refusal here is worth the
    // line even when it is the ordinary "somebody was faster" race.
    logServerError("bids.selectBid", error, {
      bidId: parsed.data.bidId,
      jobId,
    });
    return {
      error:
        "לא ניתן לבחור את ההצעה הזו: ייתכן שפג תוקפה, או שבעל מקצוע אחר כבר לקח את הקריאה.",
    };
  }

  if (jobId) {
    revalidatePath(CUSTOMER_ROUTES.offers(jobId));
  }
  revalidatePath(CUSTOMER_ROUTES.account);

  return { selectedBidId: parsed.data.bidId };
}

/**
 * "בטל בחירה" — the customer takes back an offer nobody has answered.
 *
 * The pro's own bid goes back to the pile rather than dying with the
 * withdrawal: they made an offer, and the customer thinking again about who to
 * give it to is not a reason to throw it away. Whether its own 45 minutes are
 * still running is `withdraw_bid_selection()`'s judgement, not this file's.
 */
export async function withdrawSelection(
  _prevState: WithdrawSelectionState,
  formData: FormData,
): Promise<WithdrawSelectionState> {
  await requireRole("customer");

  const parsed = withdrawSelectionSchema.safeParse({
    jobId: formData.get("jobId"),
  });
  if (!parsed.success) {
    return { error: "מזהה קריאה לא תקין." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("withdraw_bid_selection", {
    p_job_id: parsed.data.jobId,
  });

  if (error) {
    // 22023 here is almost always the race this button exists inside: the pro
    // answered while the customer was deciding to un-ask them.
    if (error.code === "22023") {
      logExpectedRefusal("bids.withdrawSelection", error, {
        jobId: parsed.data.jobId,
      });
      return {
        error:
          "כבר אי אפשר לבטל: בעל המקצוע ענה על ההצעה בזמן שהמסך הזה היה פתוח.",
      };
    }

    logServerError("bids.withdrawSelection", error, {
      jobId: parsed.data.jobId,
    });
    return { error: "לא הצלחנו לבטל את הבחירה. אפשר לנסות שוב." };
  }

  revalidatePath(CUSTOMER_ROUTES.offers(parsed.data.jobId));
  revalidatePath(CUSTOMER_ROUTES.account);

  return { withdrawn: true };
}
