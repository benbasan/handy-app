"use client";

import { useActionState, useState } from "react";
import { createJob, type CreateJobState } from "@/lib/actions/jobs";
import { categoryIcon } from "@/lib/categories";
import type { Category } from "@/lib/supabase/jobs";
import {
  DEFAULT_SEARCH_RADIUS_KM,
  DESCRIPTION_MAX,
  PREFERRED_TIMES,
  PREFERRED_TIME_LABEL,
  SEARCH_RADIUS_OPTIONS,
  type PreferredTime,
} from "@/lib/validation/jobs";
import {
  BUTTON_CTA,
  Card,
  ErrorText,
  INPUT_CLASS,
  SectionCard,
} from "@/components/ui/primitives";
import { AddressField, type AddressValue } from "./AddressField";
import { EMPTY_MEDIA, MediaFields, type MediaValue } from "./MediaFields";

/**
 * Posting a job — design/screens/customer-2.1-post-job.png.
 *
 * The spec (3.2) describes this as a sequence of steps: category → description
 * → media → availability → address → summary → publish. The design lays that
 * same sequence out as one scrolling page with a live summary pinned beside
 * it, which is what is built here: the steps keep their order and their
 * numbers, but nothing is hidden behind a "next" button. On a phone the two
 * columns stack and the summary lands at the end, where the publish button
 * belongs anyway.
 *
 * Everything in this component is a convenience. The authority is
 * `createJob` — it re-validates every field with Zod, resolves the address
 * server-side, and writes `customer_id` from the session.
 */

const INITIAL: CreateJobState = {};

export function PostJobForm({
  userId,
  categories,
  mapsKey,
}: {
  userId: string;
  categories: Category[];
  mapsKey: string | null;
}) {
  const [state, formAction, pending] = useActionState(createJob, INITIAL);

  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [preferredTime, setPreferredTime] = useState<PreferredTime | null>(
    null,
  );
  const [address, setAddress] = useState<AddressValue>({
    text: "",
    lat: null,
    lng: null,
  });
  const [radiusKm, setRadiusKm] = useState<number>(DEFAULT_SEARCH_RADIUS_KM);
  const [media, setMedia] = useState<MediaValue>(EMPTY_MEDIA);

  const selectedCategory = categories.find((c) => c.id === categoryId) ?? null;
  const fieldErrors = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="categoryId" value={categoryId ?? ""} />
      <input type="hidden" name="preferredTime" value={preferredTime ?? ""} />
      <input type="hidden" name="searchRadiusKm" value={radiusKm} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-6">
          <SectionCard step={1} title="תחום">
            <div
              role="radiogroup"
              aria-label="תחום"
              className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5"
            >
              {categories.map((category) => {
                const selected = category.id === categoryId;
                return (
                  <button
                    key={category.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setCategoryId(category.id)}
                    className={`flex flex-col items-center gap-2 rounded-xl border p-4 text-sm font-bold transition-colors ${
                      selected
                        ? "border-brand bg-brand-soft text-brand"
                        : "border-line bg-surface text-ink hover:border-brand/40"
                    }`}
                  >
                    <span aria-hidden className="text-2xl">
                      {categoryIcon(category.slug)}
                    </span>
                    {category.nameHe}
                  </button>
                );
              })}
            </div>
            {fieldErrors.categoryId && (
              <p className="mt-3">
                <ErrorText>{fieldErrors.categoryId}</ErrorText>
              </p>
            )}
          </SectionCard>

          <SectionCard
            step={2}
            title="תיאור התקלה"
            hint="ככל שהתיאור מדויק יותר, ההצעות שתקבלו מדויקות יותר."
          >
            <label htmlFor="description" className="sr-only">
              תיאור התקלה
            </label>
            <textarea
              id="description"
              name="description"
              rows={4}
              required
              maxLength={DESCRIPTION_MAX}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="לדוגמה: נזילה מתחת לכיור במטבח, המים מצטברים על הרצפה מהבוקר"
              className={INPUT_CLASS}
            />
            {fieldErrors.description && (
              <p className="mt-2">
                <ErrorText>{fieldErrors.description}</ErrorText>
              </p>
            )}

            <div className="mt-4">
              <h3 className="mb-2 text-sm font-semibold text-ink">
                צירוף מדיה — לא חובה, אבל משפר את דיוק ההצעות
              </h3>
              <MediaFields userId={userId} value={media} onChange={setMedia} />
            </div>
          </SectionCard>

          <div className="grid gap-6 sm:grid-cols-5">
            {/* Two of five columns, matching the design's narrower card. */}
            <div className="sm:col-span-2">
              <SectionCard step={3} title="מתי נוח לך?">
                <div
                  role="radiogroup"
                  aria-label="מתי נוח לך"
                  className="space-y-2"
                >
                  {PREFERRED_TIMES.map((option) => {
                    const selected = option === preferredTime;
                    return (
                      <button
                        key={option}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => setPreferredTime(option)}
                        className={`w-full rounded-xl border px-4 py-3 text-start text-sm font-semibold transition-colors ${
                          selected
                            ? "border-brand bg-brand text-white"
                            : "border-line bg-surface text-ink hover:border-brand/40"
                        }`}
                      >
                        {PREFERRED_TIME_LABEL[option]}
                      </button>
                    );
                  })}
                </div>
                {fieldErrors.preferredTime && (
                  <p className="mt-3">
                    <ErrorText>{fieldErrors.preferredTime}</ErrorText>
                  </p>
                )}
              </SectionCard>
            </div>

            <div className="sm:col-span-3">
              <SectionCard step={4} title="כתובת">
                <AddressField
                  mapsKey={mapsKey}
                  value={address}
                  onChange={setAddress}
                  error={fieldErrors.addressText}
                />

                <fieldset className="mt-5">
                  <legend className="mb-2 text-sm font-medium text-ink">
                    רדיוס חיפוש
                  </legend>
                  <div className="flex flex-wrap gap-2">
                    {SEARCH_RADIUS_OPTIONS.map((option) => (
                      <button
                        key={option}
                        type="button"
                        aria-pressed={option === radiusKm}
                        onClick={() => setRadiusKm(option)}
                        className={`rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${
                          option === radiusKm
                            ? "border-brand bg-brand-soft text-brand"
                            : "border-line bg-surface text-muted hover:border-brand/40"
                        }`}
                      >
                        {option} ק״מ
                      </button>
                    ))}
                  </div>
                </fieldset>
              </SectionCard>
            </div>
          </div>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          <Card>
            <h2 className="text-lg font-bold text-ink">סיכום הקריאה</h2>

            <dl className="mt-4 divide-y divide-line text-sm">
              <SummaryRow label="תחום" value={selectedCategory?.nameHe} />
              <SummaryRow
                label="מועד"
                value={
                  preferredTime ? PREFERRED_TIME_LABEL[preferredTime] : null
                }
              />
              <SummaryRow label="אזור" value={address.text || null} />
              <SummaryRow label="רדיוס" value={`${radiusKm} ק״מ`} />
            </dl>

            <p className="mt-4 rounded-xl bg-canvas p-4 text-sm text-muted">
              פרסום הקריאה חינם. התשלום מתבצע ישירות לבעל המקצוע בסיום העבודה.
            </p>

            {state.error && (
              <p className="mt-4">
                <ErrorText>{state.error}</ErrorText>
              </p>
            )}

            <button
              type="submit"
              disabled={pending}
              className={`${BUTTON_CTA} mt-4 w-full`}
            >
              {pending ? "מפרסם…" : "פרסם קריאה"}
            </button>
          </Card>

          <div className="rounded-2xl bg-ink p-5 text-sm text-white/85">
            <h2 className="text-base font-bold text-white">
              מה קורה אחרי הפרסום?
            </h2>
            <ul className="mt-3 space-y-2">
              <li>· הקריאה נשלחת לבעלי מקצוע מאומתים ברדיוס {radiusKm} ק״מ</li>
              <li>· ההצעות הראשונות מגיעות תוך דקות</li>
              <li>· אתם בוחרים — ואפשר להתכתב לפני</li>
            </ul>
          </div>
        </aside>
      </div>
    </form>
  );
}

function SummaryRow({
  label,
  value,
}: {
  label: string;
  value?: string | null;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-3">
      <dt className="text-muted">{label}</dt>
      <dd
        className={`text-end font-bold ${value ? "text-ink" : "text-muted/60"}`}
      >
        {value ?? "—"}
      </dd>
    </div>
  );
}
