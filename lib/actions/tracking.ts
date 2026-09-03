"use server";

import { revalidatePath } from "next/cache";
import type { JobProgressState } from "@/lib/actions/state";
import { PRO_ROUTES } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/supabase/session";
import {
  markJobInProgressSchema,
  reportLocationSchema,
} from "@/lib/validation/tracking";

/**
 * The write paths for live tracking — docs/architecture.md section 5.
 *
 * Both go through a Server Action rather than an RPC from the browser, so that
 * every write in the app has a Zod schema in front of it (CLAUDE.md section 3)
 * even where the database re-checks the same thing. A position is a sensor
 * reading, which is exactly the kind of input worth range-checking twice.
 */

/**
 * One ping from the pro's device while they are on the way.
 *
 * `report_job_location()` decides everything that matters: that the caller is
 * the pro assigned to this job, that the job is still live, and that the
 * coordinate is inside Israel. This returns a plain boolean rather than an
 * error string — the caller is a `setInterval`, not a form, and a dropped ping
 * is corrected by the next one fifteen seconds later.
 */
export async function reportJobLocation(input: {
  jobId: string;
  lat: number;
  lng: number;
  accuracyM?: number | null;
  etaMinutes?: number | null;
}): Promise<boolean> {
  await requireRole("pro");

  const parsed = reportLocationSchema.safeParse(input);
  if (!parsed.success) return false;

  const supabase = await createClient();

  const { error } = await supabase.rpc("report_job_location", {
    p_job_id: parsed.data.jobId,
    p_lat: parsed.data.lat,
    p_lng: parsed.data.lng,
    p_accuracy_m: parsed.data.accuracyM ?? undefined,
    p_eta_minutes: parsed.data.etaMinutes ?? undefined,
  });

  // Deliberately no revalidatePath: the customer's screen is woken by the
  // Realtime subscription on `job_locations`, and re-rendering the pro's own
  // page every fifteen seconds would be work nobody asked for.
  return !error;
}

/**
 * "לחץ: הגעתי ללקוח" — the progress bar moves from בדרך ללקוח to בעבודה.
 *
 * `jobs.status` lost its column grant in Phase 4, so this is a checked
 * function: the assigned pro, this one step, one direction. Completion is
 * Phase 6's, together with the commission row it has to create.
 */
export async function markJobInProgress(
  _prevState: JobProgressState,
  formData: FormData,
): Promise<JobProgressState> {
  await requireRole("pro");

  const parsed = markJobInProgressSchema.safeParse({
    jobId: formData.get("jobId"),
  });

  if (!parsed.success) {
    return { error: "מזהה קריאה לא תקין." };
  }

  const supabase = await createClient();

  const { data, error } = await supabase.rpc("mark_job_in_progress", {
    p_job_id: parsed.data.jobId,
  });

  if (error) {
    return {
      error: "לא ניתן לעדכן את סטטוס העבודה: ייתכן שהיא כבר אינה משובצת אליך.",
    };
  }

  revalidatePath(PRO_ROUTES.manageJob(parsed.data.jobId));
  revalidatePath(PRO_ROUTES.myJobs);

  return { status: data ?? undefined };
}
