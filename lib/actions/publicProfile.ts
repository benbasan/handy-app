"use server";

import { revalidatePath } from "next/cache";
import type { ProFormState, ReviewReplyState } from "@/lib/actions/state";
import { MARKETING_ROUTES, PRO_ROUTES } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/supabase/session";
import {
  publicProfileSchema,
  reviewReplySchema,
} from "@/lib/validation/publicProfile";

/**
 * "הפרופיל הציבורי שלי" — design/screens/pro-5.1-public-profile-edit.png.
 *
 * Everything this writes is the pro's own description of themselves, which is
 * why it is a plain column update under RLS rather than another security
 * definer function: `pro_profiles` grants `update (public_slug, avatar_path,
 * gallery_paths, years_experience)` and the row policy pins it to
 * `auth.uid()`. What the database will not accept from here — the rating, the
 * completed count, the verification status — has never had a grant at all.
 *
 * The slug is the one field with a shape the database also insists on: a check
 * constraint refuses the app's own `/pro/…` paths and a unique index refuses a
 * name somebody else took. Both come back as an error code, and both get a
 * sentence under the field rather than a stack trace.
 */
export async function savePublicProfile(
  _prevState: ProFormState,
  formData: FormData,
): Promise<ProFormState> {
  const user = await requireRole("pro");

  const parsed = publicProfileSchema(user.id).safeParse({
    publicSlug: formData.get("publicSlug"),
    bio: formData.get("bio"),
    yearsExperience: formData.get("yearsExperience"),
    avatarPath: formData.get("avatarPath") || null,
    galleryPaths: formData
      .getAll("galleryPaths")
      .map(String)
      .filter((value) => value !== ""),
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      fieldErrors[key] ??= issue.message;
    }
    return { fieldErrors, error: "יש לתקן את השדות המסומנים." };
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from("pro_profiles")
    .update({
      public_slug: parsed.data.publicSlug,
      bio: parsed.data.bio ?? null,
      years_experience: parsed.data.yearsExperience ?? null,
      avatar_path: parsed.data.avatarPath ?? null,
      gallery_paths: parsed.data.galleryPaths,
    })
    .eq("user_id", user.id);

  if (error) {
    // 23505 is the unique index on public_slug, 23514 the check constraint
    // that keeps a slug from colliding with one of the app's own /pro/ paths.
    if (error.code === "23505") {
      return {
        fieldErrors: { publicSlug: "הכתובת הזו כבר תפוסה. נסו וריאציה." },
        error: "הכתובת הזו כבר תפוסה.",
      };
    }
    if (error.code === "23514") {
      return {
        fieldErrors: { publicSlug: "הכתובת הזו אינה חוקית." },
        error: "הכתובת הזו אינה חוקית.",
      };
    }
    return { error: "שמירת הפרופיל נכשלה. נסו שוב." };
  }

  revalidatePath(PRO_ROUTES.profile);
  revalidatePath(MARKETING_ROUTES.proProfile(parsed.data.publicSlug));
  return { saved: true };
}

/**
 * "מענה לביקורות" — product-spec.md 4.8.
 *
 * `reply_to_review()` rather than an update, because the two halves of a
 * review belong to different people: the customer wrote the row, the pro
 * writes the answer, and neither may touch the other's half. There is no
 * column grant on `pro_reply` for anybody.
 */
export async function replyToReview(
  _prevState: ReviewReplyState,
  formData: FormData,
): Promise<ReviewReplyState> {
  await requireRole("pro");

  const parsed = reviewReplySchema.safeParse({
    reviewId: formData.get("reviewId"),
    reply: formData.get("reply"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "הטופס אינו תקין." };
  }

  const supabase = await createClient();

  const { error } = await supabase.rpc("reply_to_review", {
    p_review_id: parsed.data.reviewId,
    p_reply: parsed.data.reply,
  });

  if (error) {
    return { error: "לא ניתן להגיב על הביקורת הזו." };
  }

  revalidatePath(PRO_ROUTES.profile);
  return { repliedTo: parsed.data.reviewId };
}
