"use server";

import { logExpectedRefusal, logServerError } from "@/lib/observability";
import { absoluteUrl } from "@/lib/seo";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/supabase/session";
import { z } from "zod";

export type ReceiptShareState = {
  error?: string;
  link?: string;
  expiresAt?: string;
  revoked?: boolean;
};

const jobIdSchema = z.uuid({ error: "מזהה קריאה לא תקין" });

/**
 * "שליחת הקבלה בוואטסאפ" (Phase 17) — a seven-day link, decided with the user
 * on 15.9.2026. The token comes back once, from the database, and only its
 * hash is kept; this action turns it into a URL and never logs it.
 */
export async function createReceiptShareLink(
  _prev: ReceiptShareState,
  formData: FormData,
): Promise<ReceiptShareState> {
  await requireRole("customer");
  const parsed = jobIdSchema.safeParse(formData.get("jobId"));
  if (!parsed.success) return { error: "מזהה קריאה לא תקין." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_receipt_share_link", {
    p_job_id: parsed.data,
  });
  const row = data?.[0];

  if (error || !row) {
    const record =
      error?.code === "22023" ? logExpectedRefusal : logServerError;
    record("receiptShare.create", error ?? new Error("no row"), {
      jobId: parsed.data,
    });
    return { error: "לא הצלחנו ליצור קישור לקבלה. נסו שוב בעוד רגע." };
  }

  return { link: absoluteUrl(`/r/${row.token}`), expiresAt: row.expires_at };
}

export async function revokeReceiptShareLinks(
  _prev: ReceiptShareState,
  formData: FormData,
): Promise<ReceiptShareState> {
  await requireRole("customer");
  const parsed = jobIdSchema.safeParse(formData.get("jobId"));
  if (!parsed.success) return { error: "מזהה קריאה לא תקין." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("revoke_receipt_share_links", {
    p_job_id: parsed.data,
  });
  if (error) {
    logServerError("receiptShare.revoke", error, { jobId: parsed.data });
    return { error: "לא הצלחנו לבטל את הקישורים. נסו שוב בעוד רגע." };
  }
  return { revoked: true };
}
