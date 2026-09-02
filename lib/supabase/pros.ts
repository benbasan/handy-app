import { cache } from "react";
import { VERIFICATION_DOCS_BUCKET } from "./buckets";
import { createClient } from "./server";
import type { VerificationDocType } from "@/lib/validation/pros";

/**
 * Read side of the pro's flow — the twin of lib/supabase/jobs.ts on the other
 * side of the marketplace. Every query here runs under the caller's own RLS,
 * so "what can a pro read?" is answerable by reading one file plus the
 * policies in supabase/migrations.
 */

export type ProProfile = {
  userId: string;
  bio: string | null;
  radiusKm: number;
  serviceAddressText: string | null;
  hasServicePoint: boolean;
  verificationStatus: string;
  ratingAvg: number | null;
  jobsCompletedCount: number;
  acceptingJobs: boolean;
  profileStrengthPct: number;
  workDays: number[];
  workStartTime: string;
  workEndTime: string;
  onboardingStep: number;
  submittedAt: string | null;
  paymentMethods: string[];
  payoutBankName: string | null;
  payoutBankBranch: string | null;
  payoutAccountLast4: string | null;
  categoryIds: string[];
};

const PRO_COLUMNS =
  "user_id, bio, radius_km, service_address_text, service_point, verification_status, rating_avg, jobs_completed_count, accepting_jobs, profile_strength_pct, work_days, work_start_time, work_end_time, onboarding_step, submitted_at, payment_methods, payout_bank_name, payout_bank_branch, payout_account_last4";

/**
 * The signed-in pro's own profile plus their chosen trades.
 *
 * `cache` deduplicates it within a request: the header, the layout gate and
 * the page itself all want the same row.
 */
export const getMyProProfile = cache(async (): Promise<ProProfile | null> => {
  const supabase = await createClient();

  const [{ data }, { data: categories }] = await Promise.all([
    supabase.from("pro_profiles").select(PRO_COLUMNS).maybeSingle(),
    supabase.from("pro_categories").select("category_id"),
  ]);

  if (!data) return null;

  return {
    userId: data.user_id,
    bio: data.bio,
    radiusKm: data.radius_km,
    serviceAddressText: data.service_address_text,
    // `service_point` comes back as hex EWKB; only its presence matters here,
    // and the coordinates behind it never need to reach the browser.
    hasServicePoint: data.service_point !== null,
    verificationStatus: data.verification_status,
    ratingAvg: data.rating_avg,
    jobsCompletedCount: data.jobs_completed_count,
    acceptingJobs: data.accepting_jobs,
    profileStrengthPct: data.profile_strength_pct,
    workDays: data.work_days ?? [],
    workStartTime: data.work_start_time,
    workEndTime: data.work_end_time,
    onboardingStep: data.onboarding_step,
    submittedAt: data.submitted_at,
    paymentMethods: data.payment_methods ?? [],
    payoutBankName: data.payout_bank_name,
    payoutBankBranch: data.payout_bank_branch,
    payoutAccountLast4: data.payout_account_last4,
    categoryIds: (categories ?? []).map((row) => row.category_id),
  };
});

export type VerificationDoc = {
  id: string;
  docType: VerificationDocType;
  filePath: string;
  status: string;
  createdAt: string;
};

/**
 * The pro's uploaded documents, newest first.
 *
 * A document is never replaced in place — the bucket has no update or delete
 * policy at all — so re-uploading an ID card appends a row. Callers that want
 * "the current one" take the first per `doc_type`, and the older rows stay as
 * the audit trail an admin can still read.
 */
export const listMyVerificationDocs = cache(
  async (): Promise<VerificationDoc[]> => {
    const supabase = await createClient();

    const { data } = await supabase
      .from("verification_documents")
      .select("id, doc_type, file_url, status, created_at")
      .order("created_at", { ascending: false });

    return (data ?? []).map((row) => ({
      id: row.id,
      docType: row.doc_type as VerificationDocType,
      filePath: row.file_url,
      status: row.status,
      createdAt: row.created_at,
    }));
  },
);

export function latestDocByType(
  docs: readonly VerificationDoc[],
): Map<VerificationDocType, VerificationDoc> {
  const latest = new Map<VerificationDocType, VerificationDoc>();
  // The list is already newest-first, so the first sighting of a type wins.
  for (const doc of docs)
    if (!latest.has(doc.docType)) latest.set(doc.docType, doc);
  return latest;
}

/** product-spec.md 4.3 — a card in the pro's feed. */
export type FeedJob = {
  id: string;
  categoryId: string;
  categoryName: string;
  categorySlug: string;
  description: string;
  addressText: string;
  preferredTime: string | null;
  searchRadiusKm: number;
  status: string;
  createdAt: string;
  photoPaths: string[];
  latitude: number | null;
  longitude: number | null;
  distanceKm: number;
  bidsCount: number;
  /**
   * The design's orange "קריאה חדשה נכנסה עכשיו" ribbon. Derived here, from
   * one reading of the clock per query, rather than in the card: "now" is not
   * a pure value, and a component must not read it during render.
   */
  justArrived: boolean;
};

/** How long a job wears the "just arrived" ribbon. */
const JUST_ARRIVED_MS = 15 * 60 * 1000;

/**
 * The job feed.
 *
 * The whole query is `open_jobs_for_pro` in the database — an indexed
 * `ST_DWithin` against the pro's own `service_point`, not a fetch-everything
 * followed by distance maths in JS. The function runs as the caller, so the
 * SELECT policy on `jobs` (verified · accepting · inside both radii) is what
 * actually selects the rows; `maxKm` only narrows further, which is why the
 * radius chips can be a plain argument.
 */
export async function listFeedJobs(maxKm: number | null): Promise<FeedJob[]> {
  const supabase = await createClient();

  const { data } = await supabase.rpc("open_jobs_for_pro", {
    p_max_km: maxKm ?? undefined,
  });

  const freshBefore = Date.now() - JUST_ARRIVED_MS;

  return (data ?? []).map((row) => ({
    id: row.id,
    categoryId: row.category_id,
    categoryName: row.category_name_he,
    categorySlug: row.category_slug,
    description: row.description,
    addressText: row.address_text,
    preferredTime: row.preferred_time,
    searchRadiusKm: row.search_radius_km,
    status: row.status,
    createdAt: row.created_at,
    photoPaths: row.photo_urls ?? [],
    latitude: row.latitude,
    longitude: row.longitude,
    distanceKm: row.distance_km,
    bidsCount: row.bids_count,
    justArrived: new Date(row.created_at).getTime() > freshBefore,
  }));
}

/** How many jobs the pro has dismissed, so the feed can offer to bring them back. */
export async function countDismissedJobs(): Promise<number> {
  const supabase = await createClient();

  const { count } = await supabase
    .from("job_dismissals")
    .select("job_id", { count: "exact", head: true });

  return count ?? 0;
}

/** ---------------------------------------------------------------------- */
/* Admin side                                                              */
/** ---------------------------------------------------------------------- */

export type ProApplication = {
  userId: string;
  fullName: string | null;
  phone: string;
  bio: string | null;
  serviceAddressText: string | null;
  radiusKm: number;
  verificationStatus: string;
  submittedAt: string | null;
  categoryNames: string[];
  docs: Array<{
    id: string;
    docType: VerificationDocType;
    filePath: string;
    status: string;
  }>;
};

/**
 * The approvals queue — design/screens/admin-7.2-pro-approvals.png, in the
 * minimal form Phase 3 needs so the pro flow can be walked end to end without
 * waiting for the full dashboard in Phase 7.
 *
 * No `.eq("verification_status", …)` on the admin's behalf beyond the status
 * filter the screen asks for: what makes this readable at all is the
 * `is_admin()` policy on each table, and restating it in the query would
 * suggest the query is the thing keeping other people out.
 */
export async function listProApplications(
  statuses: readonly string[],
): Promise<ProApplication[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("pro_profiles")
    // `profiles!pro_profiles_user_id_fkey`, not a bare `profiles`: there are
    // two paths between these tables — the direct foreign key, and a
    // many-to-many through `saved_pros` — and PostgREST answers an ambiguous
    // embed with HTTP 300 and no rows at all, which would render this queue
    // silently empty.
    .select(
      "user_id, bio, radius_km, service_address_text, verification_status, submitted_at, profiles!pro_profiles_user_id_fkey(full_name, phone), pro_categories(categories(name_he)), verification_documents(id, doc_type, file_url, status)",
    )
    .in("verification_status", [...statuses])
    .order("submitted_at", { ascending: true, nullsFirst: false });

  return (data ?? []).map((row) => ({
    userId: row.user_id,
    fullName: row.profiles?.full_name ?? null,
    phone: row.profiles?.phone ?? "",
    bio: row.bio,
    serviceAddressText: row.service_address_text,
    radiusKm: row.radius_km,
    verificationStatus: row.verification_status,
    submittedAt: row.submitted_at,
    categoryNames: (row.pro_categories ?? [])
      .map((link) => link.categories?.name_he)
      .filter((name): name is string => Boolean(name)),
    docs: (row.verification_documents ?? []).map((doc) => ({
      id: doc.id,
      docType: doc.doc_type as VerificationDocType,
      filePath: doc.file_url,
      status: doc.status,
    })),
  }));
}

/**
 * Short-lived signed URLs for private verification documents.
 *
 * The bucket is not public and Storage only signs what the caller's own RLS
 * lets them select, so this is a convenience rather than the access control —
 * the same arrangement job media uses. Paths that cannot be signed are dropped
 * rather than rendered as broken images.
 */
export async function signVerificationDocs(
  paths: string[],
  expiresInSeconds = 60 * 10,
): Promise<Map<string, string>> {
  const signed = new Map<string, string>();
  if (paths.length === 0) return signed;

  const supabase = await createClient();
  const { data } = await supabase.storage
    .from(VERIFICATION_DOCS_BUCKET)
    .createSignedUrls(paths, expiresInSeconds);

  for (const entry of data ?? []) {
    if (entry.signedUrl && entry.path) signed.set(entry.path, entry.signedUrl);
  }

  return signed;
}
