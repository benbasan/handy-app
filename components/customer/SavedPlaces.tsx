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
} from "@/components/ui/primitives";
import {
  PLACE_LABEL_MAX,
  PLACE_LABEL_SUGGESTIONS,
  type SavedPlace,
} from "@/lib/validation/places";

/**
 * "הכתובות שלי" on the personal area.
 *
 * The list is where a saved address is managed; the job form is where it is
 * used. Adding one reuses `AddressField` in full — the same recognition, the
 * same device-location button, the same refusal — because an address saved
 * through a laxer control would be an address the job form then could not
 * place.
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
  const [label, setLabel] = useState("");
  const [address, setAddress] = useState<AddressValue>({
    text: "",
    lat: null,
    lng: null,
  });

  const fieldErrors = state.fieldErrors ?? {};

  return (
    <section>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-ink">הכתובות שלי</h2>
        <button
          type="button"
          onClick={() => setAdding((open) => !open)}
          className={`${BUTTON_QUIET} px-3 py-1.5 text-sm`}
        >
          {adding ? "ביטול" : "הוספת כתובת"}
        </button>
      </div>

      {places.length === 0 && !adding && (
        <p className="mt-2 text-sm text-muted">
          כתובת שתשמרו כאן תופיע בטופס הקריאה בלחיצה אחת, עם המיקום המדויק שבו
          נשמרה.
        </p>
      )}

      {places.length > 0 && (
        <ul className="mt-4 space-y-3">
          {places.map((place) => (
            <PlaceRow key={place.id} place={place} />
          ))}
        </ul>
      )}

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
 * A saved address is renamed or removed, never edited: an address that changed
 * is a different address, and quietly rewriting the one behind a chip would
 * mean a call posted to somewhere the customer no longer meant.
 */
function PlaceRow({ place }: { place: SavedPlace }) {
  const [renameState, renameAction, renaming] = useActionState(
    renamePlace,
    EMPTY_SAVED_PLACE_STATE,
  );
  const [removeState, removeAction, removing] = useActionState(
    removePlace,
    EMPTY_SAVED_PLACE_STATE,
  );

  const [editing, setEditing] = useState(false);
  const error = renameState.error ?? removeState.error;

  return (
    <li className="rounded-xl border border-line p-3">
      {editing ? (
        <form action={renameAction} className="flex flex-wrap gap-2">
          <input type="hidden" name="placeId" value={place.id} />
          <input
            name="label"
            type="text"
            required
            maxLength={PLACE_LABEL_MAX}
            defaultValue={place.label}
            aria-label="שם הכתובת"
            className={`${INPUT_CLASS} flex-1`}
          />
          <button
            type="submit"
            disabled={renaming}
            className={`${BUTTON_QUIET} px-3 py-1.5 text-sm`}
          >
            שמירה
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className={`${BUTTON_QUIET} px-3 py-1.5 text-sm`}
          >
            ביטול
          </button>
        </form>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="font-bold text-ink">{place.label}</p>
            <p className="mt-0.5 truncate text-xs text-muted">
              {place.addressText}
            </p>
          </div>

          <button
            type="button"
            onClick={() => setEditing(true)}
            className={`${BUTTON_QUIET} px-3 py-1.5 text-sm`}
          >
            שינוי שם
          </button>

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
      )}

      {error && (
        <p role="alert" className="mt-2 text-sm font-medium text-red-700">
          {error}
        </p>
      )}
    </li>
  );
}
