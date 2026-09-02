"use server";

import { revalidatePath } from "next/cache";
import type { SendMessageState } from "@/lib/actions/state";
import { CUSTOMER_ROUTES, PRO_ROUTES } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/supabase/session";
import { sendMessageSchema, threadKeySchema } from "@/lib/validation/messages";

/**
 * The chat's write paths — product-spec.md 3.3 and 4.10.
 *
 * Both roles use the same two actions, because both sides of a thread do the
 * same two things. Who is allowed to write where is not decided here: the
 * insert policies on `messages` require the sender to be the caller *and* the
 * (job, pro) pair to be a real one — a customer may only write to a pro who
 * actually made them an offer, and a pro only inside their own thread.
 */

export async function sendMessage(
  _prevState: SendMessageState,
  formData: FormData,
): Promise<SendMessageState> {
  const user = await getCurrentUser();
  if (!user) return { error: "יש להתחבר כדי לשלוח הודעה." };

  const parsed = sendMessageSchema.safeParse({
    jobId: formData.get("jobId"),
    proId: formData.get("proId"),
    body: formData.get("body") ?? "",
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "ההודעה אינה תקינה." };
  }

  const supabase = await createClient();

  const { error } = await supabase.from("messages").insert({
    job_id: parsed.data.jobId,
    pro_id: parsed.data.proId,
    sender_id: user.id,
    body: parsed.data.body,
  });

  if (error) {
    return { error: "שליחת ההודעה נכשלה. נסו שוב בעוד רגע." };
  }

  revalidateThread(user.role, parsed.data.jobId);
  return { sent: true };
}

/**
 * Mark the other side's messages in one thread as read.
 *
 * `read_at` is the only writable column on `messages`, and the update policy
 * only ever matches rows the caller did *not* send — so this cannot be turned
 * into "mark my own message read for them", which would hide it from the
 * person it was addressed to.
 */
export async function markThreadRead(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;

  const parsed = threadKeySchema.safeParse({
    jobId: formData.get("jobId"),
    proId: formData.get("proId"),
  });
  if (!parsed.success) return;

  const supabase = await createClient();

  await supabase
    .from("messages")
    .update({ read_at: new Date().toISOString() })
    .eq("job_id", parsed.data.jobId)
    .eq("pro_id", parsed.data.proId)
    .is("read_at", null);

  revalidateThread(user.role, parsed.data.jobId);
}

function revalidateThread(role: string, jobId: string): void {
  if (role === "pro") {
    revalidatePath(PRO_ROUTES.messages);
    revalidatePath(PRO_ROUTES.offers);
  } else {
    revalidatePath(CUSTOMER_ROUTES.chat(jobId));
    revalidatePath(CUSTOMER_ROUTES.offers(jobId));
  }
}
