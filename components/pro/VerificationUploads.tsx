"use client";

import { useState } from "react";
import { ErrorText } from "@/components/ui/primitives";
import {
  DocumentRejected,
  uploadVerificationDoc,
  VERIFICATION_DOC_ACCEPT,
} from "@/lib/supabase/verificationDocs";
import {
  MAX_VERIFICATION_DOC_BYTES,
  VERIFICATION_DOC_LABEL,
  type VerificationDocType,
} from "@/lib/validation/pros";

/**
 * "מסמכים ואימות" — the two dashed drop zones on design/screens/
 * pro-1.3-signup-verification.png, plus the two optional documents step 3 of
 * the guided onboarding adds.
 *
 * Each file is uploaded the moment it is chosen and what the form submits is
 * the storage path, the same arrangement the customer's job media uses: an ID
 * photograph or a scanned insurance PDF is far larger than a Server Action's
 * request body limit.
 *
 * Nothing here is trusted. The bucket's insert policy pins every object to
 * `<auth.uid()>/…` and to `auth_role() = 'pro'`, and `proDocumentsSchema`
 * re-checks the returned path before a `verification_documents` row can
 * reference it.
 */

const FIELD_NAME: Record<VerificationDocType, string> = {
  profile_photo: "profilePhotoPath",
  id_card: "idCardPath",
  license: "licensePath",
  insurance: "insurancePath",
};

const HINT: Record<VerificationDocType, string> = {
  profile_photo: "פנים בבירור, רקע נקי, בלי משקפי שמש",
  id_card: "כל הפרטים קריאים, ללא בוהק וללא חיתוך בפינות",
  license: "רישיון מקצועי בתוקף — לא חובה, אבל מקצר את האישור",
  insurance: "ביטוח אחריות מקצועית — לא חובה",
};

export type UploadedDocs = Partial<Record<VerificationDocType, string>>;

export function VerificationUploads({
  userId,
  types,
  existing,
  value,
  onChange,
  fieldErrors,
}: {
  userId: string;
  types: readonly VerificationDocType[];
  /** Document types already on file, so a returning pro is not asked twice. */
  existing: ReadonlySet<VerificationDocType>;
  value: UploadedDocs;
  onChange: (next: UploadedDocs) => void;
  fieldErrors: Record<string, string>;
}) {
  const [busy, setBusy] = useState<VerificationDocType | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [names, setNames] = useState<
    Partial<Record<VerificationDocType, string>>
  >({});

  async function accept(file: File, docType: VerificationDocType) {
    setError(null);
    setBusy(docType);

    try {
      const path = await uploadVerificationDoc({ file, docType, userId });
      setNames((current) => ({ ...current, [docType]: file.name }));
      onChange({ ...value, [docType]: path });
    } catch (cause) {
      setError(
        cause instanceof DocumentRejected
          ? cause.message
          : "העלאת הקובץ נכשלה. נסו שוב.",
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3">
      {types.map((docType) => (
        <input
          key={docType}
          type="hidden"
          name={FIELD_NAME[docType]}
          value={value[docType] ?? ""}
        />
      ))}

      <div className="grid gap-3 sm:grid-cols-2">
        {types.map((docType) => {
          const uploaded = value[docType];
          const onFile = existing.has(docType);

          return (
            <label
              key={docType}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                const file = event.dataTransfer.files[0];
                if (file) void accept(file, docType);
              }}
              className={`flex min-h-36 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed p-4 text-center transition-colors ${
                uploaded
                  ? "border-cta bg-cta/10"
                  : "border-line bg-canvas hover:border-pro hover:bg-pro-soft/60"
              }`}
            >
              <input
                type="file"
                className="sr-only"
                accept={VERIFICATION_DOC_ACCEPT}
                disabled={busy !== null}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void accept(file, docType);
                  // Let the same file be chosen again after an error.
                  event.target.value = "";
                }}
              />

              <span className="text-sm font-bold text-ink">
                {VERIFICATION_DOC_LABEL[docType]}
              </span>

              {busy === docType ? (
                <span className="text-xs text-muted">מעלה…</span>
              ) : uploaded ? (
                <span className="text-xs font-semibold text-cta-strong">
                  ✓ הועלה{names[docType] ? ` · ${names[docType]}` : ""}
                </span>
              ) : onFile ? (
                <span className="text-xs font-semibold text-pro">
                  כבר קיים בתיק שלכם — אפשר להחליף
                </span>
              ) : (
                <span className="text-xs text-muted">{HINT[docType]}</span>
              )}

              <span className="mt-1 text-xs text-muted">
                גרירה או לחיצה · JPG / PNG / PDF · עד{" "}
                {Math.round(MAX_VERIFICATION_DOC_BYTES / (1024 * 1024))}MB
              </span>
            </label>
          );
        })}
      </div>

      <p className="rounded-xl bg-canvas p-3 text-xs text-muted">
        המסמכים נשמרים באחסון פרטי ונגישים רק לכם ולצוות האימות של Handy —
        לקוחות רואים אך ורק את התג &quot;מאומת&quot;.
      </p>

      {error && <ErrorText>{error}</ErrorText>}
      {types.map((docType) =>
        fieldErrors[FIELD_NAME[docType]] ? (
          <ErrorText key={docType}>
            {fieldErrors[FIELD_NAME[docType]]}
          </ErrorText>
        ) : null,
      )}
    </div>
  );
}
