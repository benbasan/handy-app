"use client";

import { useActionState, useRef, useState } from "react";
import { addJobDetails } from "@/lib/actions/jobs";
import { EMPTY_ADD_JOB_DETAILS_STATE } from "@/lib/actions/state";
import {
  ACCEPT_ATTRIBUTE,
  MediaRejected,
  uploadJobMedia,
} from "@/lib/supabase/jobMedia";
import { ADDED_DETAILS_MAX, MAX_PHOTOS } from "@/lib/validation/jobs";
import {
  BUTTON_COMPACT,
  BUTTON_QUIET,
  ErrorText,
  INPUT_CLASS,
} from "@/components/ui/primitives";

/**
 * "הוסיפו פרטים לקריאה" (Phase 13.7) — a sentence and photos added to a call
 * that no pro has taken yet.
 *
 * It exists for the quiet-call nudge: half an hour with no offer is usually a
 * description a pro could not price, and the honest thing to suggest is more
 * of it. What is added goes after what was written, never over it
 * (`add_job_details()`), because an offer already made was made against the
 * original words.
 *
 * Photos upload the moment they are picked, like the posting form's, under this
 * customer's own folder in `job-media`.
 */
export function AddJobDetails({
  jobId,
  userId,
  photoCount,
  prominent = false,
}: {
  jobId: string;
  userId: string;
  /** Photos the call already has; the database caps the total at MAX_PHOTOS. */
  photoCount: number;
  /** Open by default — on a call with no offer, this is the thing to do. */
  prominent?: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    addJobDetails,
    EMPTY_ADD_JOB_DETAILS_STATE,
  );
  const [open, setOpen] = useState(prominent);
  const [paths, setPaths] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const groupRef = useRef<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // A save clears the form. Keyed on the save's own timestamp rather than an
  // effect, so the textarea remounts empty exactly once per successful save.
  const formKey = state.savedAt ?? 0;
  const [clearedFor, setClearedFor] = useState(0);
  if (state.savedAt && clearedFor !== state.savedAt) {
    setClearedFor(state.savedAt);
    setPaths([]);
  }

  const room = MAX_PHOTOS - photoCount - paths.length;

  async function pick(files: File[]) {
    setUploadError(null);
    setUploading(true);
    groupRef.current ??= crypto.randomUUID();
    try {
      for (const file of files.slice(0, Math.max(0, room))) {
        const path = await uploadJobMedia({
          file,
          kind: "photo",
          userId,
          uploadGroup: groupRef.current,
        });
        setPaths((current) => [...current, path]);
      }
    } catch (cause) {
      setUploadError(
        cause instanceof MediaRejected
          ? cause.message
          : "העלאת התמונה נכשלה. נסו שוב.",
      );
    } finally {
      setUploading(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`${BUTTON_QUIET} ${BUTTON_COMPACT} mt-4 w-full`}
      >
        הוסיפו פרטים או תמונה
      </button>
    );
  }

  return (
    <form key={formKey} action={formAction} className="mt-4 space-y-3">
      <input type="hidden" name="jobId" value={jobId} />
      {paths.map((path) => (
        <input key={path} type="hidden" name="photoPath" value={path} />
      ))}

      <label
        htmlFor={`add-details-${jobId}`}
        className="block text-sm font-semibold text-ink"
      >
        מה עוד כדאי שבעלי המקצוע יידעו?
      </label>
      <textarea
        id={`add-details-${jobId}`}
        name="text"
        rows={3}
        maxLength={ADDED_DETAILS_MAX}
        placeholder="לדוגמה: הברז הראשי סגור, הכיור מתוצרת חברה X, יש חניה בחצר"
        className={INPUT_CLASS}
      />
      {state.fieldErrors?.text && (
        <ErrorText>{state.fieldErrors.text}</ErrorText>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={uploading || room <= 0}
          onClick={() => inputRef.current?.click()}
          className={`${BUTTON_QUIET} ${BUTTON_COMPACT}`}
        >
          {uploading ? "מעלה…" : "צירוף תמונה"}
        </button>
        {paths.length > 0 && (
          <span className="text-sm text-muted">
            {paths.length === 1
              ? "תמונה אחת צורפה"
              : `${paths.length} תמונות צורפו`}
          </span>
        )}
        {room <= 0 && paths.length === 0 && (
          <span className="text-sm text-muted">
            לקריאה כבר יש מספר התמונות המרבי.
          </span>
        )}
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT_ATTRIBUTE.photo}
          multiple
          hidden
          onChange={(event) => {
            const files = Array.from(event.target.files ?? []);
            event.target.value = "";
            void pick(files);
          }}
        />
      </div>
      {uploadError && <ErrorText>{uploadError}</ErrorText>}

      {state.error && <ErrorText>{state.error}</ErrorText>}
      {state.savedAt && (
        <p role="status" className="text-sm font-semibold text-cta-strong">
          ✓ הפרטים נוספו לקריאה.
        </p>
      )}

      <button
        type="submit"
        disabled={pending || uploading}
        className={`${BUTTON_QUIET} ${BUTTON_COMPACT} w-full`}
      >
        {pending ? "מוסיף…" : "הוספה לקריאה"}
      </button>
    </form>
  );
}
