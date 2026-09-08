"use server";

import { revalidatePath } from "next/cache";
import { fieldErrorsOf } from "@/lib/actions/formData";
import type { AnswerOfferState } from "@/lib/actions/state";
import { logExpectedRefusal, logServerError } from "@/lib/observability";
import { PRO_ROUTES } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/supabase/session";
import { answerOfferSchema } from "@/lib/validation/bids";

/**
 * The pro's answer — Phase 10, and the only place in the product where a click
 * charges money.
 *
 * Nothing about either decision is computed here. `accept_job()` checks that
 * the caller is the pro this job was offered to, that they are still verified,
 * and that the two-hour window has not closed; then it assigns the job, closes
 * every rival offer and writes the fee, in one statement. `decline_job()` is
 * the same shape with nothing charged.
 *
 * The fee is never sent from here. It is `job_acceptance_fee()`, read inside
 * the function — the browser shows it, it does not name it.
 */

async function answer(
  formData: FormData,
  rpc: "accept_job" | "decline_job",
  context: string,
): Promise<{ error: string } | { bidId: string }> {
  await requireRole("pro");

  const parsed = answerOfferSchema.safeParse({ bidId: formData.get("bidId") });
  if (!parsed.success) {
    return { error: fieldErrorsOf(parsed.error).bidId ?? "מזהה הצעה לא תקין." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc(rpc, { p_bid_id: parsed.data.bidId });

  if (error) {
    // 22023 is the product answering rather than failing: the window closed,
    // the customer changed their mind, or somebody pressed twice. Every other
    // code is a refusal that should not have reached a rendered button.
    if (error.code === "22023") {
      logExpectedRefusal(context, error, { bidId: parsed.data.bidId });
      return {
        error:
          "העבודה כבר לא ממתינה לתשובה שלך: ייתכן שחלון האישור נסגר או שהלקוח בחר בבעל מקצוע אחר.",
      };
    }

    logServerError(context, error, { bidId: parsed.data.bidId });
    return {
      error:
        "לא הצלחנו לעדכן את התשובה שלך. אם החשבון שלך הושעה או שנדרשים מסמכים מחודשים — צריך לטפל בזה קודם.",
    };
  }

  return { bidId: parsed.data.bidId };
}

/**
 * "אשר וקח את העבודה". The fee is charged inside `accept_job()`, in the same
 * statement that assigns the job — there is no window in which the pro holds
 * the work without having paid for it, or the other way round.
 */
export async function acceptOffer(
  _prevState: AnswerOfferState,
  formData: FormData,
): Promise<AnswerOfferState> {
  const result = await answer(formData, "accept_job", "acceptance.acceptOffer");
  if ("error" in result) return result;

  revalidatePath(PRO_ROUTES.offers);
  revalidatePath(PRO_ROUTES.dashboard);
  revalidatePath(PRO_ROUTES.myJobs);
  revalidatePath(PRO_ROUTES.jobs);

  return { accepted: true };
}

/** "ויתור" — nothing is charged, and the job goes back to the customer. */
export async function declineOffer(
  _prevState: AnswerOfferState,
  formData: FormData,
): Promise<AnswerOfferState> {
  const result = await answer(
    formData,
    "decline_job",
    "acceptance.declineOffer",
  );
  if ("error" in result) return result;

  revalidatePath(PRO_ROUTES.offers);
  revalidatePath(PRO_ROUTES.dashboard);
  revalidatePath(PRO_ROUTES.jobs);

  return { declined: true };
}
