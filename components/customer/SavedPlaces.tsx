"use client";

import { useActionState, useState } from "react";
import { removePlace, renamePlace, savePlace } from "@/lib/actions/places";
import { EMPTY_SAVED_PLACE_STATE } from "@/lib/actions/state";
import { AddressField, type AddressValue } from "@/components/ui/AddressField";
import {
  BUTTON_CTA,
  BUTTON_QUIET,
  FIELD_LABEL,
  INPUT_CLASS,
  SECTION_TITLE,
} from "@/components/ui/primitives";
import {
  PLACE_LABEL_MAX,
  PLACE_LABEL_SUGGESTIONS,
  type SavedPlace,
} from "@/lib/validation/places";

/**
 * "הכתובות שלי" — at the top of the personal area's main column, which is where
 * the customer decided it should live.
 *
 * Laid out as one row of chips rather than a list of cards, on purpose: this
 * sits ABOVE "הקריאות שלי", and a management panel that pushes the product's
 * actual content off the first screen would have bought findability with
 * something worth more. A chip opens to reveal its address and its two
 * controls; nothing else is on screen until it is asked for.
 *
 * Adding one here reuses `AddressField` in full — the same recognition, the
 * same device-location button, the same refusal — because an address saved
 * through a laxer control is an address the job form would then refuse. It
 * passes no `onSaved`: this component IS the form, and two save paths on one
 * screen would be two things to keep in step.
 */
export function SavedPlaces({
  places,
  mapsKey,
}: {
  places: readonly SavedPlace[];
  mapsKey: string | null;
}) {
  const [state, formAction, pending] = useActionState(
    savePlace,
    EMPTY_SAVED_PLACE_STATE,
  );

  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [address, setAddress] = useState<AddressValue>({
    text: "",
    lat: null,
    lng: null,
  });

  const fieldErrors = state.fieldErrors ?? {};
  const open = places.find((place) => place.id === openId) ?? null;

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className={SECTION_TITLE}>הכתובות שלי</h2>
        <button
          type="button"
          aria-expanded={adding}
          onClick={() => {
            setAdding((wasOpen) => !wasOpen);
            setOpenId(null);
          }}
          className={`${BUTTON_QUIET} px-3 py-1.5 text-sm`}
        >
          {adding ? "ביטול" : "הוספת כתובת"}
        </button>
      </div>

      {places.length === 0 && !adding && (
        <p className="mt-2 text-sm text-muted">
          כתובת שתשמרו תופיע בטופס הקריאה בלחיצה אחת, עם המיקום המדויק שבו
          נשמרה. אפשר לשמור אחת גם ישירות מטופס הקריאה, אחרי שהקלדתם את הכתובת.
        </p>
      )}

      {places.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {places.map((place) => (
            <button
              key={place.id}
              type="button"
              aria-expanded={openId === place.id}
              onClick={() =>
                setOpenId((current) => (current === place.id ? null : place.id))
              }
              className={`rounded-full border px-3 py-1 text-sm ${
                openId === place.id
                  ? "border-brand bg-canvas text-brand"
                  : "border-line bg-surface text-ink hover:bg-canvas"
              }`}
            >
              {place.label}
            </button>
          ))}
        </div>
      )}

      {open && <PlacePanel key={open.id} place={open} />}

      {adding && (
        <form action={formAction} className="mt-4 space-y-4">
          <div>
            <label htmlFor="label" className={FIELD_LABEL}>
              שם הכתובת
            </label>
            <input
              id="label"
              name="label"
              type="text"
              required
              maxLength={PLACE_LABEL_MAX}
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder="בית"
              className={INPUT_CLASS}
            />
            <div className="mt-2 flex flex-wrap gap-2">
              {PLACE_LABEL_SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => setLabel(suggestion)}
                  className="rounded-full border border-line bg-surface px-3 py-1 text-sm text-ink hover:bg-canvas"
                >
                  {suggestion}
                </button>
              ))}
            </div>
            {fieldErrors.label && (
              <p role="alert" className="mt-2 text-sm font-medium text-red-700">
                {fieldErrors.label}
              </p>
            )}
          </div>

          <AddressField
            mapsKey={mapsKey}
            value={address}
            onChange={setAddress}
            error={fieldErrors.addressText}
            hint="נשמור את הכתובת ואת המיקום שאותר, כדי שלא תצטרכו להקליד אותה שוב."
          />

          {state.error && (
            <p role="alert" className="text-sm font-medium text-red-700">
              {state.error}
            </p>
          )}

          <button type="submit" disabled={pending} className={BUTTON_CTA}>
            {pending ? "שומרים…" : "שמירת כתובת"}
          </button>
        </form>
      )}
    </section>
  );
}

/**
 * One saved address, opened. It is renamed or removed, never edited: an address
 * that changed is a different address, and quietly rewriting the one behind a
 * chip would mean a call posted to somewhere the customer no longer meant.
 */
function PlacePanel({ place }: { place: SavedPlace }) {
  const [renameState, renameAction, renaming] = useActionState(
    renamePlace,
    EMPTY_SAVED_PLACE_STATE,
  );
  const [removeState, removeAction, removing] = useActionState(
    removePlace,
    EMPTY_SAVED_PLACE_STATE,
  );

  const error = renameState.error ?? removeState.error;

  return (
    <div className="mt-3 rounded-xl border border-line p-3">
      <p className="text-sm text-ink">{place.addressText}</p>

      <div className="mt-3 flex flex-wrap items-end gap-2">
        <form action={renameAction} className="flex flex-1 flex-wrap gap-2">
          <input type="hidden" name="placeId" value={place.id} />
          <input
            name="label"
            type="text"
            required
            maxLength={PLACE_LABEL_MAX}
            defaultValue={place.label}
            aria-label="שם הכתובת"
            className={`${INPUT_CLASS} min-w-32 flex-1`}
          />
          <button
            type="submit"
            disabled={renaming}
            className={`${BUTTON_QUIET} px-3 py-1.5 text-sm`}
          >
            שינוי שם
          </button>
        </form>

        <form action={removeAction}>
          <input type="hidden" name="placeId" value={place.id} />
          <button
            type="submit"
            disabled={removing}
            className={`${BUTTON_QUIET} px-3 py-1.5 text-sm`}
          >
            מחיקה
          </button>
        </form>
      </div>

      {error && (
        <p role="alert" className="mt-2 text-sm font-medium text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
