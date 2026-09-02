import { createClient } from "./server";
import {
  type BidSort,
  isBidStatus,
  type BidStatus,
} from "@/lib/validation/bids";

/**
 * Read side of the bidding flow — the third file in the same family as
 * lib/supabase/jobs.ts and lib/supabase/pros.ts. Every query runs under the
 * caller's own RLS, and the four functions it calls are all in
 * supabase/migrations/20260904120000_realtime_bidding.sql.
 *
 * Why so much of this goes through database functions rather than PostgREST
 * selects: the compare screen needs the pro's name, rating and completed-job
 * count beside each price, and `profiles`/`pro_profiles` deliberately have no
 * customer-facing SELECT policy (docs/architecture.md section 4). The right
 * answer to "this screen needs four columns" is a definer function that
 * returns exactly those four, not a policy that opens the tables.
 */

/** A bid as the customer sees it — design/screens/customer-2.2-compare-bids.png. */
export type JobBid = {
  id: string;
  proId: string;
  proName: string | null;
  proRating: number | null;
  proJobsCompleted: number;
  proVerified: boolean;
  price: number;
  etaMinutes: number;
  note: string | null;
  status: BidStatus;
  expiresAt: string;
  createdAt: string;
  unreadCount: number;
};

function toBidStatus(value: string): BidStatus {
  // The database reports `expired` for a lapsed pending row whether or not the
  // sweep has run, so anything else here would be a schema change, not drift.
  return isBidStatus(value) ? value : "pending";
}

export async function listBidsForJob(jobId: string): Promise<JobBid[]> {
  const supabase = await createClient();

  const { data } = await supabase.rpc("bids_for_job", { p_job_id: jobId });

  return (data ?? []).map((row) => ({
    id: row.id,
    proId: row.pro_id,
    proName: row.pro_name,
    proRating: row.pro_rating,
    proJobsCompleted: row.pro_jobs_completed,
    proVerified: row.pro_verified,
    price: Number(row.price),
    etaMinutes: row.eta_minutes,
    note: row.note,
    status: toBidStatus(row.status),
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    unreadCount: row.unread_count,
  }));
}

/**
 * The three sort tabs. `recommended` is the design's default and is not just
 * "cheapest with a nicer name": it ranks by rating first and settles ties on
 * price, which is the order the "איך לבחור נכון" card beside the list argues
 * for — check the rating against the number of jobs, then the price.
 *
 * Only live offers can win a badge, so a lapsed bid never sorts to the top.
 */
export function sortBids(bids: readonly JobBid[], sort: BidSort): JobBid[] {
  const rank = (bid: JobBid) => (bid.status === "pending" ? 0 : 1);

  return [...bids].sort((a, b) => {
    if (rank(a) !== rank(b)) return rank(a) - rank(b);

    switch (sort) {
      case "cheapest":
        return a.price - b.price;
      case "fastest":
        return a.etaMinutes - b.etaMinutes;
      case "recommended":
      default: {
        const byRating = (b.proRating ?? 0) - (a.proRating ?? 0);
        return byRating !== 0 ? byRating : a.price - b.price;
      }
    }
  });
}

/**
 * The design's small green tags — מומלץ · המחיר הזול · הגעה מהירה. Derived
 * from the offers actually on the table rather than stored, and only ever
 * awarded to a live one.
 */
export function bidHighlights(bids: readonly JobBid[]): Map<string, string[]> {
  const live = bids.filter((bid) => bid.status === "pending");
  const highlights = new Map<string, string[]>();

  const add = (id: string | undefined, label: string) => {
    if (!id) return;
    highlights.set(id, [...(highlights.get(id) ?? []), label]);
  };

  if (live.length < 2) return highlights;

  add(
    [...live].sort(
      (a, b) => (b.proRating ?? 0) - (a.proRating ?? 0) || a.price - b.price,
    )[0]?.id,
    "מומלץ Handy",
  );
  add([...live].sort((a, b) => a.price - b.price)[0]?.id, "המחיר הזול");
  add(
    [...live].sort((a, b) => a.etaMinutes - b.etaMinutes)[0]?.id,
    "הגעה מהירה",
  );

  return highlights;
}

/** How many verified, available pros the job actually reaches. */
export async function countProsInRange(jobId: string): Promise<number> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("pros_in_range", { p_job_id: jobId });
  return data ?? 0;
}

/** "כבר הוגשו N הצעות" on the bid form — a count and nothing else. */
export async function countBidsOnJob(jobId: string): Promise<number> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("job_bid_count", { p_job_id: jobId });
  return data ?? 0;
}

/** A bid as its author sees it — design/screens/pro-2.4-my-bids.png. */
export type MyBid = {
  id: string;
  jobId: string;
  jobDescription: string;
  jobAddressText: string;
  jobStatus: string;
  jobCreatedAt: string;
  categoryName: string;
  categorySlug: string;
  photoPaths: string[];
  price: number;
  etaMinutes: number;
  note: string | null;
  status: BidStatus;
  expiresAt: string;
  createdAt: string;
  /** Only ever set on a lost bid: the price that won, never who offered it. */
  winningPrice: number | null;
  unreadCount: number;
};

export async function listMyBids(): Promise<MyBid[]> {
  const supabase = await createClient();

  const { data } = await supabase.rpc("my_bids");

  return (data ?? []).map((row) => ({
    id: row.id,
    jobId: row.job_id,
    jobDescription: row.job_description,
    jobAddressText: row.job_address_text,
    jobStatus: row.job_status,
    jobCreatedAt: row.job_created_at,
    categoryName: row.category_name_he,
    categorySlug: row.category_slug,
    photoPaths: row.photo_urls ?? [],
    price: Number(row.price),
    etaMinutes: row.eta_minutes,
    note: row.note,
    status: toBidStatus(row.status),
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    winningPrice: row.winning_price === null ? null : Number(row.winning_price),
    unreadCount: row.unread_count,
  }));
}

/** "שיעור קבלה 72% · זמן תגובה ממוצע 9 דקות" — computed, never invented. */
export type BidStats = {
  total: number;
  pending: number;
  selected: number;
  acceptancePct: number | null;
  avgResponseMinutes: number | null;
};

export async function getMyBidStats(): Promise<BidStats> {
  const supabase = await createClient();

  const { data } = await supabase.rpc("my_bid_stats");
  const row = data?.[0];

  return {
    total: row?.total ?? 0,
    pending: row?.pending ?? 0,
    selected: row?.selected ?? 0,
    acceptancePct: row?.acceptance_pct ?? null,
    avgResponseMinutes: row?.avg_response_minutes ?? null,
  };
}

/**
 * "טווח מחירים לקריאות דומות באזור" on the bid form.
 *
 * Real bids on real jobs in the same trade nearby. The sample size comes back
 * with the range so the screen can stay quiet rather than quote a "range"
 * drawn from one bid — the same stance Phase 2 and 3 took on the prototype's
 * invented hero metrics.
 */
export type PriceRange = {
  min: number;
  max: number;
  sampleCount: number;
};

/** Below this, the range says more about luck than about the market. */
export const MIN_PRICE_RANGE_SAMPLE = 3;

export async function getSimilarBidRange(
  jobId: string,
): Promise<PriceRange | null> {
  const supabase = await createClient();

  const { data } = await supabase.rpc("similar_bid_range", {
    p_job_id: jobId,
  });
  const row = data?.[0];

  if (
    !row ||
    row.min_price === null ||
    row.max_price === null ||
    row.sample_count < MIN_PRICE_RANGE_SAMPLE
  ) {
    return null;
  }

  return {
    min: Number(row.min_price),
    max: Number(row.max_price),
    sampleCount: row.sample_count,
  };
}

/**
 * Housekeeping, called at the top of the screens that render bid statuses.
 *
 * The pg_cron schedule in the Phase 4 migration is the real sweep; this is
 * what keeps a stack with no scheduler honest. It is safe from anywhere: the
 * function only advances rows the clock has already settled, and nothing in
 * the product depends on it having run — `select_bid()` re-reads the deadline
 * itself and every read function reports a lapsed bid as expired regardless.
 */
export async function sweepExpiredBids(): Promise<void> {
  const supabase = await createClient();
  await supabase.rpc("expire_stale_bids");
}
