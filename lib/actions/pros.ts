"use server";

import { revalidatePath } from "next/cache";
import { fieldErrorsOf } from "@/lib/actions/formData";
import { INVALID_PRO_FORM } from "@/lib/actions/state";
import type { ProFormState } from "@/lib/actions/state";
import { logServerError } from "@/lib/observability";
import { PRO_ROUTES } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/supabase/session";
import { availabilitySchema, dismissJobSchema } from "@/lib/validation/pros";

/**
 * What a pro changes about themselves after they are through the door —
 * product-spec.md 4.9 — plus the two writes behind the feed's "לא מתאים לי".
 *
 * The onboarding wizard used to live here too and is now in
 * lib/actions/proOnboarding.ts; between them this file was ten server actions
 * long. Nothing is shared but `ProFormState`, which is the sign the split was
 * along a real seam rather than a line count.
 *
 * As in the wizard: nothing here writes `verification_status`, and
 * `accepting_jobs` is the one setting the database's own gate reads
 * (`pro_serves_job()` requires it), so switching it off empties the feed in
 * the policy rather than in a query.
 */

/**
 * The availability screen — design/screens/pro-5.2-availability-settings.png.
 *
 * `accepting_jobs` is the one setting with a direct effect on the database's
 * own gate: `pro_serves_job()` requires it, so switching it off empties the
 * feed in the policy rather than in the query. product-spec.md 4.9 promises
 * that turning it off does not harm the pro's rating, and nothing here touches
 * `rating_avg` — which a client cannot write anyway.
 */
export async function saveAvailability(
  _prevState: ProFormState,
  formData: FormData,
): Promise<ProFormState> {
  const user = await requireRole("pro");

  const parsed = availabilitySchema.safeParse({
    acceptingJobs: formData.get("acceptingJobs") === "on",
    workDays: formData.getAll("workDay").filter((v) => v !== ""),
    workStartTime: formData.get("workStartTime") ?? "",
    workEndTime: formData.get("workEndTime") ?? "",
    radiusKm: formData.get("radiusKm"),
    categoryIds: formData.getAll("categoryId").filter((v) => v !== ""),
  });

  if (!parsed.success) {
    return { ...INVALID_PRO_FORM, fieldErrors: fieldErrorsOf(parsed.error) };
  }

  if (parsed.data.workEndTime <= parsed.data.workStartTime) {
    return {
      error: "שעת הסיום חייבת להיות מאוחרת משעת ההתחלה.",
      fieldErrors: { workEndTime: "שעת סיום מוקדמת משעת ההתחלה" },
    };
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from("pro_profiles")
    .update({
      accepting_jobs: parsed.data.acceptingJobs,
      work_days: parsed.data.workDays,
      work_start_time: parsed.data.workStartTime,
      work_end_time: parsed.data.workEndTime,
      radius_km: parsed.data.radiusKm,
    })
    .eq("user_id", user.id);

  if (error) {
    logServerError("pros.saveAvailability", error, { proId: user.id });
    return { error: "שמירת ההגדרות נכשלה. נסו שוב בעוד רגע." };
  }

  await supabase.from("pro_categories").delete().eq("pro_id", user.id);
  const { error: categoryError } = await supabase.from("pro_categories").insert(
    parsed.data.categoryIds.map((categoryId) => ({
      pro_id: user.id,
      category_id: categoryId,
    })),
  );

  if (categoryError) {
    logServerError("pros.saveAvailability.categories", categoryError, {
      proId: user.id,
      categoryCount: parsed.data.categoryIds.length,
    });
    return {
      error: "אחד התחומים שנבחרו אינו קיים.",
      fieldErrors: { categoryIds: "יש לבחור תחום קיים" },
    };
  }

  revalidatePath(PRO_ROUTES.settings);
  revalidatePath(PRO_ROUTES.jobs);
  return { saved: true };
}

/** The "זמין לקריאות" switch in the pro header. */
export async function setAcceptingJobs(formData: FormData): Promise<void> {
  const user = await requireRole("pro");
  const next = formData.get("accepting") === "1";

  const supabase = await createClient();
  await supabase
    .from("pro_profiles")
    .update({ accepting_jobs: next })
    .eq("user_id", user.id);

  revalidatePath(PRO_ROUTES.dashboard);
  revalidatePath(PRO_ROUTES.jobs);
  revalidatePath(PRO_ROUTES.settings);
}

/** "לא מתאים לי" on a feed card — the pro's own view state, nobody else's. */
export async function dismissJob(formData: FormData): Promise<void> {
  const user = await requireRole("pro");

  const parsed = dismissJobSchema.safeParse({ jobId: formData.get("jobId") });
  if (!parsed.success) return;

  const supabase = await createClient();
  await supabase
    .from("job_dismissals")
    .insert({ pro_id: user.id, job_id: parsed.data.jobId });

  revalidatePath(PRO_ROUTES.jobs);
}

export async function restoreDismissedJobs(): Promise<void> {
  const user = await requireRole("pro");

  const supabase = await createClient();
  await supabase.from("job_dismissals").delete().eq("pro_id", user.id);

  revalidatePath(PRO_ROUTES.jobs);
}
