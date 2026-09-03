"use client";

import { useActionState, useState } from "react";
import {
  BUTTON_PRO,
  BUTTON_QUIET,
  ErrorText,
  INPUT_CLASS,
} from "@/components/ui/primitives";
import { savePublicProfile } from "@/lib/actions/publicProfile";
import { EMPTY_PRO_FORM_STATE, type ProFormState } from "@/lib/actions/state";
import { SITE_URL } from "@/lib/seo";
import {
  MAX_PRO_MEDIA_BYTES,
  PRO_MEDIA_ACCEPT,
  PhotoRejected,
  uploadProMedia,
} from "@/lib/supabase/proMedia";
import {
  MAX_GALLERY_PHOTOS,
  PUBLIC_BIO_MAX,
} from "@/lib/validation/publicProfile";

/**
 * "הפרופיל הציבורי שלי" — design/screens/pro-5.1-public-profile-edit.png.
 *
 * Photos upload the moment they are chosen and the form submits their storage
 * paths, the same arrangement job media and verification documents use: an
 * image off a phone is far larger than a Server Action's request body limit.
 *
 * Nothing here is trusted. The `pro-media` insert policy pins every object to
 * `<auth.uid()>/…` and to `auth_role() = 'pro'`, and `publicProfileSchema`
 * re-checks each returned path server-side before `pro_profiles` points at it.
 */
export function PublicProfileForm({
  userId,
  initial,
  mediaUrl,
}: {
  userId: string;
  initial: {
    publicSlug: string;
    bio: string | null;
    yearsExperience: number | null;
    avatarPath: string | null;
    galleryPaths: string[];
  };
  /** path → public URL. The bucket is public, so this is a plain join. */
  mediaUrl: (path: string) => string;
}) {
  const [state, action, pending] = useActionState<ProFormState, FormData>(
    savePublicProfile,
    EMPTY_PRO_FORM_STATE,
  );

  const [avatarPath, setAvatarPath] = useState(initial.avatarPath);
  const [galleryPaths, setGalleryPaths] = useState(initial.galleryPaths);
  const [busy, setBusy] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const fieldErrors = state.fieldErrors ?? {};

  async function accept(file: File, kind: "avatar" | "work") {
    setUploadError(null);
    setBusy(true);
    try {
      const path = await uploadProMedia({ file, kind, userId });
      if (kind === "avatar") setAvatarPath(path);
      else
        setGalleryPaths((current) =>
          [...current, path].slice(0, MAX_GALLERY_PHOTOS),
        );
    } catch (cause) {
      setUploadError(
        cause instanceof PhotoRejected
          ? cause.message
          : "העלאת התמונה נכשלה. נסו שוב.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="avatarPath" value={avatarPath ?? ""} />
      {galleryPaths.map((path) => (
        <input key={path} type="hidden" name="galleryPaths" value={path} />
      ))}

      <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-5">
          {avatarPath ? (
            /* The Storage origin is per-deployment, so next/image would
               need a remotePattern for a host known only at runtime. */
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={mediaUrl(avatarPath)}
              alt=""
              className="size-24 rounded-2xl object-cover"
            />
          ) : (
            <span
              aria-hidden
              className="flex size-24 items-center justify-center rounded-2xl bg-pro-soft text-3xl font-bold text-pro"
            >
              +
            </span>
          )}

          <div className="flex-1">
            <h2 className="text-lg font-bold text-ink">תמונת פרופיל</h2>
            <p className="mt-1 text-sm text-muted">
              זו התמונה שלקוחות רואים לפני שהם בוחרים. פנים בבירור, רקע נקי.
            </p>

            <label
              className={`${BUTTON_QUIET} mt-3 cursor-pointer px-4 py-2 text-sm`}
            >
              <input
                type="file"
                className="sr-only"
                accept={PRO_MEDIA_ACCEPT}
                disabled={busy}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void accept(file, "avatar");
                  event.target.value = "";
                }}
              />
              {avatarPath ? "החלף תמונה" : "העלה תמונה"}
            </label>

            {avatarPath && (
              <button
                type="button"
                onClick={() => setAvatarPath(null)}
                className="ms-3 text-sm font-medium text-muted hover:text-ink"
              >
                הסר
              </button>
            )}
          </div>
        </div>
        {fieldErrors.avatarPath && (
          <ErrorText>{fieldErrors.avatarPath}</ErrorText>
        )}
      </section>

      <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
        <h2 className="text-lg font-bold text-ink">כתובת הפרופיל</h2>
        <p className="mt-1 text-sm text-muted">
          הקישור שאתם שולחים ללקוחות. אותיות באנגלית, ספרות ומקפים.
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span dir="ltr" className="text-sm text-muted">
            {SITE_URL}/pro/
          </span>
          <input
            name="publicSlug"
            dir="ltr"
            defaultValue={initial.publicSlug}
            required
            className={`${INPUT_CLASS} max-w-64 text-start`}
          />
        </div>
        {fieldErrors.publicSlug && (
          <ErrorText>{fieldErrors.publicSlug}</ErrorText>
        )}
      </section>

      <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
        <h2 className="text-lg font-bold text-ink">תיאור מקצועי</h2>
        <textarea
          name="bio"
          rows={4}
          maxLength={PUBLIC_BIO_MAX}
          defaultValue={initial.bio ?? ""}
          placeholder="במה אתם מתמחים, מה כלול בעבודה, ומה האחריות שאתם נותנים."
          className={`${INPUT_CLASS} mt-3`}
        />
        {fieldErrors.bio && <ErrorText>{fieldErrors.bio}</ErrorText>}

        <div className="mt-4 max-w-48">
          <label
            htmlFor="yearsExperience"
            className="text-sm font-medium text-ink"
          >
            שנות ניסיון
          </label>
          <input
            id="yearsExperience"
            name="yearsExperience"
            type="number"
            min={0}
            max={70}
            defaultValue={initial.yearsExperience ?? ""}
            className={`${INPUT_CLASS} ltr-nums mt-1`}
          />
          {fieldErrors.yearsExperience && (
            <ErrorText>{fieldErrors.yearsExperience}</ErrorText>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
        <h2 className="text-lg font-bold text-ink">גלריית עבודות</h2>
        <p className="mt-1 text-sm text-muted">
          עד {MAX_GALLERY_PHOTOS} תמונות, עד{" "}
          {Math.round(MAX_PRO_MEDIA_BYTES / (1024 * 1024))}MB לתמונה. תמונות
          לפני/אחרי עובדות הכי טוב.
        </p>

        <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {galleryPaths.map((path) => (
            <li key={path} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element -- see the note on the portrait above. */}
              <img
                src={mediaUrl(path)}
                alt=""
                className="aspect-square w-full rounded-xl object-cover"
              />
              <button
                type="button"
                onClick={() =>
                  setGalleryPaths((current) =>
                    current.filter((candidate) => candidate !== path),
                  )
                }
                className="absolute end-2 top-2 rounded-full bg-ink/80 px-2 py-0.5 text-xs font-bold text-white"
              >
                הסר
              </button>
            </li>
          ))}

          {galleryPaths.length < MAX_GALLERY_PHOTOS && (
            <li>
              <label className="flex aspect-square cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-line bg-canvas text-center text-sm text-muted hover:border-pro hover:bg-pro-soft/60">
                <input
                  type="file"
                  className="sr-only"
                  accept={PRO_MEDIA_ACCEPT}
                  disabled={busy}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void accept(file, "work");
                    event.target.value = "";
                  }}
                />
                {busy ? "מעלה…" : "+ הוסף תמונה"}
              </label>
            </li>
          )}
        </ul>

        {uploadError && <ErrorText>{uploadError}</ErrorText>}
        {fieldErrors.galleryPaths && (
          <ErrorText>{fieldErrors.galleryPaths}</ErrorText>
        )}
      </section>

      {state.error && <ErrorText>{state.error}</ErrorText>}

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending || busy} className={BUTTON_PRO}>
          {pending ? "שומר…" : "שמור פרופיל"}
        </button>
        {state.saved && (
          <p role="status" className="text-sm font-semibold text-cta-strong">
            ✓ הפרופיל עודכן
          </p>
        )}
      </div>
    </form>
  );
}
