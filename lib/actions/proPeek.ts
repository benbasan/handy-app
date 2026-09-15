"use server";

import { logServerError } from "@/lib/observability";
import {
  getPublicProProfile,
  listPublicProReviews,
  type PublicReview,
} from "@/lib/supabase/publicProfiles";
import { SLUG_PATTERN } from "@/lib/validation/publicProfile";

/**
 * "הצצה מהירה" (Phase 14) — what the full public profile says, fetched into a
 * panel over the compare screen so the customer never leaves the comparison.
 *
 * Nothing here is private and nothing new is exposed: both readers are the
 * Phase 8 definer functions granted to `anon`, which name every column they
 * return. The slug is validated only by being looked up — an unknown one comes
 * back as null, the same answer `/pro/<slug>` gives.
 */
export type ProPeek = {
  slug: string;
  fullName: string | null;
  bio: string | null;
  avatarUrl: string | null;
  galleryUrls: string[];
  ratingAvg: number | null;
  reviewsCount: number;
  jobsCompletedCount: number;
  yearsExperience: number | null;
  hasIdCard: boolean;
  hasLicense: boolean;
  hasInsurance: boolean;
  reviews: PublicReview[];
};

export async function loadProPeek(slug: string): Promise<ProPeek | null> {
  // The same shape the column's check constraint enforces, so a request that
  // could never match a pro never reaches the database.
  if (!SLUG_PATTERN.test(slug)) return null;

  try {
    const [profile, reviews] = await Promise.all([
      getPublicProProfile(slug),
      listPublicProReviews(slug, 3),
    ]);
    if (!profile) return null;

    return {
      slug: profile.slug,
      fullName: profile.fullName,
      bio: profile.bio,
      avatarUrl: profile.avatarUrl,
      galleryUrls: profile.galleryUrls.slice(0, 6),
      ratingAvg: profile.ratingAvg,
      reviewsCount: profile.reviewsCount,
      jobsCompletedCount: profile.jobsCompletedCount,
      yearsExperience: profile.yearsExperience,
      hasIdCard: profile.hasIdCard,
      hasLicense: profile.hasLicense,
      hasInsurance: profile.hasInsurance,
      reviews,
    };
  } catch (cause) {
    logServerError("proPeek.load", cause, { slug });
    return null;
  }
}
