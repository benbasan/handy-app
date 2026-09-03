import { z } from "zod";

/**
 * הפרופיל הציבורי שלי — design/screens/pro-5.1-public-profile-edit.png.
 *
 * What a pro publishes about themselves: an address, a picture, a description,
 * a gallery, and an answer to a review. Note what is *not* here — the rating,
 * the completed-jobs count and the verified badge are all facts the product
 * computes, and none of them has ever been writable by a client.
 */

/** Kept in step with the check constraint on `pro_profiles.public_slug`. */
export const RESERVED_SLUGS: readonly string[] = [
  "login",
  "dashboard",
  "join",
  "onboarding",
  "jobs",
  "offers",
  "messages",
  "settings",
  "my-jobs",
  "wallet",
  "profile",
  "help",
  "api",
  "admin",
  "new",
  "search",
  "about",
  "terms",
  "privacy",
];

export const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;

export const PUBLIC_BIO_MAX = 600;
export const MAX_GALLERY_PHOTOS = 8;
export const REVIEW_REPLY_MAX = 600;

export const publicSlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .refine((value) => SLUG_PATTERN.test(value), {
    error: "כתובת חוקית: אותיות באנגלית, ספרות ומקפים, 3–40 תווים",
  })
  .refine((value) => !value.includes("--"), {
    error: "אין להשתמש בשני מקפים רצופים",
  })
  .refine((value) => !RESERVED_SLUGS.includes(value), {
    error: "הכתובת הזו שמורה למערכת — בחרו אחרת",
  });

const FILENAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;

/**
 * `<pro id>/<filename>` inside the public pro-media bucket — the same shape
 * check verification documents get, for the same reason: the bucket's insert
 * policy already pins the folder, and this refuses a path that was never
 * uploaded through it before a row can point at one.
 */
export function proMediaPathSchema(userId: string) {
  return z
    .string()
    .trim()
    .max(200)
    .refine(
      (value) => {
        const parts = value.split("/");
        return (
          parts.length === 2 && parts[0] === userId && FILENAME.test(parts[1])
        );
      },
      { error: "הקובץ אינו שייך למשתמש הזה" },
    );
}

export function publicProfileSchema(userId: string) {
  const path = proMediaPathSchema(userId);

  return z.object({
    publicSlug: publicSlugSchema,
    bio: z
      .string()
      .trim()
      .max(PUBLIC_BIO_MAX, { error: "התיאור ארוך מדי" })
      .optional()
      .transform((value) => (value === "" ? undefined : value)),
    yearsExperience: z
      .union([z.literal(""), z.coerce.number()])
      .optional()
      .transform((value) =>
        value === "" || value === undefined ? undefined : Number(value),
      )
      .refine(
        (value) =>
          value === undefined ||
          (Number.isInteger(value) && value >= 0 && value <= 70),
        { error: "מספר שנות הניסיון אינו תקין" },
      ),
    avatarPath: path.nullish(),
    galleryPaths: z
      .array(path)
      .max(MAX_GALLERY_PHOTOS, {
        error: `אפשר להציג עד ${MAX_GALLERY_PHOTOS} תמונות עבודה`,
      })
      .default([]),
  });
}

export type PublicProfileInput = z.infer<
  ReturnType<typeof publicProfileSchema>
>;

/** מענה לביקורת — the pro's half of a review, and only their half. */
export const reviewReplySchema = z.object({
  reviewId: z.uuid({ error: "מזהה ביקורת לא תקין" }),
  reply: z
    .string()
    .trim()
    .min(2, { error: "כתבו תשובה קצרה" })
    .max(REVIEW_REPLY_MAX, { error: "התשובה ארוכה מדי" }),
});

/**
 * "חוזק פרופיל" — the percentage on design/screens/pro-5.1, and what is
 * missing from it.
 *
 * Six things a customer looks for, weighted evenly because there is no
 * evidence any of them matters more. It is computed rather than stored so the
 * bar cannot go stale: `pro_profiles.profile_strength_pct` exists and is
 * written by onboarding, but a number in a column is a snapshot of a form, not
 * of the profile as it stands now.
 */
export type ProfileStrengthItem = { label: string; done: boolean };

export function profileStrength(profile: {
  bio: string | null;
  avatarPath: string | null;
  galleryCount: number;
  categoryCount: number;
  yearsExperience: number | null;
  hasCustomSlug: boolean;
}): { pct: number; items: ProfileStrengthItem[] } {
  const items: ProfileStrengthItem[] = [
    { label: "תמונת פרופיל", done: profile.avatarPath !== null },
    {
      label: "תיאור מקצועי",
      done: (profile.bio ?? "").trim().length >= 40,
    },
    { label: "לפחות 2 תמונות עבודה", done: profile.galleryCount >= 2 },
    { label: "תחומי התמחות", done: profile.categoryCount > 0 },
    { label: "שנות ניסיון", done: profile.yearsExperience !== null },
    { label: "כתובת אישית לפרופיל", done: profile.hasCustomSlug },
  ];

  const done = items.filter((item) => item.done).length;
  return { pct: Math.round((done / items.length) * 100), items };
}
