import { renderReceiptPdf } from "@/lib/pdf/receipt";
import { logServerError } from "@/lib/observability";
import { createClient } from "@/lib/supabase/server";
import type { JobReceipt } from "@/lib/supabase/completion";
import { receiptLines } from "@/lib/validation/completion";
import { jobReference } from "@/lib/validation/jobs";

/**
 * /r/<token> — a receipt somebody was sent (Phase 17).
 *
 * No session, by the user's decision: a link a customer created, valid seven
 * days, revocable. `shared_receipt()` is what decides — it returns the
 * customer's version of the document (no fee, no net) for a live token and
 * nothing at all otherwise, so an unknown, expired and revoked link all answer
 * the same 404 and a guesser learns nothing about which it was.
 *
 * Not under /api, and outside every protected area in lib/routes.ts, because
 * this is the one URL in the product meant to be pasted into WhatsApp.
 */
export const runtime = "nodejs";

export const dynamic = "force-dynamic";

const TOKEN = /^[0-9a-f]{64}$/;

export async function GET(
  _request: Request,
  { params }: RouteContext<"/r/[token]">,
) {
  const { token } = await params;
  if (!TOKEN.test(token)) return notFound();

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("shared_receipt", {
    p_token: token,
  });
  if (error) {
    // Identifiers only (lib/observability.ts): never the token itself.
    logServerError("receiptShare.open", error, {});
    return notFound();
  }
  const row = data?.[0];
  if (!row) return notFound();

  const receipt: JobReceipt = {
    jobId: row.job_id,
    description: row.description,
    addressText: row.address_text,
    categoryName: row.category_name_he,
    customerName: row.customer_name,
    proId: "",
    proName: row.pro_name,
    paymentMethod: row.payment_method as JobReceipt["paymentMethod"],
    basePrice: Number(row.base_price),
    totalPrice: Number(row.total_price),
    feeAmount: null,
    netAmount: null,
    chargedAt: row.charged_at,
    completedAt: row.completed_at,
    rating: null,
    reviewComment: null,
  };

  const approved = (
    (row.approved_updates as { original_price: number; new_price: number }[]) ??
    []
  ).map((update) => ({
    originalPrice: Number(update.original_price),
    newPrice: Number(update.new_price),
  }));

  const pdf = await renderReceiptPdf({
    receipt,
    lines: receiptLines(receipt.basePrice, approved),
    audience: "customer",
  });

  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="handy-receipt-${jobReference(receipt.jobId)}.pdf"`,
      "Cache-Control": "private, no-store",
      // A shared receipt must not become a search result.
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}

function notFound(): Response {
  return new Response("הקישור לא נמצא, פג תוקפו או בוטל.", {
    status: 404,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "X-Robots-Tag": "noindex",
    },
  });
}
