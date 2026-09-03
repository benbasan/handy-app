import { cache } from "react";
import { proMediaUrl } from "./buckets";
import { createClient } from "./server";

export { proMediaUrl } from "./buckets";

/**
 * Read side of the public half of the product (Phase 8) — the pages an
 * anonymous visitor reaches.
 *
 * Every call here is a `security definer` function and never a table read, and
 * that is the whole design rather than a convenience: `pro_profiles` holds a
 * payout account and a service point beside the bio, RLS picks rows and cannot
 * hide a column, and so the public columns are named one by one inside the
 * database (supabase/migrations/20260908120000_public_content_seo.sql). What
 * this file may not do is widen that — it can only ask.
 *
 * Nothing here needs a session. A signed-out visitor's client carries the anon
 * key and each function is granted to `anon` explicitly.
 */

export type PublicProProfile = {
  slug: string;
  fullName: string | null;
  bio: string | null;
  avatarUrl: string | null;
  galleryUrls: string[];
  ratingAvg: number | null;
  reviewsCount: number;
  jobsCompletedCount: number;
  yearsExperience: number | null;
  serviceCity: string | null;
  radiusKm: number;
  workDays: number[];
  workStartTime: string;
  workEndTime: string;
  acceptingJobs: boolean;
  paymentMethods: string[];
  categoryNames: string[];
  categorySlugs: string[];
  /** Which *kinds* of document were verified. Never the documents themselves. */
  hasIdCard: boolean;
  hasLicense: boolean;
  hasInsurance: boolean;
  /** The lowest this pro has ever offered — "מחיר ביקור מ-280 ₪". */
  minPrice: number | null;
  avgResponseMinutes: number | null;
};

export const getPublicProProfile = cache(
  async (slug: string): Promise<PublicProProfile | null> => {
    const supabase = await createClient();

    const { data } = await supabase.rpc("pro_public_profile", { p_slug: slug });
    const row = data?.[0];
    if (!row) return null;

    return {
      slug: row.slug,
      fullName: row.full_name,
      bio: row.bio,
      avatarUrl: proMediaUrl(row.avatar_path),
      galleryUrls: (row.gallery_paths ?? [])
        .map((path: string) => proMediaUrl(path))
        .filter((url: string | null): url is string => url !== null),
      ratingAvg: row.rating_avg === null ? null : Number(row.rating_avg),
      reviewsCount: row.reviews_count,
      jobsCompletedCount: row.jobs_completed_count,
      yearsExperience: row.years_experience,
      serviceCity: row.service_city,
      radiusKm: row.radius_km,
      workDays: row.work_days ?? [],
      workStartTime: row.work_start_time,
      workEndTime: row.work_end_time,
      acceptingJobs: row.accepting_jobs,
      paymentMethods: row.payment_methods ?? [],
      categoryNames: row.category_names ?? [],
      categorySlugs: row.category_slugs ?? [],
      hasIdCard: row.has_id_card,
      hasLicense: row.has_license,
      hasInsurance: row.has_insurance,
      minPrice: row.min_price === null ? null : Number(row.min_price),
      avgResponseMinutes:
        row.avg_response_minutes === null
          ? null
          : Number(row.avg_response_minutes),
    };
  },
);

export type PublicReview = {
  rating: number;
  comment: string | null;
  proReply: string | null;
  /** A given name and an initial. The page is indexed by search engines. */
  reviewerName: string;
  categoryName: string;
  createdAt: string;
};

export async function listPublicProReviews(
  slug: string,
  limit = 20,
): Promise<PublicReview[]> {
  const supabase = await createClient();

  const { data } = await supabase.rpc("pro_public_reviews", {
    p_slug: slug,
    p_limit: limit,
  });

  return (data ?? []).map((row) => ({
    rating: row.rating,
    comment: row.comment,
    proReply: row.pro_reply,
    reviewerName: row.reviewer_name,
    categoryName: row.category_name,
    createdAt: row.created_at,
  }));
}

/** A card on the category+city page — design/screens/customer-5.3-category-page.png. */
export type CategoryPro = {
  slug: string;
  fullName: string | null;
  avatarUrl: string | null;
  ratingAvg: number | null;
  reviewsCount: number;
  jobsCompletedCount: number;
  yearsExperience: number | null;
  serviceCity: string | null;
  minPrice: number | null;
  acceptingJobs: boolean;
};

export async function listCategoryPros({
  categorySlug,
  lat = null,
  lng = null,
  limit = 12,
}: {
  categorySlug: string;
  lat?: number | null;
  lng?: number | null;
  limit?: number;
}): Promise<CategoryPro[]> {
  const supabase = await createClient();

  const { data } = await supabase.rpc("category_pros", {
    p_category_slug: categorySlug,
    // `undefined` rather than `null`: the generated types mirror the SQL
    // defaults, and omitting both is what "anywhere in Israel" means there.
    p_lat: lat ?? undefined,
    p_lng: lng ?? undefined,
    p_limit: limit,
  });

  return (data ?? []).map((row) => ({
    slug: row.slug,
    fullName: row.full_name,
    avatarUrl: proMediaUrl(row.avatar_path),
    ratingAvg: row.rating_avg === null ? null : Number(row.rating_avg),
    reviewsCount: row.reviews_count,
    jobsCompletedCount: row.jobs_completed_count,
    yearsExperience: row.years_experience,
    serviceCity: row.service_city,
    minPrice: row.min_price === null ? null : Number(row.min_price),
    acceptingJobs: row.accepting_jobs,
  }));
}

/**
 * The figures in a category page's opening paragraph. Every one is counted
 * from rows — an empty marketplace gets zeros and nulls, and the page says so
 * rather than printing a plausible number.
 */
export type CategoryStats = {
  prosCount: number;
  avgFirstBidMinutes: number | null;
  jobsClosed: number;
  priceLow: number | null;
  priceTypical: number | null;
  priceHigh: number | null;
};

export async function getCategoryStats({
  categorySlug,
  lat = null,
  lng = null,
}: {
  categorySlug: string;
  lat?: number | null;
  lng?: number | null;
}): Promise<CategoryStats> {
  const supabase = await createClient();

  const { data } = await supabase.rpc("category_stats", {
    p_category_slug: categorySlug,
    p_lat: lat ?? undefined,
    p_lng: lng ?? undefined,
  });

  const row = data?.[0];

  return {
    prosCount: row?.pros_count ?? 0,
    avgFirstBidMinutes:
      row?.avg_first_bid_minutes == null
        ? null
        : Number(row.avg_first_bid_minutes),
    jobsClosed: row?.jobs_closed ?? 0,
    priceLow: row?.price_low == null ? null : Number(row.price_low),
    priceTypical: row?.price_typical == null ? null : Number(row.price_typical),
    priceHigh: row?.price_high == null ? null : Number(row.price_high),
  };
}

/** A row of מדריך עלויות — one per category, closed jobs only. */
export type PricingGuideRow = {
  categorySlug: string;
  categoryName: string;
  jobsClosed: number;
  priceLow: number | null;
  priceTypical: number | null;
  priceHigh: number | null;
};

export async function getPricingGuide(): Promise<PricingGuideRow[]> {
  const supabase = await createClient();

  const { data } = await supabase.rpc("pricing_guide");

  return (data ?? []).map((row) => ({
    categorySlug: row.category_slug,
    categoryName: row.category_name,
    jobsClosed: row.jobs_closed,
    priceLow: row.price_low === null ? null : Number(row.price_low),
    priceTypical: row.price_typical === null ? null : Number(row.price_typical),
    priceHigh: row.price_high === null ? null : Number(row.price_high),
  }));
}

/** Every pro who has a public page, for app/sitemap.ts. */
export async function listPublicProSlugs(): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("public_pro_slugs");
  return (data ?? []).map((row) => row.slug);
}

/**
 * The calling pro's own reviews — the "ביקורות שקיבלתי" list on
 * design/screens/pro-5.1-public-profile-edit.png.
 *
 * A definer function rather than a read of `reviews`, even though the pro
 * already holds a select policy there: the reviewer's name lives in `profiles`,
 * which has no cross-user read policy at all. Same arrangement, same reason, as
 * `my_completed_jobs()` in Phase 6.
 */
export type MyReview = {
  id: string;
  jobId: string;
  rating: number;
  comment: string | null;
  proReply: string | null;
  proRepliedAt: string | null;
  customerName: string | null;
  categoryName: string;
  createdAt: string;
};

export async function listMyReviews(): Promise<MyReview[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("my_reviews");

  return (data ?? []).map((row) => ({
    id: row.id,
    jobId: row.job_id,
    rating: row.rating,
    comment: row.comment,
    proReply: row.pro_reply,
    proRepliedAt: row.pro_replied_at,
    customerName: row.customer_name,
    categoryName: row.category_name,
    createdAt: row.created_at,
  }));
}
