import { createClient } from "./server";
import { logServerError } from "@/lib/observability";

/**
 * תיק הבית (Phase 13.8) — what was fixed, where, when, by whom and for how
 * much. One row per finished job, matched in the database to the nearest of
 * the customer's own saved addresses within 150 m (`my_home_record()`).
 */
export type HomeRecordEntry = {
  jobId: string;
  placeId: string | null;
  placeLabel: string | null;
  addressText: string;
  categoryName: string;
  categorySlug: string;
  description: string;
  completedAt: string;
  totalPrice: number | null;
  proName: string | null;
  /** Only while the pro is still verified — a slug that leads nowhere is not offered. */
  proSlug: string | null;
  photoPaths: string[];
};

export async function listMyHomeRecord(): Promise<HomeRecordEntry[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_home_record");

  if (error) {
    logServerError("home.listMyHomeRecord", error, {});
    return [];
  }

  return (data ?? []).map((row) => ({
    jobId: row.job_id,
    placeId: row.place_id,
    placeLabel: row.place_label,
    addressText: row.address_text,
    categoryName: row.category_name_he,
    categorySlug: row.category_slug,
    description: row.description,
    completedAt: row.completed_at,
    totalPrice: row.total_price === null ? null : Number(row.total_price),
    proName: row.pro_name,
    proSlug: row.pro_slug,
    photoPaths: row.photo_urls ?? [],
  }));
}

/** Grouped by place, saved addresses first in the order they first appear. */
export function groupByPlace(
  entries: readonly HomeRecordEntry[],
): { key: string; label: string | null; entries: HomeRecordEntry[] }[] {
  const groups = new Map<
    string,
    { key: string; label: string | null; entries: HomeRecordEntry[] }
  >();
  for (const entry of entries) {
    const key = entry.placeId ?? "other";
    const group = groups.get(key) ?? {
      key,
      label: entry.placeLabel,
      entries: [],
    };
    group.entries.push(entry);
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) =>
    a.key === "other" ? 1 : b.key === "other" ? -1 : 0,
  );
}
