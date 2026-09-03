import { createClient } from "./client";
import { PRO_MEDIA_BUCKET } from "./buckets";

/**
 * Browser-side upload of a pro's published photo — their portrait or a work
 * gallery image — straight into the public `pro-media` bucket.
 *
 * The same arrangement verification documents use, minus the privacy: what is
 * uploaded here is meant to be seen by strangers, which is exactly why the
 * bucket is public and why identity documents are not in it.
 *
 * The bucket's insert policy pins every object to `<auth.uid()>/…` and to
 * `auth_role() = 'pro'`, and `publicProfileSchema` re-checks the returned path
 * server-side before `pro_profiles` can point at it.
 */

export class PhotoRejected extends Error {}

export const PRO_MEDIA_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
] as const;

export const PRO_MEDIA_ACCEPT = PRO_MEDIA_MIME_TYPES.join(",");

/** Matches the bucket's own file_size_limit, so a rejection is explained here. */
export const MAX_PRO_MEDIA_BYTES = 10 * 1024 * 1024;

function extensionFor(file: File): string {
  const fromName = file.name.split(".").pop() ?? "";
  if (/^[A-Za-z0-9]{1,8}$/.test(fromName)) return fromName.toLowerCase();

  const subtype = file.type.split("/")[1]?.split(";")[0] ?? "bin";
  return /^[A-Za-z0-9]{1,8}$/.test(subtype) ? subtype.toLowerCase() : "bin";
}

export async function uploadProMedia({
  file,
  kind,
  userId,
}: {
  file: File;
  /** Only used to make the object name readable in the bucket listing. */
  kind: "avatar" | "work";
  userId: string;
}): Promise<string> {
  if (!(PRO_MEDIA_MIME_TYPES as readonly string[]).includes(file.type)) {
    throw new PhotoRejected("אפשר להעלות תמונה בלבד (JPG / PNG / WEBP).");
  }

  if (file.size > MAX_PRO_MEDIA_BYTES) {
    throw new PhotoRejected(
      `הקובץ גדול מדי — עד ${Math.round(MAX_PRO_MEDIA_BYTES / (1024 * 1024))}MB.`,
    );
  }

  // Generated, never taken from the user's file name: an uploaded name can
  // carry slashes, Hebrew or a hundred useless characters, and the path shape
  // is re-validated server-side.
  const name = `${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extensionFor(file)}`;
  const path = `${userId}/${name}`;

  const supabase = createClient();
  const { error } = await supabase.storage
    .from(PRO_MEDIA_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });

  if (error) throw new PhotoRejected("העלאת התמונה נכשלה. נסו שוב.");

  return path;
}
