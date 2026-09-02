import { createClient } from "./client";
import { JOB_MEDIA_BUCKET } from "./buckets";
import {
  MAX_AUDIO_BYTES,
  MAX_PHOTO_BYTES,
  MAX_VIDEO_BYTES,
  MAX_VIDEO_SECONDS,
  PHOTO_MIME_TYPES,
  VIDEO_MIME_TYPES,
  AUDIO_MIME_TYPES,
} from "@/lib/validation/jobs";

/**
 * Browser-side upload of job media, straight to Supabase Storage.
 *
 * It does not go through a Server Action on purpose: a 30-second video is tens
 * of megabytes and Server Actions cap the request body far below that. The
 * upload is still fully governed — the bucket's insert policy pins every
 * object to `<auth.uid()>/…`, so this code cannot write anywhere else even if
 * it tried, and `createJobSchema` re-checks the returned path server-side
 * before it is stored on the job.
 */

export type JobMediaKind = "photo" | "video" | "voice";

const RULES: Record<
  JobMediaKind,
  { types: readonly string[]; maxBytes: number; label: string }
> = {
  photo: {
    types: PHOTO_MIME_TYPES,
    maxBytes: MAX_PHOTO_BYTES,
    label: "תמונה",
  },
  video: {
    types: VIDEO_MIME_TYPES,
    maxBytes: MAX_VIDEO_BYTES,
    label: "סרטון",
  },
  voice: {
    types: AUDIO_MIME_TYPES,
    maxBytes: MAX_AUDIO_BYTES,
    label: "הקלטה",
  },
};

export const ACCEPT_ATTRIBUTE: Record<JobMediaKind, string> = {
  photo: PHOTO_MIME_TYPES.join(","),
  video: VIDEO_MIME_TYPES.join(","),
  voice: AUDIO_MIME_TYPES.join(","),
};

function megabytes(bytes: number): string {
  return `${Math.round(bytes / (1024 * 1024))}MB`;
}

function extensionFor(file: File): string {
  const fromName = file.name.split(".").pop() ?? "";
  if (/^[A-Za-z0-9]{1,8}$/.test(fromName)) return fromName.toLowerCase();

  // A MediaRecorder blob arrives as "recording" with no extension, and its
  // type looks like "audio/webm;codecs=opus".
  const subtype = file.type.split("/")[1]?.split(";")[0] ?? "bin";
  return /^[A-Za-z0-9]{1,8}$/.test(subtype) ? subtype.toLowerCase() : "bin";
}

/**
 * How long a video actually is, or null when the browser will not say.
 * product-spec.md 3.2 caps it at 30 seconds; the server cannot check this
 * without decoding the file, so this is a courtesy limit, not a security one.
 */
export function readVideoDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";

    const done = (value: number | null) => {
      URL.revokeObjectURL(url);
      resolve(value);
    };

    video.onloadedmetadata = () =>
      done(Number.isFinite(video.duration) ? video.duration : null);
    video.onerror = () => done(null);
    video.src = url;
  });
}

export class MediaRejected extends Error {}

export async function uploadJobMedia({
  file,
  kind,
  userId,
  uploadGroup,
}: {
  file: File;
  kind: JobMediaKind;
  userId: string;
  uploadGroup: string;
}): Promise<string> {
  const rules = RULES[kind];

  if (!rules.types.includes(file.type)) {
    throw new MediaRejected(`סוג הקובץ אינו נתמך עבור ${rules.label}.`);
  }

  if (file.size > rules.maxBytes) {
    throw new MediaRejected(
      `הקובץ גדול מדי — עד ${megabytes(rules.maxBytes)} ל${rules.label}.`,
    );
  }

  if (kind === "video") {
    const duration = await readVideoDuration(file);
    if (duration !== null && duration > MAX_VIDEO_SECONDS + 1) {
      throw new MediaRejected(
        `הסרטון ארוך מדי — עד ${MAX_VIDEO_SECONDS} שניות.`,
      );
    }
  }

  // The filename is generated, never taken from the user's file: it has to
  // match the path shape the server re-validates, and an uploaded name can
  // contain slashes, Hebrew, or 300 characters of nothing useful.
  const name = `${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extensionFor(file)}`;
  const path = `${userId}/${uploadGroup}/${name}`;

  const supabase = createClient();
  const { error } = await supabase.storage
    .from(JOB_MEDIA_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });

  if (error) {
    throw new MediaRejected("העלאת הקובץ נכשלה. נסו שוב.");
  }

  return path;
}

export async function removeJobMedia(path: string): Promise<void> {
  const supabase = createClient();
  await supabase.storage.from(JOB_MEDIA_BUCKET).remove([path]);
}
