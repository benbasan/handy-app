"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { savePlace } from "@/lib/actions/places";
import { EMPTY_SAVED_PLACE_STATE } from "@/lib/actions/state";
import {
  BUTTON_QUIET,
  FIELD_LABEL,
  INPUT_CLASS,
} from "@/components/ui/primitives";
import {
  LOCALITY_NAMES,
  matchLocality,
  nearestLocality,
} from "@/lib/maps/gazetteer";
import { coordinatesInIsrael } from "@/lib/maps/geometry";
import {
  PLACE_LABEL_MAX,
  PLACE_LABEL_SUGGESTIONS,
  type SavedPlace,
} from "@/lib/validation/places";

/**
 * The one address control in the product: the customer's job address
 * (product-spec.md 3.2) and the pro's base address, the centre their
 * `radius_km` is measured from (4.2). Both need the same behaviour, and both
 * feed the same server-side `geocodeAddress`.
 *
 * Three ways to answer it, in the order they cost the person anything:
 *
 *  1. A saved address — "בית", "עבודה". One tap, and it carries the exact point
 *     it was saved with, so nothing has to be parsed at all. Saving one happens
 *     HERE too, not only on the personal area: the moment a customer has just
 *     typed their address is the only moment saving it is a natural thing to
 *     do, and until that existed nobody ever got a first chip to tap.
 *  2. The device's location. Also an exact point, and the town name is filled
 *     in from it so the customer only has to add a street and a number. A pro
 *     needs a door, not a dot on a map.
 *  3. Typing. With a Maps key this is Places Autocomplete; without one — which
 *     is every deployment today (CLAUDE.md §2) — it is a plain input backed by
 *     the built-in gazetteer, which recognises the town AS THE CUSTOMER TYPES
 *     and offers a list of towns when it cannot. That last part is the whole
 *     point: an address that cannot be placed used to be discovered by the
 *     server, after the form was submitted, and reported as the customer's
 *     fault.
 *
 * Whatever the route, the coordinates are a hint and never the authority.
 * lib/maps/geocode.ts range-checks them again before anything reaches
 * `jobs.location`.
 */

type PlaceResult = {
  formatted_address?: string;
  geometry?: { location?: { lat(): number; lng(): number } };
};

type PlacesAutocomplete = {
  addListener(event: string, handler: () => void): void;
  getPlace(): PlaceResult;
};

type MapsNamespace = {
  maps?: {
    places?: {
      Autocomplete: new (
        input: HTMLInputElement,
        options: {
          componentRestrictions?: { country: string | string[] };
          fields?: string[];
          types?: string[];
        },
      ) => PlacesAutocomplete;
    };
  };
};

declare global {
  interface Window {
    google?: MapsNamespace;
  }
}

const SCRIPT_ID = "google-maps-places";

function loadMapsScript(key: string): Promise<void> {
  if (window.google?.maps?.places) return Promise.resolve();

  const existing = document.getElementById(SCRIPT_ID);
  if (existing) {
    return new Promise((resolve, reject) => {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("maps")));
    });
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.async = true;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&libraries=places&language=he&region=IL&loading=async`;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("maps"));
    document.head.appendChild(script);
  });
}

export type AddressValue = {
  text: string;
  lat: number | null;
  lng: number | null;
};

/**
 * A fix this coarse came from an IP lookup or a cell tower, not from GPS. It
 * still places the town correctly, which is all the gazetteer would have given
 * anyway — but it is not the door, and the screen says so rather than implying
 * a precision that is not there.
 */
const COARSE_ACCURACY_METRES = 1000;

type LocationState =
  | { status: "idle" }
  | { status: "locating" }
  | { status: "coarse" }
  | { status: "done" }
  | { status: "denied" }
  | { status: "failed" };

const LOCATION_MESSAGE: Record<LocationState["status"], string | null> = {
  idle: null,
  locating: "מאתרים את המיקום…",
  coarse: "המיקום שאותר מקורב. הוסיפו רחוב ומספר לדיוק.",
  done: "המיקום אותר. הוסיפו רחוב ומספר.",
  denied: "לא אישרתם גישה למיקום. אפשר להקליד את הכתובת ידנית.",
  failed: "לא הצלחנו לקרוא את המיקום מהמכשיר. הקלידו את הכתובת ידנית.",
};

export function AddressField({
  mapsKey,
  value,
  onChange,
  error,
  label = "כתובת מלאה",
  placeholder = "רח׳ ברודצקי 18, תל אביב",
  hint,
  savedPlaces = [],
  onSaved,
}: {
  mapsKey: string | null;
  value: AddressValue;
  onChange: (next: AddressValue) => void;
  error?: string;
  label?: string;
  /** Placeholder only — never a default value, or an untouched field would submit it. */
  placeholder?: string;
  /** Replaces the "how to fill this in" line under the input, when the screen needs its own. */
  hint?: string;
  /**
   * The customer's saved addresses, when the screen has any. A pro has one
   * service point, so their screens pass nothing and no chips are drawn.
   */
  savedPlaces?: readonly SavedPlace[];
  /**
   * Called with the row that was just saved from this field. Its PRESENCE is
   * what puts the "save this address" control on screen — one prop rather than
   * a pair, so there is no half-configured state where the button appears with
   * nowhere to report to. The pro screens pass nothing, which is right:
   * `savePlace` requires the customer role.
   */
  onSaved?: (place: SavedPlace) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const saveLabelId = useId();

  // The Places widget is wired up once, but `onChange` is a fresh closure on
  // every render. Keeping the latest one in a ref lets the effect below depend
  // only on the key, instead of tearing the widget down on each keystroke.
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  const [autocompleteReady, setAutocompleteReady] = useState(false);
  const [location, setLocation] = useState<LocationState>({ status: "idle" });

  const [savingPanel, setSavingPanel] = useState(false);
  const [saveLabel, setSaveLabel] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  useEffect(() => {
    if (!mapsKey) return;
    let cancelled = false;

    loadMapsScript(mapsKey)
      .then(() => {
        const Autocomplete = window.google?.maps?.places?.Autocomplete;
        const input = inputRef.current;
        if (cancelled || !Autocomplete || !input) return;

        const widget = new Autocomplete(input, {
          componentRestrictions: { country: "il" },
          fields: ["formatted_address", "geometry"],
        });

        widget.addListener("place_changed", () => {
          const place = widget.getPlace();
          const point = place.geometry?.location;
          onChangeRef.current({
            text: place.formatted_address ?? input.value,
            lat: point ? point.lat() : null,
            lng: point ? point.lng() : null,
          });
        });

        setAutocompleteReady(true);
      })
      .catch(() => {
        // A blocked or misconfigured key must not take the form down with it:
        // the plain input below is a complete fallback on its own.
        if (!cancelled) setAutocompleteReady(false);
      });

    return () => {
      cancelled = true;
    };
  }, [mapsKey]);

  /**
   * What the gazetteer makes of what has been typed so far.
   *
   * `recognised` is only shown where the customer is typing rather than
   * picking — with Autocomplete running, Google's answer is the better one and
   * this would second-guess it. `matched` is asked once and answers three
   * different questions, because it is the most expensive thing on this render.
   */
  const matched = matchLocality(value.text);
  const recognised = autocompleteReady ? null : matched;
  const unrecognised =
    !autocompleteReady && value.text.trim().length > 0 && !matched;

  /**
   * Offer to save only an address that can actually be placed — either the
   * device handed us a point, or the gazetteer found the town. Saving one that
   * cannot be placed would put a chip on screen that the job form then refuses.
   */
  const savable =
    onSaved !== undefined &&
    value.text.trim().length >= 5 &&
    ((value.lat !== null && value.lng !== null) || matched !== null);

  function saveThisAddress() {
    const label = saveLabel.trim();
    if (!label || !onSaved) return;

    setSaveError(null);
    startSaving(async () => {
      // A server action called from an event handler rather than through a
      // <form>: this field sits INSIDE the job form's own <form>, and a nested
      // one is invalid HTML.
      const formData = new FormData();
      formData.set("label", label);
      formData.set("addressText", value.text);
      if (value.lat !== null) formData.set("lat", String(value.lat));
      if (value.lng !== null) formData.set("lng", String(value.lng));

      const result = await savePlace(EMPTY_SAVED_PLACE_STATE, formData);

      if (!result.savedPlace) {
        setSaveError(
          result.fieldErrors?.addressText ??
            result.fieldErrors?.label ??
            result.error ??
            "לא הצלחנו לשמור את הכתובת.",
        );
        return;
      }

      onSaved(result.savedPlace);
      setSavingPanel(false);
      setSaveLabel("");
    });
  }

  function fillFromDeviceLocation() {
    if (!navigator.geolocation) {
      setLocation({ status: "failed" });
      return;
    }

    setLocation({ status: "locating" });

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude, accuracy } = position.coords;

        // The same box the server checks against. A device that reports a
        // point in another country is answering a question we did not ask.
        if (!coordinatesInIsrael(latitude, longitude)) {
          setLocation({ status: "failed" });
          return;
        }

        const town = nearestLocality(latitude, longitude);
        const coarse = accuracy > COARSE_ACCURACY_METRES;

        onChange({
          // The town, so `job_city()` has something real to read and the pro
          // can see where they are being sent. The street is still the
          // customer's to add — which is why the input takes focus.
          text: town ? `${town.name}` : value.text,
          lat: latitude,
          lng: longitude,
        });

        setLocation({ status: coarse ? "coarse" : "done" });
        inputRef.current?.focus();
      },
      (cause) => {
        setLocation({
          status: cause.code === cause.PERMISSION_DENIED ? "denied" : "failed",
        });
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  }

  return (
    <div>
      <label htmlFor="addressText" className={`${FIELD_LABEL}`}>
        {label}
      </label>

      {savedPlaces.length > 0 && (
        <div className="mb-3">
          {/* A row of round buttons with no heading is a menu without a name. */}
          <p className="mb-1 text-xs text-muted">כתובות שמורות</p>
          <div className="flex flex-wrap gap-2">
            {savedPlaces.map((place) => (
              <button
                key={place.id}
                type="button"
                title={place.addressText}
                onClick={() => {
                  onChange({
                    text: place.addressText,
                    lat: place.lat,
                    lng: place.lng,
                  });
                  setLocation({ status: "idle" });
                  setSavingPanel(false);
                }}
                className="rounded-full border border-line bg-surface px-3 py-1 text-sm text-ink hover:bg-canvas"
              >
                {place.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <input
        ref={inputRef}
        id="addressText"
        name="addressText"
        type="text"
        autoComplete="street-address"
        placeholder={placeholder}
        required
        maxLength={200}
        value={value.text}
        list={autocompleteReady ? undefined : listId}
        onChange={(event) =>
          // Typing after picking a place invalidates the picked coordinates.
          onChange({ text: event.target.value, lat: null, lng: null })
        }
        className={INPUT_CLASS}
      />

      {!autocompleteReady && (
        <datalist id={listId}>
          {LOCALITY_NAMES.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
      )}

      <input type="hidden" name="lat" value={value.lat ?? ""} />
      <input type="hidden" name="lng" value={value.lng ?? ""} />

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={fillFromDeviceLocation}
          disabled={location.status === "locating"}
          className={`${BUTTON_QUIET} px-3 py-1.5 text-sm`}
        >
          השתמשו במיקום הנוכחי
        </button>

        {savable && !savingPanel && (
          <button
            type="button"
            aria-expanded={false}
            onClick={() => {
              setSaveError(null);
              setSavingPanel(true);
            }}
            className={`${BUTTON_QUIET} px-3 py-1.5 text-sm`}
          >
            שמרו כתובת זו
          </button>
        )}

        {LOCATION_MESSAGE[location.status] && (
          <span className="text-xs text-muted">
            {LOCATION_MESSAGE[location.status]}
          </span>
        )}
      </div>

      {savable && savingPanel && (
        <div className="mt-3 rounded-xl border border-line p-3">
          <label htmlFor={saveLabelId} className={FIELD_LABEL}>
            שם לכתובת הזו
          </label>

          <div className="mb-2 flex flex-wrap gap-2">
            {PLACE_LABEL_SUGGESTIONS.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => setSaveLabel(suggestion)}
                className="rounded-full border border-line bg-surface px-3 py-1 text-sm text-ink hover:bg-canvas"
              >
                {suggestion}
              </button>
            ))}
          </div>

          <input
            id={saveLabelId}
            type="text"
            maxLength={PLACE_LABEL_MAX}
            value={saveLabel}
            placeholder="בית"
            onChange={(event) => setSaveLabel(event.target.value)}
            className={INPUT_CLASS}
          />

          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={saving || saveLabel.trim() === ""}
              onClick={saveThisAddress}
              className={`${BUTTON_QUIET} px-3 py-1.5 text-sm`}
            >
              {saving ? "שומרים…" : "שמירה"}
            </button>
            <button
              type="button"
              aria-expanded
              onClick={() => {
                setSavingPanel(false);
                setSaveError(null);
              }}
              className={`${BUTTON_QUIET} px-3 py-1.5 text-sm`}
            >
              ביטול
            </button>
          </div>

          {saveError && (
            <p role="alert" className="mt-2 text-sm font-medium text-red-700">
              {saveError}
            </p>
          )}
        </div>
      )}

      {unrecognised && (
        <div className="mt-3">
          <label htmlFor="addressCity" className={FIELD_LABEL}>
            לא זיהינו את היישוב — בחרו אותו מהרשימה
          </label>
          <select
            id="addressCity"
            className={INPUT_CLASS}
            value=""
            onChange={(event) => {
              const city = event.target.value;
              if (!city) return;
              // Appended rather than substituted: what was typed is the street,
              // and the town goes where job_city() reads it — after the last
              // comma.
              const street = value.text.trim().replace(/,+$/, "");
              onChange({ text: `${street}, ${city}`, lat: null, lng: null });
            }}
          >
            <option value="">בחרו יישוב…</option>
            {LOCALITY_NAMES.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>
      )}

      <p className="mt-2 text-xs text-muted">
        {hint ??
          (autocompleteReady
            ? "בחרו כתובת מההשלמה האוטומטית לדיוק מרבי."
            : recognised
              ? `זוהה: ${recognised.name}`
              : "הזינו רחוב, מספר ועיר. נאתר את המיקום לפי מה שהזנתם.")}
      </p>

      {error && (
        <p role="alert" className="mt-2 text-sm font-medium text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
