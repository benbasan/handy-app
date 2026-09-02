"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { geocodeAddress, toEwkt } from "@/lib/maps/geocode";
import type { ProFormState } from "@/lib/actions/state";
import { PRO_ROUTES } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/supabase/session";
import {
  availabilitySchema,
  dismissJobSchema,
  payoutSchema,
  practiceBidSchema,
  proDocumentsSchema,
  proProfileSchema,
  type VerificationDocType,
} from "@/lib/validation/pros";
import type { z } from "zod";

/**
 * The pro's write paths — product-spec.md 4.2 (onboarding) and 4.9
 * (availability).
 *
 * Two rules run through all of them:
 *
 *  * Every field is re-validated with Zod here, whatever the browser already
 *    refused (CLAUDE.md section 3). Document paths are re-checked against the
 *    caller's own storage folder, which is the same thing the bucket's insert
 *    policy enforces — stated twice on purpose.
 *  * Nothing here writes `verification_status`. No client role holds a grant
 *    on that column at all; the two legal transitions are the security-definer
 *    functions `submit_pro_for_approval()` and `set_pro_verification()`, which
 *    check the caller inside the database.
 */

function optional(value: FormDataEntryValue | null): string | undefined {
  const text = typeof value === "string" ? value.trim() : "";
  return text === "" ? undefined : text;
}

function fieldErrorsOf(error: z.ZodError): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    fieldErrors[key] ??= issue.message;
  }
  return fieldErrors;
}

const INVALID: ProFormState = {
  error: "יש למלא את כל השדות המסומנים לפני ההמשך.",
};

/**
 * Where the onboarding wizard is up to. Only ever moves forward: going back to
 * re-read step 2 must not throw away the fact that step 4 was already done.
 */
async function markStep(userId: string, step: number): Promise<void> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("pro_profiles")
    .select("onboarding_step")
    .maybeSingle();

  if ((data?.onboarding_step ?? 0) >= step) return;

  await supabase
    .from("pro_profiles")
    .update({ onboarding_step: step })
    .eq("user_id", userId);
}

/** The profile half of both /pro/join and onboarding step 2. */
async function writeProfile(
  userId: string,
  input: z.infer<typeof proProfileSchema>,
): Promise<ProFormState | null> {
  const supabase = await createClient();

  let point;
  try {
    point = await geocodeAddress(
      input.addressText,
      input.lat != null && input.lng != null
        ? { lat: input.lat, lng: input.lng }
        : null,
    );
  } catch {
    return {
      error: "לא הצלחנו לאתר את הכתובת על המפה. נסו כתובת מלאה יותר.",
      fieldErrors: { addressText: "כתובת שלא ניתן לאתר" },
    };
  }

  const { error: nameError } = await supabase
    .from("profiles")
    .update({ full_name: input.fullName })
    .eq("id", userId);

  const { error: profileError } = await supabase
    .from("pro_profiles")
    .update({
      bio: input.bio ?? null,
      radius_km: input.radiusKm,
      service_address_text: point.formattedAddress ?? input.addressText,
      // EWKT: PostGIS parses it on the way into the geography column.
      service_point: toEwkt(point.lat, point.lng),
    })
    .eq("user_id", userId);

  if (nameError || profileError) {
    return { error: "שמירת הפרופיל נכשלה. נסו שוב בעוד רגע." };
  }

  // The trades are a set, so the honest write is "replace with what was
  // chosen" rather than a diff. Both statements run under the pro's own RLS,
  // which pins them to their own rows.
  await supabase.from("pro_categories").delete().eq("pro_id", userId);

  const { error: categoryError } = await supabase.from("pro_categories").insert(
    input.categoryIds.map((categoryId) => ({
      pro_id: userId,
      category_id: categoryId,
    })),
  );

  if (categoryError) {
    return {
      error: "אחד התחומים שנבחרו אינו קיים.",
      fieldErrors: { categoryIds: "יש לבחור תחום קיים" },
    };
  }

  return null;
}

function parseProfile(formData: FormData) {
  return proProfileSchema.safeParse({
    fullName: formData.get("fullName") ?? "",
    bio: formData.get("bio") ?? "",
    categoryIds: formData.getAll("categoryId").filter((v) => v !== ""),
    radiusKm: formData.get("radiusKm"),
    addressText: formData.get("addressText") ?? "",
    lat: optional(formData.get("lat")),
    lng: optional(formData.get("lng")),
  });
}

/** The document half of both /pro/join and onboarding step 3. */
async function writeDocuments(
  userId: string,
  paths: Partial<Record<VerificationDocType, string | null | undefined>>,
): Promise<ProFormState | null> {
  const supabase = await createClient();

  const rows = (
    Object.entries(paths) as Array<
      [VerificationDocType, string | null | undefined]
    >
  )
    .filter(([, path]) => Boolean(path))
    .map(([docType, path]) => ({
      pro_id: userId,
      doc_type: docType,
      file_url: path as string,
    }));

  if (rows.length === 0) return null;

  const { error } = await supabase.from("verification_documents").insert(rows);

  if (error) {
    return { error: "שמירת המסמכים נכשלה. נסו שוב בעוד רגע." };
  }

  return null;
}

function parseDocuments(userId: string, formData: FormData) {
  return proDocumentsSchema(userId).safeParse({
    profilePhotoPath: optional(formData.get("profilePhotoPath")),
    idCardPath: optional(formData.get("idCardPath")),
    licensePath: optional(formData.get("licensePath")),
    insurancePath: optional(formData.get("insurancePath")),
  });
}

/**
 * /pro/join — design/screens/pro-1.3-signup-verification.png.
 *
 * The design's fast path: details, documents, trades and area on one screen,
 * then straight into the guided onboarding. It writes exactly what steps 2 and
 * 3 of that wizard write, so a pro who came this way resumes at step 4 rather
 * than being asked the same questions twice.
 */
export async function saveProJoin(
  _prevState: ProFormState,
  formData: FormData,
): Promise<ProFormState> {
  const user = await requireRole("pro");

  const profile = parseProfile(formData);
  const documents = parseDocuments(user.id, formData);

  if (!profile.success || !documents.success) {
    return {
      ...INVALID,
      fieldErrors: {
        ...(profile.success ? {} : fieldErrorsOf(profile.error)),
        ...(documents.success ? {} : fieldErrorsOf(documents.error)),
      },
    };
  }

  const profileFailure = await writeProfile(user.id, profile.data);
  if (profileFailure) return profileFailure;

  const documentFailure = await writeDocuments(user.id, {
    profile_photo: documents.data.profilePhotoPath,
    id_card: documents.data.idCardPath,
    license: documents.data.licensePath,
    insurance: documents.data.insurancePath,
  });
  if (documentFailure) return documentFailure;

  await markStep(user.id, 3);
  revalidatePath(PRO_ROUTES.dashboard);
  redirect(`${PRO_ROUTES.onboarding}?step=4`);
}

/** Onboarding step 2 — פרופיל מקצועי. */
export async function saveProProfile(
  _prevState: ProFormState,
  formData: FormData,
): Promise<ProFormState> {
  const user = await requireRole("pro");

  const parsed = parseProfile(formData);
  if (!parsed.success) {
    return { ...INVALID, fieldErrors: fieldErrorsOf(parsed.error) };
  }

  const failure = await writeProfile(user.id, parsed.data);
  if (failure) return failure;

  await markStep(user.id, 2);
  revalidatePath(PRO_ROUTES.dashboard);
  redirect(`${PRO_ROUTES.onboarding}?step=3`);
}

/** Onboarding step 3 — מסמכים ואימות. */
export async function saveProDocuments(
  _prevState: ProFormState,
  formData: FormData,
): Promise<ProFormState> {
  const user = await requireRole("pro");

  const parsed = parseDocuments(user.id, formData);
  if (!parsed.success) {
    return { ...INVALID, fieldErrors: fieldErrorsOf(parsed.error) };
  }

  const failure = await writeDocuments(user.id, {
    profile_photo: parsed.data.profilePhotoPath,
    id_card: parsed.data.idCardPath,
    license: parsed.data.licensePath,
    insurance: parsed.data.insurancePath,
  });
  if (failure) return failure;

  await markStep(user.id, 3);
  revalidatePath(PRO_ROUTES.dashboard);
  redirect(`${PRO_ROUTES.onboarding}?step=4`);
}

/**
 * Onboarding step 4 — תרגול הגשת הצעה.
 *
 * product-spec.md 4.2 is explicit that this is a simulation on a sample job
 * and is never sent to a real customer, so nothing here touches `bids`. It is
 * still validated: the practice screen shows the pro the 12% commission
 * arithmetic on the number they typed, and teaching that with a NaN in it
 * would be worse than not teaching it.
 */
export async function savePracticeBid(
  _prevState: ProFormState,
  formData: FormData,
): Promise<ProFormState> {
  const user = await requireRole("pro");

  const parsed = practiceBidSchema.safeParse({
    price: formData.get("price"),
    etaMinutes: formData.get("etaMinutes"),
    note: formData.get("note") ?? "",
  });

  if (!parsed.success) {
    return { ...INVALID, fieldErrors: fieldErrorsOf(parsed.error) };
  }

  await markStep(user.id, 4);
  redirect(`${PRO_ROUTES.onboarding}?step=5`);
}

/**
 * Onboarding step 5 — תשלומים ומוכנות, and the submission itself.
 *
 * The status change is `submit_pro_for_approval()`, which re-checks
 * completeness in the database. That matters because this action is not the
 * only way to reach the API, and "did they actually upload an ID?" is not a
 * question a form can be trusted to answer.
 */
export async function submitProProfile(
  _prevState: ProFormState,
  formData: FormData,
): Promise<ProFormState> {
  const user = await requireRole("pro");

  const parsed = payoutSchema.safeParse({
    paymentMethods: formData.getAll("paymentMethod").filter((v) => v !== ""),
    bankName: formData.get("bankName") ?? "",
    bankBranch: formData.get("bankBranch") ?? "",
    accountLast4: formData.get("accountLast4") ?? "",
  });

  if (!parsed.success) {
    return { ...INVALID, fieldErrors: fieldErrorsOf(parsed.error) };
  }

  const supabase = await createClient();

  const { error: payoutError } = await supabase
    .from("pro_profiles")
    .update({
      payment_methods: parsed.data.paymentMethods,
      payout_bank_name: parsed.data.bankName,
      payout_bank_branch: parsed.data.bankBranch,
      payout_account_last4: parsed.data.accountLast4,
    })
    .eq("user_id", user.id);

  if (payoutError) {
    return { error: "שמירת פרטי הגבייה נכשלה. נסו שוב בעוד רגע." };
  }

  const { error } = await supabase.rpc("submit_pro_for_approval");

  if (error) {
    // The database's own completeness check. It is the authority, so its
    // refusal is reported as the missing piece rather than as a generic fault.
    return {
      error:
        "לא ניתן לשלוח את הפרופיל לאישור עדיין: דרושים תחום התמחות אחד לפחות, כתובת בסיס, ומסמך זיהוי. חזרו לשלבים הקודמים והשלימו אותם.",
    };
  }

  revalidatePath(PRO_ROUTES.dashboard);
  redirect(`${PRO_ROUTES.dashboard}?submitted=1`);
}

/** Onboarding step 1 — ברוך הבא. Nothing to save but the fact it was read. */
export async function startOnboarding(): Promise<void> {
  const user = await requireRole("pro");
  await markStep(user.id, 1);
  redirect(`${PRO_ROUTES.onboarding}?step=2`);
}

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
    return { ...INVALID, fieldErrors: fieldErrorsOf(parsed.error) };
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
