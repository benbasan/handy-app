import { createClient } from "./server";
import {
  adminJobState,
  type AdminJobFilters,
  type AdminJobState,
} from "@/lib/validation/admin";
import { isDisputeStatus, type DisputeStatus } from "@/lib/validation/disputes";

/**
 * Read side of the admin dashboard — product-spec.md section 5.
 *
 * Everything here is a `security definer` function that asks `is_admin()`
 * itself, and that is not belt-and-braces: the dashboard's figures are
 * aggregates ("how many calls today", "what share of price updates were
 * approved"), and an aggregate is not a row anybody owns, so there is no row
 * policy that could express it. Each function therefore re-asks the question
 * at its own front door, and a customer calling one by hand gets 42501.
 *
 * What is deliberately *not* in this file is the dossier behind a dispute.
 * `jobs`, `bids`, `price_updates`, `messages`, `commission_charges` and
 * `reviews` have each carried an "admin reads all" policy since the phase that
 * created them, so the documentation screen reads them as plain rows through
 * the modules that already exist (jobs.ts, bids.ts, priceUpdates.ts,
 * messages.ts). A definer wrapper would have been a second, unpoliced way to
 * read the same data.
 */

/** design/screens/admin-7.1-overview.png, in one row and one instant. */
export type AdminOverview = {
  pendingPros: number;
  openDisputes: number;
  jobs24h: number;
  jobsPrev24h: number;
  /** Average posting → first offer, over the last week. Null with no offers yet. */
  minutesToFirstBid: number | null;
  closedRatePct: number | null;
  jobsWithoutBids: number;
  commissionMonth: number;
  commissionMonthJobs: number;
  commissionPrevMonth: number;
  unreviewedDocs: number;
  prosWithManyPriceUpdates: number;
};

const NO_OVERVIEW: AdminOverview = {
  pendingPros: 0,
  openDisputes: 0,
  jobs24h: 0,
  jobsPrev24h: 0,
  minutesToFirstBid: null,
  closedRatePct: null,
  jobsWithoutBids: 0,
  commissionMonth: 0,
  commissionMonthJobs: 0,
  commissionPrevMonth: 0,
  unreviewedDocs: 0,
  prosWithManyPriceUpdates: 0,
};

export async function getAdminOverview(): Promise<AdminOverview> {
  const supabase = await createClient();

  const { data } = await supabase.rpc("admin_overview");
  const row = data?.[0];
  if (!row) return NO_OVERVIEW;

  return {
    pendingPros: row.pending_pros,
    openDisputes: row.open_disputes,
    jobs24h: row.jobs_24h,
    jobsPrev24h: row.jobs_prev_24h,
    minutesToFirstBid:
      row.minutes_to_first_bid === null
        ? null
        : Number(row.minutes_to_first_bid),
    closedRatePct:
      row.closed_rate_pct === null ? null : Number(row.closed_rate_pct),
    jobsWithoutBids: row.jobs_without_bids,
    commissionMonth: Number(row.commission_month),
    commissionMonthJobs: row.commission_month_jobs,
    commissionPrevMonth: Number(row.commission_prev_month),
    unreviewedDocs: row.unreviewed_docs,
    prosWithManyPriceUpdates: row.pros_with_many_price_updates,
  };
}

/** One bar of "קריאות לפי יום", including the quiet days. */
export type JobsPerDay = {
  /** Local ISO date — the key, not something rendered. */
  day: string;
  jobsCount: number;
};

export async function listJobsPerDay(days = 7): Promise<JobsPerDay[]> {
  const supabase = await createClient();

  const { data } = await supabase.rpc("admin_jobs_by_day", { p_days: days });

  return (data ?? []).map((row) => ({
    day: row.day,
    jobsCount: row.jobs_count,
  }));
}

/** The legend under that chart — אינסטלציה 34% · חשמל 27% · … */
export type CategoryShare = {
  categoryName: string;
  categorySlug: string;
  jobsCount: number;
  sharePct: number;
};

export async function listCategoryMix(days = 7): Promise<CategoryShare[]> {
  const supabase = await createClient();

  const { data } = await supabase.rpc("admin_category_mix", { p_days: days });

  return (data ?? []).map((row) => ({
    categoryName: row.category_name_he,
    categorySlug: row.category_slug,
    jobsCount: row.jobs_count,
    sharePct: Number(row.share_pct),
  }));
}

/** A row of קריאות במערכת — design/screens/admin-7.3-jobs-management.png. */
export type AdminJobRow = {
  jobId: string;
  categoryName: string;
  categorySlug: string;
  city: string | null;
  addressText: string;
  description: string;
  /** `jobs.status` as stored. The label on screen is `state`. */
  status: string;
  state: AdminJobState;
  bidsCount: number;
  /** `job_effective_price()` — null until a bid has been chosen. */
  amount: number | null;
  customerName: string | null;
  proName: string | null;
  createdAt: string;
};

export async function listAdminJobs(
  filters: AdminJobFilters,
): Promise<AdminJobRow[]> {
  const supabase = await createClient();

  const { data } = await supabase.rpc("admin_jobs", {
    p_search: filters.search,
    p_status: filters.status,
    p_category_slug: filters.category,
    p_city: filters.city,
    p_days: filters.days,
  });

  return (data ?? []).map((row) => ({
    jobId: row.job_id,
    categoryName: row.category_name_he,
    categorySlug: row.category_slug,
    city: row.city,
    addressText: row.address_text,
    description: row.description,
    status: row.status,
    state: adminJobState(row.status, row.bids_count),
    bidsCount: row.bids_count,
    amount: row.amount === null ? null : Number(row.amount),
    customerName: row.customer_name,
    proName: row.pro_name,
    createdAt: row.created_at,
  }));
}

/** Whatever cities actually have calls — the "כל הערים" chip's options. */
export async function listJobCities(): Promise<
  Array<{ city: string; jobsCount: number }>
> {
  const supabase = await createClient();

  const { data } = await supabase.rpc("admin_job_cities");

  return (data ?? []).map((row) => ({
    city: row.city,
    jobsCount: row.jobs_count,
  }));
}

/** A card on design/screens/admin-7.4-disputes-control.png. */
export type AdminDispute = {
  disputeId: string;
  jobId: string;
  reason: string;
  status: DisputeStatus;
  creditAmount: number | null;
  resolutionNote: string | null;
  createdAt: string;
  resolvedAt: string | null;
  openedById: string;
  openedByName: string | null;
  openedByRole: string;
  jobStatus: string;
  categoryName: string;
  customerName: string | null;
  proName: string | null;
};

export async function listAdminDisputes(
  status?: DisputeStatus,
): Promise<AdminDispute[]> {
  const supabase = await createClient();

  const { data } = await supabase.rpc("admin_disputes", { p_status: status });

  return (data ?? []).map((row) => ({
    disputeId: row.dispute_id,
    jobId: row.job_id,
    reason: row.reason,
    // A check constraint on the column allows exactly these four, so anything
    // else would be a schema change rather than drift.
    status: isDisputeStatus(row.status) ? row.status : "open",
    creditAmount: row.credit_amount === null ? null : Number(row.credit_amount),
    resolutionNote: row.resolution_note,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at,
    openedById: row.opened_by,
    openedByName: row.opened_by_name,
    openedByRole: row.opened_by_role,
    jobStatus: row.job_status,
    categoryName: row.category_name_he,
    customerName: row.customer_name,
    proName: row.pro_name,
  }));
}

/** מדדי אמון — product-spec.md 5.5. */
export type TrustMetrics = {
  jobsCount: number;
  disputesCount: number;
  disputesPer1000: number;
  priceUpdatesDecided: number;
  /** Null while no field price update has been decided either way. */
  priceUpdatesApprovedPct: number | null;
  avgResolutionHours: number | null;
};

const NO_TRUST_METRICS: TrustMetrics = {
  jobsCount: 0,
  disputesCount: 0,
  disputesPer1000: 0,
  priceUpdatesDecided: 0,
  priceUpdatesApprovedPct: null,
  avgResolutionHours: null,
};

export async function getTrustMetrics(days = 90): Promise<TrustMetrics> {
  const supabase = await createClient();

  const { data } = await supabase.rpc("admin_trust_metrics", { p_days: days });
  const row = data?.[0];
  if (!row) return NO_TRUST_METRICS;

  return {
    jobsCount: row.jobs_count,
    disputesCount: row.disputes_count,
    disputesPer1000: Number(row.disputes_per_1000),
    priceUpdatesDecided: row.price_updates_decided,
    priceUpdatesApprovedPct:
      row.price_updates_approved_pct === null
        ? null
        : Number(row.price_updates_approved_pct),
    avgResolutionHours:
      row.avg_resolution_hours === null
        ? null
        : Number(row.avg_resolution_hours),
  };
}

/**
 * The two enforcement flags on one pro, for the dossier's כלי אכיפה panel and
 * for the banner the pro themselves sees. Readable through
 * `pro_profiles: read own` and `pro_profiles: admin reads all`; nobody else
 * has a policy on the table at all.
 */
export type ProEnforcementState = {
  proId: string;
  verificationStatus: string;
  priceUpdatesBlocked: boolean;
  documentsRequiredAt: string | null;
};

export async function getProEnforcement(
  proId: string,
): Promise<ProEnforcementState | null> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("pro_profiles")
    .select(
      "user_id, verification_status, price_updates_blocked, documents_required_at",
    )
    .eq("user_id", proId)
    .maybeSingle();

  if (!data) return null;

  return {
    proId: data.user_id,
    verificationStatus: data.verification_status,
    priceUpdatesBlocked: data.price_updates_blocked,
    documentsRequiredAt: data.documents_required_at,
  };
}
