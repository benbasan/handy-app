import { cache } from "react";
import { JOB_MEDIA_BUCKET } from "./buckets";
import { createClient } from "./server";

/**
 * Read side of the customer's job flow. Kept beside session.ts as a data
 * access layer rather than inside components: every query here runs under the
 * caller's RLS, and having them in one file makes "what can a customer read?"
 * answerable by reading one screen of code.
 */

export type Category = {
  id: string;
  nameHe: string;
  slug: string;
};

/** World-readable (the SEO pages need it), and stable — worth caching per request. */
export const listCategories = cache(async (): Promise<Category[]> => {
  const supabase = await createClient();

  const { data } = await supabase
    .from("categories")
    .select("id, name_he, slug")
    .order("name_he");

  return (data ?? []).map((row) => ({
    id: row.id,
    nameHe: row.name_he,
    slug: row.slug,
  }));
});

export type JobSummary = {
  id: string;
  description: string;
  addressText: string;
  status: string;
  preferredTime: string | null;
  searchRadiusKm: number;
  createdAt: string;
  categoryName: string | null;
  categorySlug: string | null;
  photoPaths: string[];
  videoPath: string | null;
  voiceNotePath: string | null;
  latitude: number | null;
  longitude: number | null;
};

const JOB_COLUMNS =
  "id, description, address_text, status, preferred_time, search_radius_km, created_at, photo_urls, video_url, voice_note_url, latitude, longitude, categories(name_he, slug)";

type JobRow = {
  id: string;
  description: string;
  address_text: string;
  status: string;
  preferred_time: string | null;
  search_radius_km: number;
  created_at: string;
  photo_urls: string[];
  video_url: string | null;
  voice_note_url: string | null;
  latitude: number | null;
  longitude: number | null;
  categories: { name_he: string; slug: string } | null;
};

function toSummary(row: JobRow): JobSummary {
  return {
    id: row.id,
    description: row.description,
    addressText: row.address_text,
    status: row.status,
    preferredTime: row.preferred_time,
    searchRadiusKm: row.search_radius_km,
    createdAt: row.created_at,
    categoryName: row.categories?.name_he ?? null,
    categorySlug: row.categories?.slug ?? null,
    photoPaths: row.photo_urls,
    videoPath: row.video_url,
    voiceNotePath: row.voice_note_url,
    latitude: row.latitude,
    longitude: row.longitude,
  };
}

/**
 * The signed-in customer's own jobs. No `.eq("customer_id", …)` filter is
 * needed or wanted: the SELECT policy on `jobs` is what scopes this, and
 * restating it here would suggest the query is the thing keeping other
 * people's jobs out.
 */
export async function listMyJobs(): Promise<JobSummary[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("jobs")
    .select(JOB_COLUMNS)
    .order("created_at", { ascending: false });

  return ((data ?? []) as JobRow[]).map(toSummary);
}

export async function getJob(jobId: string): Promise<JobSummary | null> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("jobs")
    .select(JOB_COLUMNS)
    .eq("id", jobId)
    .maybeSingle();

  return data ? toSummary(data as JobRow) : null;
}

/**
 * Short-lived signed URLs for private job media.
 *
 * The bucket is not public, and Storage only signs a path the caller's own RLS
 * lets them select — so this is a convenience, not the access control. Paths
 * that cannot be signed are dropped rather than rendered as broken images.
 */
export async function signJobMedia(
  paths: string[],
  expiresInSeconds = 60 * 10,
): Promise<Map<string, string>> {
  const signed = new Map<string, string>();
  if (paths.length === 0) return signed;

  const supabase = await createClient();
  const { data } = await supabase.storage
    .from(JOB_MEDIA_BUCKET)
    .createSignedUrls(paths, expiresInSeconds);

  for (const entry of data ?? []) {
    if (entry.signedUrl && entry.path) signed.set(entry.path, entry.signedUrl);
  }

  return signed;
}
