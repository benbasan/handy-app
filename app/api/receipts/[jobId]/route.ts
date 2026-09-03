import { getJobReceipt } from "@/lib/supabase/completion";
import { listPriceUpdates } from "@/lib/supabase/priceUpdates";
import { getCurrentUser } from "@/lib/supabase/session";
import { receiptLines } from "@/lib/validation/completion";
import { jobReference } from "@/lib/validation/jobs";
import { renderReceiptPdf } from "@/lib/pdf/receipt";

/**
 * "הורד קבלה PDF" — the one route handler in the app.
 *
 * docs/architecture.md section 2 reserves `/api` for the cases a Server Action
 * cannot serve, and this is one: what comes back is a file and a
 * `Content-Disposition`, not a re-render. Everything else about it is the same
 * as any page — the reader is resolved from the session, and the data comes
 * from `job_receipt()`, which decides for itself whether this person is a side
 * of this job and whether they are shown the commission.
 *
 * There is no ownership check in this file on purpose. A check here would be a
 * fourth place the same rule is written, and the only one of the four with no
 * test behind it; the function raises for a stranger, which arrives as no row,
 * which is the 404 below.
 */
export const runtime = "nodejs";

// A receipt is per-viewer (the pro's copy carries the commission, the
// customer's does not), so nothing about it may be cached at the edge.
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: RouteContext<"/api/receipts/[jobId]">,
) {
  const user = await getCurrentUser();
  if (!user) {
    return new Response("unauthorized", { status: 401 });
  }

  const { jobId } = await params;

  const receipt = await getJobReceipt(jobId);
  // Not closed yet, or not a job this reader is a side of. The two are the
  // same answer here, deliberately: "no receipt for you" should not tell a
  // stranger whether the job exists.
  if (!receipt) {
    return new Response("no receipt for this job", { status: 404 });
  }

  const approved = (await listPriceUpdates(jobId)).filter(
    (update) => update.status === "approved",
  );

  const pdf = await renderReceiptPdf({
    receipt,
    lines: receiptLines(receipt.basePrice, approved),
    audience: user.role === "customer" ? "customer" : "pro",
  });

  const filename = `handy-receipt-${jobReference(jobId)}.pdf`;

  // Uint8Array, not the Node Buffer type, so the Web Response body accepts it
  // without a copy.
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
