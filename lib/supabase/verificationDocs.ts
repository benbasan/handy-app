import { createClient } from "./client";
import { VERIFICATION_DOCS_BUCKET } from "./buckets";
import {
  MAX_VERIFICATION_DOC_BYTES,
  VERIFICATION_DOC_MIME_TYPES,
  type VerificationDocType,
} from "@/lib/validation/pros";

/**
 * Browser-side upload of a verification document, straight to Supabase
 * Storage — the same arrangement job media uses, and for the same reason:
 * a photographed ID or a scanned insurance PDF is far larger than a Server
 * Action's request body limit.
 *
 * It is still fully governed. The bucket's insert policy pins every object to
 * `<auth.uid()>/…` and to `auth_role() = 'pro'`, so this code cannot write
 * anywhere else even if it tried, and `proDocumentsSchema` re-checks the
 * returned path server-side before a `verification_documents` row references
 * it.
 */

export class DocumentRejected extends Error {}

function megabytes(bytes: number): string {
  return `${Math.round(bytes / (1024 * 1024))}MB`;
}

export const VERIFICATION_DOC_ACCEPT = VERIFICATION_DOC_MIME_TYPES.join(",");

function extensionFor(file: File): string {
  const fromName = file.name.split(".").pop() ?? "";
  if (/^[A-Za-z0-9]{1,8}$/.test(fromName)) return fromName.toLowerCase();

  const subtype = file.type.split("/")[1]?.split(";")[0] ?? "bin";
  return /^[A-Za-z0-9]{1,8}$/.test(subtype) ? subtype.toLowerCase() : "bin";
}

export async function uploadVerificationDoc({
  file,
  docType,
  userId,
}: {
  file: File;
  docType: VerificationDocType;
  userId: string;
}): Promise<string> {
  if (!(VERIFICATION_DOC_MIME_TYPES as readonly string[]).includes(file.type)) {
    throw new DocumentRejected(
      "אפשר להעלות תמונה (JPG/PNG/WEBP) או קובץ PDF בלבד.",
    );
  }

  if (file.size > MAX_VERIFICATION_DOC_BYTES) {
    throw new DocumentRejected(
      `הקובץ גדול מדי — עד ${megabytes(MAX_VERIFICATION_DOC_BYTES)}.`,
    );
  }

  // Generated, never taken from the user's file: the path shape is
  // re-validated server-side, and an uploaded name can contain slashes,
  // Hebrew, or a hundred characters of nothing useful.
  const name = `${docType}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extensionFor(file)}`;
  const path = `${userId}/${name}`;

  const supabase = createClient();
  const { error } = await supabase.storage
    .from(VERIFICATION_DOCS_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });

  if (error) {
    throw new DocumentRejected("העלאת הקובץ נכשלה. נסו שוב.");
  }

  return path;
}
