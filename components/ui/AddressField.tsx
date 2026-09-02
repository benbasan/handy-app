"use client";

import { useEffect, useRef, useState } from "react";
import { INPUT_CLASS } from "@/components/ui/primitives";

/**
 * The one address control in the product: the customer's job address
 * (product-spec.md 3.2) and the pro's base address, the centre their
 * `radius_km` is measured from (4.2). Both need the same behaviour, and both
 * feed the same server-side `geocodeAddress`.
 *
 * With a Maps key it is Google Places Autocomplete, and the chosen place's
 * coordinates ride along with the form so the server does not have to geocode
 * the same string twice. With no key — CI, a fresh clone, any deploy where the
 * key has not been issued yet — the same input is an ordinary text field and
 * the server geocodes it against the built-in gazetteer instead. The flow does
 * not branch anywhere else: `lat`/`lng` are simply absent.
 *
 * The coordinates are a hint, never the authority. lib/maps/geocode.ts
 * range-checks them before anything reaches `jobs.location`.
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

export function AddressField({
  mapsKey,
  value,
  onChange,
  error,
  label = "כתובת מלאה",
  placeholder = "רח׳ ברודצקי 18, תל אביב",
  hint,
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
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  // The Places widget is wired up once, but `onChange` is a fresh closure on
  // every render. Keeping the latest one in a ref lets the effect below depend
  // only on the key, instead of tearing the widget down on each keystroke.
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  const [autocompleteReady, setAutocompleteReady] = useState(false);

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
          const location = place.geometry?.location;
          onChangeRef.current({
            text: place.formatted_address ?? input.value,
            lat: location ? location.lat() : null,
            lng: location ? location.lng() : null,
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

  return (
    <div>
      <label
        htmlFor="addressText"
        className="mb-1 block text-sm font-medium text-ink"
      >
        {label}
      </label>

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
        onChange={(event) =>
          // Typing after picking a place invalidates the picked coordinates.
          onChange({ text: event.target.value, lat: null, lng: null })
        }
        className={INPUT_CLASS}
      />

      <input type="hidden" name="lat" value={value.lat ?? ""} />
      <input type="hidden" name="lng" value={value.lng ?? ""} />

      <p className="mt-2 text-xs text-muted">
        {hint ??
          (autocompleteReady
            ? "בחרו כתובת מההשלמה האוטומטית לדיוק מרבי."
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
