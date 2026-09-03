import { createClient } from "./client";
import { PRICE_UPDATE_PHOTOS_BUCKET } from "./buckets";
import {
  MAX_PRICE_UPDATE_PHOTO_BYTES,
  PHOTO_MIME_TYPES,
} from "@/lib/validation/priceUpdates";

/**
 * Browser-side upload of the fault photo, straight to Supabase Storage — the
 * same arrangement job media and verification documents use, and for the same
 * reason: a photo off a phone camera is far larger than a Server Action's
 * request body limit.
 *
 * It is still fully governed, twice over. The bucket's insert policy pins
 * every object to `<auth.uid()>/…` and to `auth_role() = 'pro'`, so this code
 * cannot write anywhere else even if it tried; and `request_price_update()`
 * then refuses any path whose second segment is not the job the request is
 * about, so a photo cannot be recycled as evidence for a different call.
 */

export class PhotoRejected extends Error {}

export const PRICE_UPDATE_PHOTO_ACCEPT = PHOTO_MIME_TYPES.join(",");

function megabytes(bytes: number): string {
  return `${Math.round(bytes / (1024 * 1024))}MB`;
}

function extensionFor(file: File): string {
  const fromName = file.name.split(".").pop() ?? "";
  if (/^[A-Za-z0-9]{1,8}$/.test(fromName)) return fromName.toLowerCase();

  const subtype = file.type.split("/")[1]?.split(";")[0] ?? "bin";
  return /^[A-Za-z0-9]{1,8}$/.test(subtype) ? subtype.toLowerCase() : "bin";
}

export async function uploadPriceUpdatePhoto({
  file,
  userId,
  jobId,
}: {
  file: File;
  userId: string;
  jobId: string;
}): Promise<string> {
  if (!(PHOTO_MIME_TYPES as readonly string[]).includes(file.type)) {
    throw new PhotoRejected("אפשר להעלות תמונה בלבד (JPG / PNG / WEBP).");
  }

  if (file.size > MAX_PRICE_UPDATE_PHOTO_BYTES) {
    throw new PhotoRejected(
      `התמונה גדולה מדי — עד ${megabytes(MAX_PRICE_UPDATE_PHOTO_BYTES)}.`,
    );
  }

  // Generated, never taken from the user's file: the path shape is
  // re-validated server-side and again in the database, and an uploaded name
  // can contain slashes, Hebrew, or a hundred characters of nothing useful.
  const name = `fault-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extensionFor(file)}`;
  const path = `${userId}/${jobId}/${name}`;

  const supabase = createClient();
  const { error } = await supabase.storage
    .from(PRICE_UPDATE_PHOTOS_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });

  if (error) {
    throw new PhotoRejected("העלאת התמונה נכשלה. נסו שוב.");
  }

  return path;
}
