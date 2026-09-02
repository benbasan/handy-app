"use client";

import { useState } from "react";
import { AddressField, type AddressValue } from "@/components/ui/AddressField";
import { ErrorText, INPUT_CLASS } from "@/components/ui/primitives";
import { categoryIcon } from "@/lib/categories";
import type { Category } from "@/lib/supabase/jobs";
import {
  BIO_MAX,
  DEFAULT_SERVICE_RADIUS_KM,
  SERVICE_RADIUS_LABEL,
  SERVICE_RADIUS_OPTIONS,
} from "@/lib/validation/pros";

/**
 * "מי אתה, מה אתה עושה ואיפה" — the two cards on design/screens/
 * pro-1.3-signup-verification.png (פרטים / תחומי התמחות + אזור פעילות), and
 * step 2 of the guided onboarding, which asks exactly the same questions.
 *
 * One component for both so the two screens cannot drift apart. It renders
 * plain form controls and nothing else: the authority is `saveProProfile` /
 * `saveProJoin`, which re-validate with Zod and geocode the address
 * server-side.
 *
 * The address is an addition to the design, which shows only radius chips. A
 * radius has to be measured from somewhere before it can become an
 * `ST_DWithin`, and that somewhere is `pro_profiles.service_point`.
 */

export type ProProfileDefaults = {
  fullName: string;
  bio: string;
  categoryIds: string[];
  radiusKm: number;
  addressText: string;
};

export function ProProfileFields({
  categories,
  mapsKey,
  phone,
  defaults,
  fieldErrors,
  onSelectionChange,
}: {
  categories: Category[];
  mapsKey: string | null;
  phone: string;
  defaults: ProProfileDefaults;
  fieldErrors: Record<string, string>;
  /** For screens that echo the choices back — the join screen's summary card. */
  onSelectionChange?: (next: {
    categoryIds: string[];
    radiusKm: number;
  }) => void;
}) {
  const [selected, setSelected] = useState<string[]>(defaults.categoryIds);
  const [radiusKm, setRadiusKm] = useState(
    defaults.radiusKm || DEFAULT_SERVICE_RADIUS_KM,
  );
  const [address, setAddress] = useState<AddressValue>({
    text: defaults.addressText,
    lat: null,
    lng: null,
  });

  const toggle = (id: string) => {
    const next = selected.includes(id)
      ? selected.filter((value) => value !== id)
      : [...selected, id];
    setSelected(next);
    onSelectionChange?.({ categoryIds: next, radiusKm });
  };

  const chooseRadius = (next: number) => {
    setRadiusKm(next);
    onSelectionChange?.({ categoryIds: selected, radiusKm: next });
  };

  return (
    <div className="space-y-6">
      <input type="hidden" name="radiusKm" value={radiusKm} />
      {selected.map((id) => (
        <input key={id} type="hidden" name="categoryId" value={id} />
      ))}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label
            htmlFor="fullName"
            className="mb-1 block text-sm font-medium text-ink"
          >
            שם מלא
          </label>
          <input
            id="fullName"
            name="fullName"
            type="text"
            required
            maxLength={80}
            autoComplete="name"
            defaultValue={defaults.fullName}
            placeholder="יוסי מזרחי"
            className={INPUT_CLASS}
          />
          {fieldErrors.fullName && (
            <p className="mt-2">
              <ErrorText>{fieldErrors.fullName}</ErrorText>
            </p>
          )}
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-ink">
            טלפון
          </label>
          {/* Read-only, and not a form field at all: the phone number is the
              identity Supabase Auth keys the account on, and `profiles.phone`
              carries no update grant for anyone. */}
          <p
            dir="ltr"
            className={`${INPUT_CLASS} bg-canvas text-start text-muted`}
          >
            {phone}
          </p>
          <p className="mt-2 text-xs text-muted">
            זהו המספר שאיתו נכנסתם. שינוי מספר נעשה דרך התמיכה.
          </p>
        </div>
      </div>

      <div>
        <label
          htmlFor="bio"
          className="mb-1 block text-sm font-medium text-ink"
        >
          תיאור מקצועי <span className="text-muted">(לא חובה)</span>
        </label>
        <textarea
          id="bio"
          name="bio"
          rows={3}
          maxLength={BIO_MAX}
          defaultValue={defaults.bio}
          placeholder="אינסטלטור מוסמך, 12 שנות ניסיון. שירות מהיר באזור תל אביב."
          className={INPUT_CLASS}
        />
        {fieldErrors.bio && (
          <p className="mt-2">
            <ErrorText>{fieldErrors.bio}</ErrorText>
          </p>
        )}
      </div>

      <fieldset>
        <legend className="mb-2 text-sm font-medium text-ink">
          תחומי התמחות
        </legend>
        <div className="flex flex-wrap gap-2">
          {categories.map((category) => {
            const on = selected.includes(category.id);
            return (
              <button
                key={category.id}
                type="button"
                aria-pressed={on}
                onClick={() => toggle(category.id)}
                className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${
                  on
                    ? "border-pro bg-pro text-white"
                    : "border-line bg-surface text-ink hover:border-pro/40"
                }`}
              >
                <span aria-hidden>{categoryIcon(category.slug)}</span>
                {category.nameHe}
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-muted">
          רק קריאות בתחומים שבחרתם יגיעו לפיד שלכם.
        </p>
        {fieldErrors.categoryIds && (
          <p className="mt-2">
            <ErrorText>{fieldErrors.categoryIds}</ErrorText>
          </p>
        )}
      </fieldset>

      <div>
        <AddressField
          mapsKey={mapsKey}
          value={address}
          onChange={setAddress}
          error={fieldErrors.addressText}
          label="כתובת הבסיס שלך"
          placeholder="רח׳ ברודצקי 18, תל אביב"
          hint="ממנה נמדד רדיוס הפעילות. הכתובת עצמה לא מוצגת ללקוחות."
        />

        <fieldset className="mt-5">
          <legend className="mb-2 text-sm font-medium text-ink">
            אזור פעילות
          </legend>
          <div className="flex flex-wrap gap-2">
            {SERVICE_RADIUS_OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={option === radiusKm}
                onClick={() => chooseRadius(option)}
                className={`rounded-xl border px-5 py-3 text-sm font-semibold transition-colors ${
                  option === radiusKm
                    ? "border-ink bg-ink text-white"
                    : "border-line bg-surface text-ink hover:border-pro/40"
                }`}
              >
                {SERVICE_RADIUS_LABEL[option]}
              </button>
            ))}
          </div>
          {fieldErrors.radiusKm && (
            <p className="mt-2">
              <ErrorText>{fieldErrors.radiusKm}</ErrorText>
            </p>
          )}
        </fieldset>
      </div>
    </div>
  );
}
