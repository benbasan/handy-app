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
 * Each file is uploaded the moment it is chosen, and what the form submits is
 * the storage path. That is why the tiles show their own progress and errors:
 * by the time the customer presses "פרסם קריאה" the media is already in place.
 */

export type MediaValue = {
  photoPaths: string[];
  videoPath: string | null;
  voiceNotePath: string | null;
};

export const EMPTY_MEDIA: MediaValue = {
  photoPaths: [],
  videoPath: null,
  voiceNotePath: null,
};

const TILE_CLASS =
  "flex min-h-32 w-full flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-line bg-canvas p-4 text-center transition-colors hover:border-brand hover:bg-brand-soft/40";

export function MediaFields({
  userId,
  value,
  onChange,
}: {
  userId: string;
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

  async function accept(file: File, kind: JobMediaKind) {
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

  function drop(kind: JobMediaKind, limit: number) {
    return (event: React.DragEvent) => {
      event.preventDefault();
      const files = Array.from(event.dataTransfer.files).slice(0, limit);
      files.forEach((file) => void accept(file, kind));
    };
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

  const photosFull = value.photoPaths.length >= MAX_PHOTOS;

  return (
    <div className="space-y-3">
      {/* Voice, video, photo — the order the design puts them in, which in RTL
          means the photo tile sits on the trailing edge as it does there. */}
      <div className="grid gap-3 sm:grid-cols-3">
        <VoiceNoteTile
          disabled={value.voiceNotePath !== null || busy !== null}
          busy={busy === "voice"}
          onFile={(file) => void accept(file, "voice")}
        />

        <FilePickerTile
          kind="video"
          title="העלו סרטון קצר"
          subtitle={`video · up to ${MAX_VIDEO_SECONDS}s`}
          disabled={value.videoPath !== null || busy !== null}
          busy={busy === "video"}
          onFiles={(files) => files[0] && void accept(files[0], "video")}
          onDrop={drop("video", 1)}
        />

        <FilePickerTile
          kind="photo"
          title="גררו תמונה לכאן"
          // Kept entirely Latin: a Hebrew "עד 5" inside a dir="ltr" run
          // reorders on screen to "5 עד".
          subtitle={`photo of issue · up to ${MAX_PHOTOS}`}
          multiple
          disabled={photosFull || busy !== null}
          busy={busy === "photo"}
          onFiles={(files) =>
            files
              .slice(0, MAX_PHOTOS - value.photoPaths.length)
              .forEach((file) => void accept(file, "photo"))
          }
          onDrop={drop("photo", MAX_PHOTOS - value.photoPaths.length)}
        />
      </div>

      {(value.photoPaths.length > 0 ||
        value.videoPath ||
        value.voiceNotePath) && (
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
        <span dir="ltr" className="font-mono text-xs text-muted">
          {subtitle}
        </span>
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
      <span dir="ltr" className="font-mono text-xs text-muted">
        voice note
      </span>

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
