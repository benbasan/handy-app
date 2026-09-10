"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { addressToStore, geocodeAddress } from "@/lib/maps/geocode";
import { toEwkt } from "@/lib/maps/geometry";
import { logExpectedRefusal, logServerError } from "@/lib/observability";
import { optional } from "@/lib/actions/formData";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/supabase/session";
import { countProsNearPoint } from "@/lib/supabase/jobs";
import { coordinatesInIsrael } from "@/lib/maps/geometry";
import {
  createJobSchema,
  nextSearchRadius,
  SEARCH_RADIUS_LADDER,
} from "@/lib/validation/jobs";

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
    searchRadiusKm: formData.get("searchRadiusKm"),
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
      search_radius_km: input.searchRadiusKm,
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
 * "כמה בעלי מקצוע ברדיוס הזה" — the number under the radius chips, asked live
 * while the customer is still choosing.
 *
 * It exists because the first time this product tells somebody how many pros
 * cover them is currently *after* they have written a description, attached a
 * photo and pressed publish — and on launch day, in most towns, that number is
 * zero. Asking it a step earlier turns the radius from a guess into a choice.
 *
 * A read rather than a write, but the arguments are still checked: they come
 * from a browser, and `coordinatesInIsrael()` is the same gate every point
 * crosses before it reaches a `geography` column (CLAUDE.md section 3).
 * Null means "we could not ask" and the screen says nothing — that is a
 * different sentence from "nobody covers you", and only one of them is the
 * customer's problem.
 */
export async function countProsForRadius(
  lat: number,
  lng: number,
  radiusKm: number,
): Promise<number | null> {
  await requireRole("customer");

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (!coordinatesInIsrael(lat, lng)) return null;
  if (!(SEARCH_RADIUS_LADDER as readonly number[]).includes(radiusKm)) {
    return null;
  }

  return countProsNearPoint(lat, lng, radiusKm);
}

export type WidenRadiusState = { error?: string };

/**
 * "הרחיבו את הרדיוס" — one rung up the ladder, from the offers screen.
 *
 * This is the only action a customer has when the honest answer to "how many
 * pros got my call" is none, and before it existed the screen said
 * "אין צורך לרענן" to somebody who could wait for ever. `search_radius_km` was
 * insertable and never updatable, so the one number that could rescue the call
 * was frozen at posting time.
 *
 * A plain `update` under RLS rather than a `security definer` function, and
 * that is the considered choice: how far to broadcast their own call is the
 * customer's to say, in the same family as `description` — the column grant
 * added in `20260914120000_liquidity_and_search_radius.sql` says so, the
 * "customer updates own" policy scopes it to their row, and the check
 * constraint bounds the value. Nothing here is a status somebody must not set
 * themselves, which is what CLAUDE.md section 3 reserves a function for.
 *
 * The next rung is computed here rather than taken from the form: which radius
 * follows 10 is not a decision a browser gets to make.
 */
export async function widenSearchRadius(
  _prevState: WidenRadiusState,
  formData: FormData,
): Promise<WidenRadiusState> {
  await requireRole("customer");

  const jobId = String(formData.get("jobId") ?? "");
  if (!jobId) return { error: "לא נמצאה הקריאה." };

  const supabase = await createClient();

  const { data: job, error: readError } = await supabase
    .from("jobs")
    .select("search_radius_km, status, selected_bid_id")
    .eq("id", jobId)
    .maybeSingle();

  if (readError) {
    logServerError("jobs.widenSearchRadius.read", readError, { jobId });
    return { error: "לא הצלחנו לקרוא את הקריאה. נסו שוב." };
  }

  // RLS answers "not yours" as "no such row", which is the correct reply here
  // too — the screen must not confirm that somebody else's job id exists.
  if (!job) return { error: "לא נמצאה הקריאה." };

  if (job.selected_bid_id !== null) {
    logExpectedRefusal(
      "jobs.widenSearchRadius",
      new Error("job already assigned"),
      { jobId },
    );
    return { error: "הקריאה כבר שובצה לבעל מקצוע — אין את מי להוסיף." };
  }

  const wider = nextSearchRadius(job.search_radius_km);

  if (wider === null) {
    logExpectedRefusal(
      "jobs.widenSearchRadius",
      new Error("already at the widest rung"),
      { jobId, radiusKm: job.search_radius_km },
    );
    return { error: "הקריאה כבר משודרת ברדיוס הרחב ביותר." };
  }

  const { error } = await supabase
    .from("jobs")
    .update({ search_radius_km: wider })
    .eq("id", jobId);

  if (error) {
    logServerError("jobs.widenSearchRadius", error, { jobId, radiusKm: wider });
    return { error: "לא הצלחנו להרחיב את הרדיוס. נסו שוב." };
  }

  revalidatePath(`/requests/${jobId}/offers`);
  revalidatePath("/account");
  return {};
}
