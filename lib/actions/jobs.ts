"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { addressToStore, geocodeAddress } from "@/lib/maps/geocode";
import { toEwkt } from "@/lib/maps/geometry";
import { logExpectedRefusal, logServerError } from "@/lib/observability";
import { fieldErrorsOf, optional } from "@/lib/actions/formData";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, requireRole } from "@/lib/supabase/session";
import { countProsNearPoint } from "@/lib/supabase/jobs";
import { coordinatesInIsrael } from "@/lib/maps/geometry";
import { addJobDetailsSchema, createJobSchema } from "@/lib/validation/jobs";
import type { AddJobDetailsState } from "@/lib/actions/state";
import { CUSTOMER_ROUTES } from "@/lib/routes";

export type CreateJobState = {
  error?: string;
  /** Keyed by the schema's field name, so the form can sit the message under the right control. */
  fieldErrors?: Record<string, string>;
};

/** `""` is what an untouched input submits; treat it as absent, not as a value. */
/**
 * Publish a job (פרסום קריאה) — product-spec.md 3.2.
 *
 * The three things this does that the browser cannot be trusted to do:
 *
 *  1. Re-validates every field with Zod, including that each media path sits
 *     inside the caller's own storage folder.
 *  2. Resolves the address to coordinates server-side. Places Autocomplete's
 *     answer is accepted only after a range check; with no Maps key the
 *     gazetteer fallback runs instead, and the job is still saved with a real
 *     point in `location`.
 *  3. Writes `customer_id` from the session. The insert policy on `jobs`
 *     independently requires it to equal `auth.uid()`, so a forged value in the
 *     form cannot post a job in somebody else's name — the pgTAP suite proves
 *     that one.
 *
 * There is no price anywhere in this path, and there is no price column on
 * `jobs`. A job's price only ever comes from the bid the customer picks
 * (Phase 4) plus approved price updates (Phase 5).
 */
export async function createJob(
  _prevState: CreateJobState,
  formData: FormData,
): Promise<CreateJobState> {
  const user = await requireRole("customer");

  const parsed = createJobSchema(user.id).safeParse({
    categoryId: optional(formData.get("categoryId")),
    description: formData.get("description") ?? "",
    preferredTime: optional(formData.get("preferredTime")),
    addressText: formData.get("addressText") ?? "",
    lat: optional(formData.get("lat")),
    lng: optional(formData.get("lng")),
    photoPaths: formData.getAll("photoPath").filter((v) => v !== ""),
    videoPath: optional(formData.get("videoPath")),
    voiceNotePath: optional(formData.get("voiceNotePath")),
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      fieldErrors[key] ??= issue.message;
    }
    return {
      error: "יש למלא את כל השדות המסומנים לפני הפרסום.",
      fieldErrors,
    };
  }

  const input = parsed.data;
  const supabase = await createClient();

  // The category has to exist. `categories` is world-readable, so this is a
  // plain lookup rather than a privileged one — and the foreign key would
  // catch it anyway; this just turns a constraint violation into Hebrew.
  const { data: category } = await supabase
    .from("categories")
    .select("id")
    .eq("id", input.categoryId)
    .maybeSingle();

  if (!category) {
    return {
      error: "התחום שנבחר אינו קיים.",
      fieldErrors: { categoryId: "יש לבחור תחום" },
    };
  }

  let point;
  try {
    point = await geocodeAddress(
      input.addressText,
      input.lat != null && input.lng != null
        ? { lat: input.lat, lng: input.lng }
        : null,
    );
  } catch (cause) {
    // Ours, not theirs: no Maps key where one was required, or Google
    // unreachable. Telling the customer to write a fuller address would be
    // asking them to fix a deployment.
    logServerError("jobs.postJob.geocode", cause, {
      categoryId: input.categoryId,
    });
    return { error: "תקלה זמנית באיתור הכתובת. נסו שוב בעוד רגע." };
  }

  if (!point) {
    // Theirs, and answerable: no locality in the address anybody recognises.
    // Logged as a refusal rather than an error — it is the product working,
    // and the rate of it is what would say the gazetteer has a gap.
    logExpectedRefusal("jobs.postJob.unknownAddress", "no locality matched", {
      categoryId: input.categoryId,
    });
    return {
      error: "לא זיהינו את היישוב בכתובת.",
      fieldErrors: {
        addressText: "הוסיפו עיר בסוף הכתובת, למשל: הרצל 5, נתניה",
      },
    };
  }

  const { data: job, error } = await supabase
    .from("jobs")
    .insert({
      customer_id: user.id,
      category_id: input.categoryId,
      description: input.description,
      photo_urls: input.photoPaths,
      video_url: input.videoPath ?? null,
      voice_note_url: input.voiceNotePath ?? null,
      // EWKT: PostGIS parses it on the way into the geography column.
      location: toEwkt(point.lat, point.lng),
      address_text: addressToStore(input.addressText, point),
      preferred_time: input.preferredTime,
      // `status` is deliberately absent: Phase 9 revoked the INSERT grant on
      // it, so a posted job takes its 'open' default the same way a bid takes
      // its 45-minute `expires_at`. A status the client may not change is a
      // status the client may not assert either.
    })
    .select("id")
    .single();

  if (error || !job) {
    logServerError(
      "jobs.postJob",
      error ?? new Error("insert returned no row"),
      {
        customerId: user.id,
        categoryId: input.categoryId,
      },
    );
    return {
      error: "פרסום הקריאה נכשל. נסו שוב בעוד רגע.",
    };
  }

  revalidatePath("/account");
  redirect(`/new-request/published/${job.id}`);
}

/**
 * "כמה בעלי מקצוע מכסים את הכתובת הזו" — the number under the address field,
 * asked live while the customer is still typing.
 *
 * It exists because the first time this product tells somebody how many pros
 * cover them used to be *after* they had written a description, attached a
 * photo and pressed publish — and on launch day, in most towns, that number is
 * zero.
 *
 * It used to take a radius too, and take it from the customer. That question
 * went away on 11.9.2026: the customer does not know how far a plumber will
 * drive, has no way to find out, and a number they guessed was quietly
 * narrowing their own market. Every pro has already answered it for themselves.
 *
 * A read rather than a write, but the arguments are still checked: they come
 * from a browser, and `coordinatesInIsrael()` is the same gate every point
 * crosses before it reaches a `geography` column (CLAUDE.md section 3).
 * Null means "we could not ask" and the screen says nothing — that is a
 * different sentence from "nobody covers you", and only one of them is the
 * customer's problem.
 *
 * Since Phase 13.7 the form is open to visitors who have not signed in, and
 * this is called from it for them too. `requireRole()` would answer that with
 * a redirect — from inside a server action, which navigates somebody who is
 * half-way through describing a leak to the login page. So a caller who is not
 * a customer gets null, the screen stays silent, and `pros_near_point()` stays
 * granted to `authenticated` only, exactly as Phase 12 decided.
 */
export async function countProsCovering(
  lat: number,
  lng: number,
): Promise<number | null> {
  const user = await getCurrentUser();
  if (user?.role !== "customer") return null;

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (!coordinatesInIsrael(lat, lng)) return null;

  return countProsNearPoint(lat, lng);
}

/**
 * "הוסיפו פרטים לקריאה" — text and photos added to a call that has not had a
 * pro take it (Phase 13.7).
 *
 * The customer is the one the quiet-call nudge speaks to, and without this the
 * nudge would suggest something they could not do. `add_job_details()` appends
 * and never rewrites: pros may already have priced what was written, and an
 * offer made against one description must not come to mean another.
 */
export async function addJobDetails(
  _prevState: AddJobDetailsState,
  formData: FormData,
): Promise<AddJobDetailsState> {
  const user = await requireRole("customer");

  const parsed = addJobDetailsSchema(user.id).safeParse({
    jobId: formData.get("jobId"),
    text: formData.get("text") ?? "",
    photoPaths: formData.getAll("photoPath").filter((value) => value !== ""),
  });

  if (!parsed.success) {
    logExpectedRefusal("jobs.addJobDetails.invalid", parsed.error, {
      jobId: String(formData.get("jobId") ?? ""),
    });
    return {
      error: "לא הצלחנו להוסיף את הפרטים.",
      fieldErrors: fieldErrorsOf(parsed.error),
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("add_job_details", {
    p_job_id: parsed.data.jobId,
    p_text: parsed.data.text,
    p_photo_paths: parsed.data.photoPaths,
  });

  if (error) {
    const context = { jobId: parsed.data.jobId };
    if (error.code === "22023") {
      logExpectedRefusal("jobs.addJobDetails", error, context);
      return {
        error: error.message.includes("too many photos")
          ? "לקריאה כבר יש את מספר התמונות המרבי."
          : "בעל מקצוע כבר לקח את הקריאה, ולכן אי אפשר להוסיף לה פרטים. אפשר לכתוב לו בצ׳אט.",
      };
    }
    logServerError("jobs.addJobDetails", error, context);
    return { error: "לא הצלחנו להוסיף את הפרטים. נסו שוב בעוד רגע." };
  }

  revalidatePath(CUSTOMER_ROUTES.offers(parsed.data.jobId));
  return { savedAt: Date.now() };
}
