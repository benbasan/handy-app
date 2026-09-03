import { createClient } from "./server";

/**
 * Read side of the live-tracking flow — docs/architecture.md section 5.
 *
 * Two of the three readers here are security definer functions, for the reason
 * every definer function in this codebase exists: the screen needs one fact
 * about the other person, and the honest answer to that is a function
 * returning exactly that fact rather than a policy that opens `profiles`.
 *
 * `job_locations` is the exception — it is a real table with real policies, so
 * it is read directly and the RLS decides who sees the pin.
 */

export type JobLocation = {
  jobId: string;
  proId: string;
  latitude: number;
  longitude: number;
  accuracyM: number | null;
  etaMinutes: number | null;
  updatedAt: string;
};

/**
 * Where the assigned pro is now, or null if they have not reported yet.
 *
 * The two derived coordinate columns are read rather than the geography:
 * PostgREST hands a `geography` to the client as hex EWKB, and the map would
 * otherwise have to decode it in JS — the same arrangement `jobs` uses.
 */
export async function getJobLocation(
  jobId: string,
): Promise<JobLocation | null> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("job_locations")
    .select(
      "job_id, pro_id, latitude, longitude, accuracy_m, eta_minutes, updated_at",
    )
    .eq("job_id", jobId)
    .maybeSingle();

  if (!data || data.latitude === null || data.longitude === null) return null;

  return {
    jobId: data.job_id,
    proId: data.pro_id,
    latitude: data.latitude,
    longitude: data.longitude,
    accuracyM: data.accuracy_m,
    etaMinutes: data.eta_minutes,
    updatedAt: data.updated_at,
  };
}

/** The other side of an assigned job — the "חיוג ☎" button on both screens. */
export type JobContact = {
  id: string;
  name: string | null;
  phone: string;
  role: "pro" | "customer";
};

/**
 * A phone number lives on `profiles`, which has no cross-user SELECT policy
 * and must not get one. It is not public information; it is disclosed by the
 * fact that these two people have an assigned job together, which is exactly
 * the condition `job_contact()` checks before returning a name and a number
 * and nothing else.
 */
export async function getJobContact(jobId: string): Promise<JobContact | null> {
  const supabase = await createClient();

  const { data } = await supabase.rpc("job_contact", { p_job_id: jobId });
  const row = data?.[0];
  if (!row) return null;

  return {
    id: row.counterpart_id,
    name: row.counterpart_name,
    phone: row.counterpart_phone,
    role: row.counterpart_role === "customer" ? "customer" : "pro",
  };
}

/** A row of design/screens/pro-3.2-my-jobs.png, the "פעילות" tab. */
export type ActiveJob = {
  jobId: string;
  description: string;
  addressText: string;
  status: string;
  categoryName: string;
  customerName: string | null;
  /** The bid the customer chose. */
  agreedPrice: number;
  /** That price plus every approved update — what the job costs now. */
  currentPrice: number;
  etaMinutes: number;
  pendingUpdateCount: number;
  assignedAt: string;
  unreadCount: number;
};

/**
 * The calling pro's assigned and in-progress jobs.
 *
 * `currentPrice` comes from `job_effective_price()` inside the function, so a
 * request the customer has not answered never appears here as money. The
 * history tab of the same screen — completed jobs, receipts, earnings — is
 * Phase 6.
 */
export async function listMyActiveJobs(): Promise<ActiveJob[]> {
  const supabase = await createClient();

  const { data } = await supabase.rpc("my_active_jobs");

  return (data ?? []).map((row) => ({
    jobId: row.job_id,
    description: row.description,
    addressText: row.address_text,
    status: row.status,
    categoryName: row.category_name_he,
    customerName: row.customer_name,
    agreedPrice: Number(row.agreed_price),
    currentPrice: Number(row.current_price),
    etaMinutes: row.eta_minutes,
    pendingUpdateCount: row.pending_update_count,
    assignedAt: row.assigned_at,
    unreadCount: row.unread_count,
  }));
}
