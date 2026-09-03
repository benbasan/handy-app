"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { geocodeAddress, toEwkt } from "@/lib/maps/geocode";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/supabase/session";
import { createJobSchema } from "@/lib/validation/jobs";

export type CreateJobState = {
  error?: string;
  /** Keyed by the schema's field name, so the form can sit the message under the right control. */
  fieldErrors?: Record<string, string>;
};

/** `""` is what an untouched input submits; treat it as absent, not as a value. */
function optional(value: FormDataEntryValue | null): string | undefined {
  const text = typeof value === "string" ? value.trim() : "";
  return text === "" ? undefined : text;
}

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
  } catch {
    return {
      error:
        "לא הצלחנו לאתר את הכתובת על המפה. נסו כתובת מלאה יותר, או פנו לתמיכה.",
      fieldErrors: { addressText: "כתובת שלא ניתן לאתר" },
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
      address_text: point.formattedAddress ?? input.addressText,
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
    return {
      error: "פרסום הקריאה נכשל. נסו שוב בעוד רגע.",
    };
  }

  revalidatePath("/account");
  redirect(`/new-request/published/${job.id}`);
}
