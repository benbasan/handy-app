import Link from "next/link";
import { redirect } from "next/navigation";
import { PublicProfileForm } from "@/components/pro/PublicProfileForm";
import { ReviewReplyForm } from "@/components/pro/ReviewReplyForm";
import { BUTTON_QUIET } from "@/components/ui/primitives";
import { MARKETING_ROUTES, PRO_ROUTES } from "@/lib/routes";
import { getMyProProfile } from "@/lib/supabase/pros";
import { listMyReviews } from "@/lib/supabase/publicProfiles";
import { requireRole } from "@/lib/supabase/session";
import { profileStrength } from "@/lib/validation/publicProfile";

export const metadata = { title: "הפרופיל הציבורי שלי — Handy" };

/**
 * design/screens/pro-5.1-public-profile-edit.png.
 *
 * The strength bar is computed here rather than read off
 * `pro_profiles.profile_strength_pct`. That column exists and onboarding
 * writes it, but it is a snapshot of a form — this bar has to describe the
 * profile as it stands right now, including the two photos the pro deleted
 * this morning. See `profileStrength()`.
 */
export default async function ProPublicProfilePage() {
  const user = await requireRole("pro");

  const [profile, reviews] = await Promise.all([
    getMyProProfile(),
    listMyReviews(),
  ]);

  if (!profile) redirect(PRO_ROUTES.join);

  const strength = profileStrength({
    bio: profile.bio,
    avatarPath: profile.avatarPath,
    galleryCount: profile.galleryPaths.length,
    categoryCount: profile.categoryIds.length,
    yearsExperience: profile.yearsExperience,
    hasCustomSlug: !profile.publicSlug.startsWith("pro-"),
  });

  const missing = strength.items.filter((item) => !item.done);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold text-ink sm:text-4xl">
          הפרופיל הציבורי שלי
        </h1>
        <p className="mt-2 text-muted">
          כך לקוחות רואים אותך לפני שהם בוחרים הצעה.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[20rem_minmax(0,1fr)] lg:items-start">
        <aside className="space-y-4 lg:order-2">
          <div className="rounded-2xl bg-ink p-5 text-white sm:p-6">
            <h2 className="text-base font-bold">חוזק הפרופיל</h2>
            <p className="ltr-nums mt-1 text-4xl font-bold text-cta">
              {strength.pct}%
            </p>
            <div
              role="progressbar"
              aria-valuenow={strength.pct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="חוזק הפרופיל"
              className="mt-3 h-2 w-full overflow-hidden rounded-full bg-white/20"
            >
              <div
                className="h-full rounded-full bg-cta"
                style={{ inlineSize: `${strength.pct}%` }}
              />
            </div>
            <p className="mt-3 text-sm text-white/75">
              {missing.length === 0
                ? "הפרופיל מלא. תודה — זה מה שמביא הצעות שנבחרות."
                : `להשלמה: ${missing.map((item) => item.label).join(", ")}.`}
            </p>
          </div>

          <div className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
            <h2 className="text-base font-bold text-ink">תצוגה מקדימה</h2>
            <p className="mt-1 text-sm text-muted">
              כך הפרופיל נראה בעמוד הציבורי.
            </p>
            {profile.verificationStatus === "verified" ? (
              <Link
                href={MARKETING_ROUTES.proProfile(profile.publicSlug)}
                className={`${BUTTON_QUIET} mt-3 w-full`}
              >
                פתח כלקוח
              </Link>
            ) : (
              <p className="mt-3 rounded-xl bg-canvas p-3 text-sm text-muted">
                העמוד הציבורי מתפרסם רק אחרי שהפרופיל מאושר. אפשר למלא אותו כבר
                עכשיו.
              </p>
            )}
          </div>
        </aside>

        <div className="lg:order-1">
          <PublicProfileForm
            userId={user.id}
            initial={{
              publicSlug: profile.publicSlug,
              bio: profile.bio,
              yearsExperience: profile.yearsExperience,
              avatarPath: profile.avatarPath,
              galleryPaths: profile.galleryPaths,
            }}
          />

          <section className="mt-6 rounded-2xl border border-line bg-surface">
            <h2 className="border-b border-line px-5 py-4 text-lg font-bold text-ink sm:px-6">
              ביקורות שקיבלתי
            </h2>

            {reviews.length === 0 ? (
              <p className="px-5 py-6 text-muted sm:px-6">
                עדיין אין ביקורות. הן מגיעות מלקוחות שהעבודה שלהם נסגרה.
              </p>
            ) : (
              <ul>
                {reviews.map((review) => (
                  <li
                    key={review.id}
                    className="border-b border-line/70 px-5 py-4 last:border-b-0 sm:px-6"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="font-bold text-ink">
                        {review.customerName ?? "לקוח/ה"}
                      </p>
                      <p className="text-sm text-muted">
                        {review.categoryName} ·{" "}
                        <time
                          className="ltr-nums"
                          dateTime={review.createdAt.slice(0, 10)}
                        >
                          {review.createdAt.slice(0, 10)}
                        </time>
                      </p>
                    </div>

                    <p
                      aria-label={`דירוג ${review.rating} מתוך 5`}
                      className="mt-1 text-alert"
                    >
                      {"★".repeat(review.rating)}
                    </p>

                    {review.comment && (
                      <p className="mt-1 text-muted">{review.comment}</p>
                    )}

                    <ReviewReplyForm
                      reviewId={review.id}
                      existing={review.proReply}
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
