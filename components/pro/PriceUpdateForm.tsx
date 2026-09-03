"use client";

import { useActionState, useRef, useState } from "react";
import { ErrorText, INPUT_CLASS } from "@/components/ui/primitives";
import { requestPriceUpdate } from "@/lib/actions/priceUpdates";
import { EMPTY_PRICE_UPDATE_FORM_STATE } from "@/lib/actions/state";
import {
  PhotoRejected,
  PRICE_UPDATE_PHOTO_ACCEPT,
  uploadPriceUpdatePhoto,
} from "@/lib/supabase/priceUpdatePhotos";
import {
  formatIls,
  MAX_PRICE_UPDATE_PRICE,
  MIN_PRICE_UPDATE_PRICE,
  PRICE_UPDATE_REASONS,
  PRICE_UPDATE_STEP,
  priceDelta,
} from "@/lib/validation/priceUpdates";
import { commissionBreakdown } from "@/lib/validation/pros";

/**
 * The orange card on design/screens/pro-3.1-manage-job-price-update.png —
 * "עדכון מחיר בשטח", the one screen the whole product is named after.
 *
 * The design's own copy is the specification: **חובה לצלם את התקלה לפני שליחת
 * בקשה ללקוח**. That is enforced three times, and this component is only the
 * first of them — the submit button stays disabled until a photo has actually
 * landed in Storage, `requestPriceUpdateSchema` requires a path in this pro's
 * folder for this job, and `price_updates.photo_url` has been NOT NULL and
 * non-blank since Phase 1. A rule this central does not rest on a disabled
 * attribute.
 *
 * The photo goes straight from the browser to Storage rather than through the
 * action, the same as job media and verification documents: a phone photo is
 * far past a Server Action's body limit.
 *
 * What the pro never sends is the price the change is measured *from*. The
 * original price is displayed here, struck through as in the design, but it is
 * read by `request_price_update()` from `job_effective_price()` — a pro who
 * could state it could claim the agreed price had been higher all along.
 */
export function PriceUpdateForm({
  jobId,
  proId,
  originalPrice,
}: {
  jobId: string;
  proId: string;
  originalPrice: number;
}) {
  const [state, formAction, pending] = useActionState(
    requestPriceUpdate,
    EMPTY_PRICE_UPDATE_FORM_STATE,
  );

  const [photoPath, setPhotoPath] = useState<string | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);

  const [newPrice, setNewPrice] = useState(
    Math.max(originalPrice + PRICE_UPDATE_STEP, MIN_PRICE_UPDATE_PRICE),
  );
  const [note, setNote] = useState("");

  const fileRef = useRef<HTMLInputElement>(null);

  const delta = priceDelta(originalPrice, newPrice);
  const { commission } = commissionBreakdown(newPrice);

  async function onPickPhoto(file: File | undefined) {
    if (!file) return;

    setPhotoError(null);
    setUploading(true);

    try {
      const path = await uploadPriceUpdatePhoto({ file, userId: proId, jobId });
      setPhotoPath(path);
      setPhotoPreview(URL.createObjectURL(file));
    } catch (error) {
      setPhotoError(
        error instanceof PhotoRejected
          ? error.message
          : "העלאת התמונה נכשלה. נסו שוב.",
      );
    } finally {
      setUploading(false);
    }
  }

  if (state.sent) {
    return (
      <div className="rounded-2xl border-2 border-alert bg-alert-soft p-5">
        <h2 className="text-lg font-bold text-ink">הבקשה נשלחה ללקוח</h2>
        <p className="mt-2 text-sm text-ink">
          עד שהלקוח יאשר, העבודה ממשיכה במחיר המקורי —{" "}
          <span className="ltr-nums font-bold">{formatIls(originalPrice)}</span>{" "}
          ₪. נעדכן כאן ברגע שתהיה החלטה.
        </p>
      </div>
    );
  }

  return (
    <form
      action={formAction}
      className="rounded-2xl border-2 border-alert bg-surface p-5"
    >
      <input type="hidden" name="jobId" value={jobId} />
      <input type="hidden" name="photoPath" value={photoPath ?? ""} />
      <input type="hidden" name="newPrice" value={newPrice} />
      <input type="hidden" name="note" value={note} />

      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-alert text-sm font-bold text-white"
        >
          !
        </span>
        <h2 className="text-lg font-bold text-ink">עדכון מחיר בשטח</h2>
      </div>

      <p className="mt-4 rounded-xl bg-alert-soft p-3 text-sm font-medium text-ink">
        חובה לצלם את התקלה לפני שליחת בקשה ללקוח.
      </p>

      {/* 1 — the photo. Everything below it is inert until this exists. */}
      <div className="mt-4">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-alert bg-alert-soft p-6 text-center transition-colors hover:bg-alert/10 disabled:opacity-60"
        >
          {photoPreview ? (
            /* eslint-disable-next-line @next/next/no-img-element -- a local
               object URL for a file that has not got a signed URL yet. */
            <img
              src={photoPreview}
              alt="התמונה שצולמה בשטח"
              className="max-h-40 rounded-lg object-cover"
            />
          ) : (
            <span aria-hidden className="size-4 rounded-full bg-alert" />
          )}
          <span className="font-bold text-alert">
            {uploading
              ? "מעלה…"
              : photoPath
                ? "החלפת התמונה"
                : "העלה תמונה מהשטח"}
          </span>
        </button>

        <input
          ref={fileRef}
          type="file"
          accept={PRICE_UPDATE_PHOTO_ACCEPT}
          capture="environment"
          className="sr-only"
          aria-label="תמונת התקלה"
          onChange={(event) => void onPickPhoto(event.target.files?.[0])}
        />

        {photoError && (
          <div className="mt-2">
            <ErrorText>{photoError}</ErrorText>
          </div>
        )}
        {state.fieldErrors?.photoPath && !photoError && (
          <div className="mt-2">
            <ErrorText>{state.fieldErrors.photoPath}</ErrorText>
          </div>
        )}
      </div>

      {/* 2 — the reason. Chips write into the note rather than into a column:
          a field fault does not fit a closed vocabulary the way "מתי נוח"
          does, and a wrong-but-tickable reason is worse than a sentence. */}
      <fieldset className="mt-4">
        <legend className="sr-only">סיבת העדכון</legend>
        <div className="flex flex-wrap gap-2">
          {PRICE_UPDATE_REASONS.map((reason) => (
            <button
              key={reason}
              type="button"
              onClick={() => setNote(reason)}
              aria-pressed={note === reason}
              className={`rounded-xl border px-4 py-2 text-sm font-semibold transition-colors ${
                note === reason
                  ? "border-alert bg-alert text-white"
                  : "border-line bg-surface text-ink hover:border-alert/50"
              }`}
            >
              {reason}
            </button>
          ))}
        </div>

        <textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          rows={2}
          placeholder="מה בדיוק התגלה בשטח? הלקוח יראה את זה לצד התמונה."
          aria-label="הסבר ללקוח"
          className={`${INPUT_CLASS} mt-3`}
        />
      </fieldset>

      {/* 3 — the price. The original is struck through beside it, exactly as
          in the design, and it is a label rather than an input. */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">
          מחיר מקורי{" "}
          <span className="ltr-nums line-through">
            {formatIls(originalPrice)}
          </span>{" "}
          ₪
        </p>

        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="הפחתת מחיר"
            onClick={() =>
              setNewPrice((price) =>
                Math.max(MIN_PRICE_UPDATE_PRICE, price - PRICE_UPDATE_STEP),
              )
            }
            className="size-10 rounded-xl border border-line text-lg font-bold text-ink hover:bg-canvas"
          >
            −
          </button>

          <label className="rounded-xl border-2 border-alert px-4 py-2">
            <span className="sr-only">מחיר מעודכן</span>
            <input
              type="number"
              inputMode="numeric"
              min={MIN_PRICE_UPDATE_PRICE}
              max={MAX_PRICE_UPDATE_PRICE}
              step={1}
              value={newPrice}
              onChange={(event) => setNewPrice(Number(event.target.value) || 0)}
              className="ltr-nums w-24 bg-transparent text-center text-2xl font-bold text-alert outline-none"
            />
            <span className="text-2xl font-bold text-alert">₪</span>
          </label>

          <button
            type="button"
            aria-label="הגדלת מחיר"
            onClick={() =>
              setNewPrice((price) =>
                Math.min(MAX_PRICE_UPDATE_PRICE, price + PRICE_UPDATE_STEP),
              )
            }
            className="size-10 rounded-xl border border-line text-lg font-bold text-ink hover:bg-canvas"
          >
            +
          </button>
        </div>
      </div>

      <p className="mt-2 text-sm text-muted">
        הפרש{" "}
        <span className="ltr-nums font-semibold text-ink">
          {delta > 0 ? "+" : ""}
          {formatIls(delta)}
        </span>{" "}
        ₪ · עמלת Handy על המחיר המעודכן{" "}
        <span className="ltr-nums">{formatIls(commission)}</span> ₪
      </p>

      {state.fieldErrors?.newPrice && (
        <div className="mt-2">
          <ErrorText>{state.fieldErrors.newPrice}</ErrorText>
        </div>
      )}

      <button
        type="submit"
        disabled={pending || uploading || !photoPath || delta === 0}
        className="mt-4 w-full rounded-xl bg-alert px-5 py-3 text-base font-bold text-white transition-colors hover:bg-alert/90 disabled:cursor-not-allowed disabled:bg-line disabled:text-muted"
      >
        {pending
          ? "שולח…"
          : photoPath
            ? "שלח בקשת אישור ללקוח"
            : "צלם את התקלה כדי להמשיך"}
      </button>

      {delta === 0 && photoPath && (
        <p className="mt-2 text-sm text-muted">
          המחיר המעודכן זהה למקורי — אין מה לאשר.
        </p>
      )}

      {state.error && (
        <div className="mt-3">
          <ErrorText>{state.error}</ErrorText>
        </div>
      )}
    </form>
  );
}
