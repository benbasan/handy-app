import { createClient } from "./server";
import {
  PAYMENT_METHODS,
  type PaymentMethod,
} from "@/lib/validation/completion";

/**
 * Read side of סיום עבודה, תשלום, עמלה וקבלה — the fifth file in the family
 * that already holds jobs.ts, bids.ts, priceUpdates.ts and tracking.ts.
 *
 * Everything here is a security definer function rather than a table read, and
 * for one reason each:
 *
 *  * `job_receipt()` names both sides of the job, and `profiles` has no
 *    cross-user read policy. It is also where the two readers are told
 *    different things — the commission comes back NULL for the customer.
 *  * `my_completed_jobs()` and `my_earnings_stats()` carry the customer's name
 *    beside each amount, and scope themselves to `auth.uid()` inside the
 *    function, so "a pro sees only their own earnings" is not a filter this
 *    file could forget.
 *  * `my_saved_pros()` turns two ids into names — `saved_pros` itself holds
 *    nothing renderable.
 *
 * The receipt's *lines* are not here: the approved `price_updates` rows are the
 * lines, and both sides already hold a read policy on that table
 * (lib/supabase/priceUpdates.ts). A second copy would be a second answer to
 * what the job cost.
 */

function toPaymentMethod(value: string): PaymentMethod {
  // A check constraint on the column allows exactly these four, so anything
  // else would be a schema change rather than drift.
  return (PAYMENT_METHODS as readonly string[]).includes(value)
    ? (value as PaymentMethod)
    : "cash";
}

export type JobReceipt = {
  jobId: string;
  description: string;
  addressText: string;
  categoryName: string;
  customerName: string | null;
  proId: string;
  proName: string | null;
  paymentMethod: PaymentMethod;
  basePrice: number;
  totalPrice: number;
  /** NULL for the customer: the 12% is between Handy and the pro. */
  commissionAmount: number | null;
  netAmount: number | null;
  chargedAt: string;
  rating: number | null;
  reviewComment: string | null;
};

/**
 * The billing summary of a closed job, or null if it is not closed yet (or not
 * one the caller is a side of — the function raises, and a raise arrives here
 * as no row).
 */
export async function getJobReceipt(jobId: string): Promise<JobReceipt | null> {
  const supabase = await createClient();

  const { data } = await supabase.rpc("job_receipt", { p_job_id: jobId });
  const row = data?.[0];
  if (!row) return null;

  return {
    jobId: row.job_id,
    description: row.description,
    addressText: row.address_text,
    categoryName: row.category_name_he,
    customerName: row.customer_name,
    proId: row.pro_id,
    proName: row.pro_name,
    paymentMethod: toPaymentMethod(row.payment_method),
    basePrice: Number(row.base_price),
    totalPrice: Number(row.total_price),
    commissionAmount:
      row.commission_amount === null ? null : Number(row.commission_amount),
    netAmount: row.net_amount === null ? null : Number(row.net_amount),
    chargedAt: row.charged_at,
    rating: row.rating,
    reviewComment: row.review_comment,
  };
}

/** A row of the היסטוריה tab, and of the wallet's table. */
export type CompletedJob = {
  jobId: string;
  description: string;
  addressText: string;
  categoryName: string;
  categorySlug: string;
  customerName: string | null;
  basePrice: number;
  totalPrice: number;
  commissionAmount: number;
  netAmount: number;
  paymentMethod: PaymentMethod;
  chargedAt: string;
  rating: number | null;
};

/**
 * The calling pro's closed jobs. `since` narrows to the wallet's range; the
 * history tab passes nothing and gets everything.
 */
export async function listMyCompletedJobs(
  since?: Date,
): Promise<CompletedJob[]> {
  const supabase = await createClient();

  const { data } = await supabase.rpc("my_completed_jobs", {
    p_since: since ? since.toISOString() : undefined,
  });

  return (data ?? []).map((row) => ({
    jobId: row.job_id,
    description: row.description,
    addressText: row.address_text,
    categoryName: row.category_name_he,
    categorySlug: row.category_slug,
    customerName: row.customer_name,
    basePrice: Number(row.base_price),
    totalPrice: Number(row.total_price),
    commissionAmount: Number(row.commission_amount),
    netAmount: Number(row.net_amount),
    paymentMethod: toPaymentMethod(row.payment_method),
    chargedAt: row.charged_at,
    rating: row.rating,
  }));
}

/** The three cards at the top of design/screens/pro-4.1-earnings-wallet.png. */
export type EarningsStats = {
  jobsCount: number;
  gross: number;
  commission: number;
  net: number;
  lifetimeJobsCount: number;
  lifetimeGross: number;
  lifetimeCommission: number;
  /** From `reviews`, to two decimals — the design prints 4.95. */
  ratingAvg: number | null;
  ratingCount: number;
};

const NO_EARNINGS: EarningsStats = {
  jobsCount: 0,
  gross: 0,
  commission: 0,
  net: 0,
  lifetimeJobsCount: 0,
  lifetimeGross: 0,
  lifetimeCommission: 0,
  ratingAvg: null,
  ratingCount: 0,
};

export async function getMyEarningsStats(since?: Date): Promise<EarningsStats> {
  const supabase = await createClient();

  const { data } = await supabase.rpc("my_earnings_stats", {
    p_since: since ? since.toISOString() : undefined,
  });

  const row = data?.[0];
  if (!row) return NO_EARNINGS;

  return {
    jobsCount: row.jobs_count,
    gross: Number(row.gross),
    commission: Number(row.commission),
    net: Number(row.net),
    lifetimeJobsCount: row.lifetime_jobs_count,
    lifetimeGross: Number(row.lifetime_gross),
    lifetimeCommission: Number(row.lifetime_commission),
    ratingAvg: row.rating_avg === null ? null : Number(row.rating_avg),
    ratingCount: row.rating_count,
  };
}

/** "בעלי המקצוע שלי" — customer-5.1-my-account.png, filled by the summary screen. */
export type SavedPro = {
  proId: string;
  fullName: string | null;
  bio: string | null;
  ratingAvg: number | null;
  jobsCompletedCount: number;
  verified: boolean;
  savedAt: string;
};

export async function listMySavedPros(): Promise<SavedPro[]> {
  const supabase = await createClient();

  const { data } = await supabase.rpc("my_saved_pros");

  return (data ?? []).map((row) => ({
    proId: row.pro_id,
    fullName: row.full_name,
    bio: row.bio,
    ratingAvg: row.rating_avg === null ? null : Number(row.rating_avg),
    jobsCompletedCount: row.jobs_completed_count,
    verified: row.verified,
    savedAt: row.saved_at,
  }));
}

/** Whether this customer has already saved this pro — the button's two states. */
export async function hasSavedPro(proId: string): Promise<boolean> {
  const supabase = await createClient();

  const { count } = await supabase
    .from("saved_pros")
    .select("pro_id", { count: "exact", head: true })
    .eq("pro_id", proId);

  return (count ?? 0) > 0;
}
