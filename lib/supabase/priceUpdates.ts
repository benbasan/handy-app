import { PRICE_UPDATE_PHOTOS_BUCKET } from "./buckets";
import { createClient } from "./server";
import {
  isPriceUpdateStatus,
  type PriceUpdateStatus,
} from "@/lib/validation/priceUpdates";

/**
 * Read side of עדכון מחיר בשטח — the fourth file in the same family as
 * lib/supabase/jobs.ts, pros.ts and bids.ts. Every query runs under the
 * caller's own RLS.
 *
 * `price_updates` is one of the few tables both sides read directly rather
 * than through a definer function: the customer holds "job owner reads" and
 * the pro holds "pro reads own", and neither row carries anything about the
 * other person. What no client holds is a way to *write* it — see
 * lib/actions/priceUpdates.ts.
 */

export type PriceUpdate = {
  id: string;
  jobId: string;
  proId: string;
  originalPrice: number;
  newPrice: number;
  photoPath: string;
  note: string | null;
  status: PriceUpdateStatus;
  decidedAt: string | null;
  createdAt: string;
};

const COLUMNS =
  "id, job_id, pro_id, original_price, new_price, photo_url, note, status, decided_at, created_at";

type Row = {
  id: string;
  job_id: string;
  pro_id: string;
  original_price: number;
  new_price: number;
  photo_url: string;
  note: string | null;
  status: string;
  decided_at: string | null;
  created_at: string;
};

function toPriceUpdate(row: Row): PriceUpdate {
  return {
    id: row.id,
    jobId: row.job_id,
    proId: row.pro_id,
    originalPrice: Number(row.original_price),
    newPrice: Number(row.new_price),
    photoPath: row.photo_url,
    note: row.note,
    // A check constraint on the column allows exactly these three, so anything
    // else would be a schema change rather than drift.
    status: isPriceUpdateStatus(row.status) ? row.status : "pending",
    decidedAt: row.decided_at,
    createdAt: row.created_at,
  };
}

/**
 * Every price change ever asked for on one job, newest first.
 *
 * No `.eq("job_id", …)` beyond the one the screen asks for and no filter on
 * who may see it: the policies on the table are what scope this, and restating
 * them in the query would suggest the query is the thing keeping other
 * people's jobs out.
 */
export async function listPriceUpdates(jobId: string): Promise<PriceUpdate[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("price_updates")
    .select(COLUMNS)
    .eq("job_id", jobId)
    .order("created_at", { ascending: false });

  return ((data ?? []) as Row[]).map(toPriceUpdate);
}

/** The one waiting for a decision, if there is one. At most one per job. */
export function pendingUpdate(
  updates: readonly PriceUpdate[],
): PriceUpdate | null {
  return updates.find((update) => update.status === "pending") ?? null;
}

/**
 * What the job actually costs right now.
 *
 * The database computes it — the selected bid's price, replaced by the newest
 * approved update — because there is no price column for anything to disagree
 * with. Doing the same arithmetic in JS would be a second answer to a question
 * that must only have one.
 */
export async function getEffectivePrice(jobId: string): Promise<number | null> {
  const supabase = await createClient();

  const { data } = await supabase.rpc("job_effective_price", {
    p_job_id: jobId,
  });

  return data === null || data === undefined ? null : Number(data);
}

/**
 * Short-lived signed URLs for the private fault photos.
 *
 * Storage only signs a path the caller's own RLS lets them select, so this is
 * a convenience rather than the access control — the same arrangement job
 * media and verification documents use. Paths that cannot be signed are
 * dropped rather than rendered as broken images.
 */
export async function signPriceUpdatePhotos(
  paths: string[],
  expiresInSeconds = 60 * 10,
): Promise<Map<string, string>> {
  const signed = new Map<string, string>();
  if (paths.length === 0) return signed;

  const supabase = await createClient();
  const { data } = await supabase.storage
    .from(PRICE_UPDATE_PHOTOS_BUCKET)
    .createSignedUrls(paths, expiresInSeconds);

  for (const entry of data ?? []) {
    if (entry.signedUrl && entry.path) signed.set(entry.path, entry.signedUrl);
  }

  return signed;
}
