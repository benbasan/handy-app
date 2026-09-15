"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  ACCEPT_ATTRIBUTE,
  MediaRejected,
  removeJobMedia,
  uploadJobMedia,
  type JobMediaKind,
} from "@/lib/supabase/jobMedia";
import { MAX_PHOTOS, MAX_VIDEO_SECONDS } from "@/lib/validation/jobs";

/**
 * The three optional attachments from design/screens/customer-2.1-post-job:
 * a photo of the fault, a short video, and a voice note. All three are
 * optional — the spec's line is that they improve the accuracy of the bids,
 * not that they are required to post.
 *
 * For a signed-in customer each file is uploaded the moment it is chosen, and
 * what the form submits is the storage path. That is why the tiles show their
 * own progress and errors: by the time the customer presses "פרסם קריאה" the
 * media is already in place.
 *
 * A visitor who has not signed in yet (Phase 13.7 opened the form to them) has
 * no id, and `job-media` is laid out as `<customer_id>/…` — so their files are
 * held in this tab as `pending` and uploaded by `uploadPendingMedia()` in the
 * moment between signing in and publishing. The bucket's policies did not move:
 * nothing is ever written under an identity the caller does not have.
 */

export type PendingMedia = { key: string; kind: JobMediaKind; file: File };

export type MediaValue = {
  photoPaths: string[];
  videoPath: string | null;
  voiceNotePath: string | null;
  /** Chosen before signing in; not yet in storage. */
  pending: PendingMedia[];
};

export const EMPTY_MEDIA: MediaValue = {
  photoPaths: [],
  videoPath: null,
  voiceNotePath: null,
  pending: [],
};

/**
 * Upload everything a visitor chose before they had an account, and return the
 * value the form should submit. Photos keep the order they were picked in.
 * Throws the first rejection, so the caller can stop before publishing a call
 * without the photo somebody meant to attach.
 */
export async function uploadPendingMedia(
  value: MediaValue,
  userId: string,
): Promise<MediaValue> {
  if (value.pending.length === 0) return value;

  const uploadGroup = crypto.randomUUID();
  const next: MediaValue = {
    ...value,
    photoPaths: [...value.photoPaths],
    pending: [],
  };

  for (const item of value.pending) {
    const path = await uploadJobMedia({
      file: item.file,
      kind: item.kind,
      userId,
      uploadGroup,
    });
    if (item.kind === "photo") next.photoPaths.push(path);
    else if (item.kind === "video") next.videoPath = path;
    else next.voiceNotePath = path;
  }

  return next;
}

const pendingOf = (value: MediaValue, kind: JobMediaKind) =>
  value.pending.filter((item) => item.kind === kind);

const TILE_CLASS =
  "flex min-h-32 w-full flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-line bg-canvas p-4 text-center transition-colors hover:border-brand hover:bg-brand-soft/40";

export function MediaFields({
  userId,
  value,
  onChange,
}: {
  /** Null before signing in: files are held, not uploaded. */
  userId: string | null;
  value: MediaValue;
  onChange: (next: MediaValue) => void;
}) {
  // One upload group per posting session, minted lazily so it is never
  // generated during server rendering.
  const groupRef = useRef<string | null>(null);
  const uploadGroup = useCallback(() => {
    groupRef.current ??= crypto.randomUUID();
    return groupRef.current;
  }, []);

  const [busy, setBusy] = useState<JobMediaKind | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [previews, setPreviews] = useState<Record<string, string>>({});

  // Object URLs are process-wide allocations; release them when the form goes.
  useEffect(() => {
    const urls = Object.values(previews);
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
    // Only on unmount: mid-life revocation would blank the visible thumbnails.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Hold files for a visitor with no account yet. All of a multi-select in one
   * `onChange`: `value` is this render's, so calling back once per file would
   * keep only the last photo of three.
   */
  function hold(files: File[], kind: JobMediaKind) {
    setError(null);
    const items = files.map((file) => ({
      key: crypto.randomUUID(),
      kind,
      file,
    }));
    if (kind === "photo") {
      setPreviews((current) => ({
        ...current,
        ...Object.fromEntries(
          items.map((item) => [item.key, URL.createObjectURL(item.file)]),
        ),
      }));
    }
    onChange({ ...value, pending: [...value.pending, ...items] });
  }

  function take(files: File[], kind: JobMediaKind) {
    if (files.length === 0) return;
    if (!userId) hold(files, kind);
    else files.forEach((file) => void accept(file, kind, userId));
  }

  async function accept(file: File, kind: JobMediaKind, userId: string) {
    setError(null);
    setBusy(kind);

    try {
      const path = await uploadJobMedia({
        file,
        kind,
        userId,
        uploadGroup: uploadGroup(),
      });

      if (kind === "photo") {
        setPreviews((current) => ({
          ...current,
          [path]: URL.createObjectURL(file),
        }));
        onChange({ ...value, photoPaths: [...value.photoPaths, path] });
      } else if (kind === "video") {
        onChange({ ...value, videoPath: path });
      } else {
        onChange({ ...value, voiceNotePath: path });
      }
    } catch (cause) {
      setError(
        cause instanceof MediaRejected
          ? cause.message
          : "העלאת הקובץ נכשלה. נסו שוב.",
      );
    } finally {
      setBusy(null);
    }
  }

  function drop(event: React.DragEvent, kind: JobMediaKind, limit: number) {
    event.preventDefault();
    take(Array.from(event.dataTransfer.files).slice(0, limit), kind);
  }

  const remove = (path: string, kind: JobMediaKind) => {
    void removeJobMedia(path);
    if (kind === "photo") {
      onChange({
        ...value,
        photoPaths: value.photoPaths.filter((p) => p !== path),
      });
    } else if (kind === "video") {
      onChange({ ...value, videoPath: null });
    } else {
      onChange({ ...value, voiceNotePath: null });
    }
  };

  const dropPending = (key: string) =>
    onChange({
      ...value,
      pending: value.pending.filter((item) => item.key !== key),
    });

  const photoCount = value.photoPaths.length + pendingOf(value, "photo").length;
  const photosFull = photoCount >= MAX_PHOTOS;
  const hasVideo =
    value.videoPath !== null || pendingOf(value, "video").length > 0;
  const hasVoice =
    value.voiceNotePath !== null || pendingOf(value, "voice").length > 0;

  return (
    <div className="space-y-3">
      {/* Voice, video, photo — the order the design puts them in, which in RTL
          means the photo tile sits on the trailing edge as it does there. */}
      <div className="grid gap-3 sm:grid-cols-3">
        <VoiceNoteTile
          disabled={hasVoice || busy !== null}
          busy={busy === "voice"}
          onFile={(file) => take([file], "voice")}
        />

        <FilePickerTile
          kind="video"
          title="העלו סרטון קצר"
          subtitle={`עד ${MAX_VIDEO_SECONDS} שניות`}
          disabled={hasVideo || busy !== null}
          busy={busy === "video"}
          onFiles={(files) => take(files.slice(0, 1), "video")}
          onDrop={(event) => drop(event, "video", 1)}
        />

        <FilePickerTile
          kind="photo"
          title="גררו תמונה לכאן"
          subtitle={`עד ${MAX_PHOTOS} תמונות`}
          multiple
          disabled={photosFull || busy !== null}
          busy={busy === "photo"}
          onFiles={(files) =>
            take(files.slice(0, MAX_PHOTOS - photoCount), "photo")
          }
          onDrop={(event) => drop(event, "photo", MAX_PHOTOS - photoCount)}
        />
      </div>

      {(photoCount > 0 || hasVideo || hasVoice) && (
        <ul className="flex flex-wrap gap-3">
          {value.photoPaths.map((path) => (
            <Attachment
              key={path}
              label="תמונה"
              preview={previews[path]}
              onRemove={() => remove(path, "photo")}
            />
          ))}
          {value.videoPath && (
            <Attachment
              label="סרטון"
              icon="🎬"
              onRemove={() => remove(value.videoPath!, "video")}
            />
          )}
          {value.voiceNotePath && (
            <Attachment
              label="הקלטה קולית"
              icon="🎙️"
              onRemove={() => remove(value.voiceNotePath!, "voice")}
            />
          )}
          {value.pending.map((item) => (
            <Attachment
              key={item.key}
              label={
                item.kind === "photo"
                  ? "תמונה"
                  : item.kind === "video"
                    ? "סרטון"
                    : "הקלטה קולית"
              }
              preview={previews[item.key]}
              icon={item.kind === "video" ? "🎬" : "🎙️"}
              onRemove={() => dropPending(item.key)}
            />
          ))}
        </ul>
      )}

      {error && (
        <p role="alert" className="text-sm font-medium text-red-700">
          {error}
        </p>
      )}

      {/* What the server actually reads. The files themselves never pass
          through the Server Action — see lib/supabase/jobMedia.ts. */}
      {value.photoPaths.map((path) => (
        <input key={path} type="hidden" name="photoPath" value={path} />
      ))}
      <input type="hidden" name="videoPath" value={value.videoPath ?? ""} />
      <input
        type="hidden"
        name="voiceNotePath"
        value={value.voiceNotePath ?? ""}
      />
    </div>
  );
}

function FilePickerTile({
  kind,
  title,
  subtitle,
  multiple = false,
  disabled,
  busy,
  onFiles,
  onDrop,
}: {
  kind: JobMediaKind;
  title: string;
  subtitle: string;
  multiple?: boolean;
  disabled: boolean;
  busy: boolean;
  onFiles: (files: File[]) => void;
  onDrop: (event: React.DragEvent) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div onDragOver={(event) => event.preventDefault()} onDrop={onDrop}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        className={`${TILE_CLASS} disabled:cursor-not-allowed disabled:opacity-50`}
      >
        <span className="text-sm font-bold text-ink">
          {busy ? "מעלה…" : title}
        </span>
        {/* Hebrew, in the page's own direction. It was Latin inside a
            dir="ltr" run, because "עד 5" in that run reordered to "5 עד" —
            the fix for that was the direction, not the language. */}
        <span className="text-xs text-muted">{subtitle}</span>
      </button>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT_ATTRIBUTE[kind]}
        multiple={multiple}
        hidden
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = "";
          onFiles(files);
        }}
      />
    </div>
  );
}

/**
 * "הקלטה קולית" in the design is a recording, not just an upload, so this
 * records in the browser when MediaRecorder and a microphone are available and
 * falls back to picking an audio file when they are not.
 */
function VoiceNoteTile({
  disabled,
  busy,
  onFile,
}: {
  disabled: boolean;
  busy: boolean;
  onFile: (file: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const [recording, setRecording] = useState(false);
  const [micRefused, setMicRefused] = useState(false);

  // A browser capability, read through useSyncExternalStore rather than an
  // effect: the server snapshot is `false`, so the button is absent in the
  // HTML and appears on hydration without a mismatch.
  const recorderSupported = useSyncExternalStore(
    subscribeNever,
    () =>
      "MediaRecorder" in window &&
      Boolean(navigator.mediaDevices?.getUserMedia),
    () => false,
  );
  const canRecord = recorderSupported && !micRefused;

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const chunks: Blob[] = [];
      const recorder = new MediaRecorder(stream);

      recorder.ondataavailable = (event) => chunks.push(event.data);
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        const blob = new Blob(chunks, { type: "audio/webm" });
        onFile(new File([blob], "voice-note.webm", { type: "audio/webm" }));
        setRecording(false);
      };

      recorderRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch {
      // Permission refused, or no microphone. The file picker still works.
      setMicRefused(true);
    }
  }

  return (
    <div className={TILE_CLASS}>
      <span className="text-sm font-bold text-ink">
        {busy ? "מעלה…" : "הקלטה קולית"}
      </span>
      <span className="text-xs text-muted">במקום להקליד</span>

      <div className="mt-1 flex items-center gap-3 text-xs font-semibold">
        {canRecord && (
          <button
            type="button"
            disabled={disabled && !recording}
            onClick={() =>
              recording ? recorderRef.current?.stop() : void startRecording()
            }
            className="text-brand underline underline-offset-2 disabled:opacity-50"
          >
            {recording ? "עצירה ושמירה" : "הקלטה"}
          </button>
        )}
        <button
          type="button"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
          className="text-muted underline underline-offset-2 disabled:opacity-50"
        >
          בחירת קובץ
        </button>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT_ATTRIBUTE.voice}
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) onFile(file);
        }}
      />
    </div>
  );
}

/** No source of change: browser support is fixed for the life of the page. */
function subscribeNever() {
  return () => {};
}

function Attachment({
  label,
  preview,
  icon = "📎",
  onRemove,
}: {
  label: string;
  preview?: string;
  icon?: string;
  onRemove: () => void;
}) {
  return (
    <li className="flex items-center gap-2 rounded-xl border border-line bg-surface p-2 text-sm">
      {preview ? (
        // A blob: URL for the file the customer just picked — next/image
        // cannot optimise something that only exists in this browser tab.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={preview} alt="" className="size-12 rounded-lg object-cover" />
      ) : (
        <span className="flex size-12 items-center justify-center rounded-lg bg-canvas text-lg">
          {icon}
        </span>
      )}
      <span className="font-medium text-ink">{label}</span>
      <button
        type="button"
        onClick={onRemove}
        className="ms-2 text-xs font-semibold text-red-700 underline underline-offset-2"
      >
        הסרה
      </button>
    </li>
  );
}
