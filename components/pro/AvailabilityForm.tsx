"use client";

import { useActionState, useState } from "react";
import {
  BUTTON_PRO,
  Card,
  ErrorText,
  INPUT_CLASS,
} from "@/components/ui/primitives";
import { categoryIcon } from "@/lib/categories";
import { saveAvailability } from "@/lib/actions/pros";
import { EMPTY_PRO_FORM_STATE } from "@/lib/actions/state";
import type { Category } from "@/lib/supabase/jobs";
import type { ProProfile } from "@/lib/supabase/pros";
import {
  SERVICE_RADIUS_LABEL,
  SERVICE_RADIUS_OPTIONS,
  WORK_DAYS,
  WORK_DAY_FULL_LABEL,
  WORK_DAY_LABEL,
  trimSeconds,
} from "@/lib/validation/pros";

/**
 * "זמינות, אזור ולוח זמנים" — design/screens/pro-5.2-availability-settings.png.
 *
 * The design's left column also carries notification switches and a bank
 * summary card. Notifications are Phase 4/6 material and the `notifications`
 * table does not exist yet (docs/architecture.md is explicit that it arrives
 * with the feature); the payout details are read-only here and edited in
 * onboarding step 5, so this screen shows them rather than offering a second
 * place to change them.
 *
 * `accepting_jobs` and `radius_km` are not cosmetic: both are conditions
 * inside `pro_serves_job()`, so saving this form changes what the RLS policy
 * itself returns.
 */
export function AvailabilityForm({
  profile,
  categories,
}: {
  profile: ProProfile;
  categories: Category[];
}) {
  const [state, formAction, pending] = useActionState(
    saveAvailability,
    EMPTY_PRO_FORM_STATE,
  );

  const [accepting, setAccepting] = useState(profile.acceptingJobs);
  const [days, setDays] = useState<number[]>(profile.workDays);
  const [radiusKm, setRadiusKm] = useState(profile.radiusKm);
  const [trades, setTrades] = useState<string[]>(profile.categoryIds);

  const fieldErrors = state.fieldErrors ?? {};

  const toggleDay = (day: number) =>
    setDays((current) =>
      current.includes(day)
        ? current.filter((value) => value !== day)
        : [...current, day],
    );

  const toggleTrade = (id: string) =>
    setTrades((current) =>
      current.includes(id)
        ? current.filter((value) => value !== id)
        : [...current, id],
    );

  return (
    <form action={formAction} className="space-y-6">
      {accepting && <input type="hidden" name="acceptingJobs" value="on" />}
      <input type="hidden" name="radiusKm" value={radiusKm} />
      {days.map((day) => (
        <input key={day} type="hidden" name="workDay" value={day} />
      ))}
      {trades.map((id) => (
        <input key={id} type="hidden" name="categoryId" value={id} />
      ))}

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-ink">קבלת קריאות</h2>
            <p className="mt-1 text-sm text-muted">
              כיבוי מפסיק את ההתראות מיד, בלי לפגוע בדירוג.
            </p>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={accepting}
            onClick={() => setAccepting((current) => !current)}
            className={`inline-flex items-center gap-3 rounded-xl border px-4 py-3 text-sm font-bold transition-colors ${
              accepting
                ? "border-cta bg-cta/10 text-cta-strong"
                : "border-line bg-surface text-muted"
            }`}
          >
            <span
              aria-hidden
              className={`relative h-6 w-11 rounded-full transition-colors ${accepting ? "bg-cta" : "bg-line"}`}
            >
              <span
                className={`absolute top-0.5 size-5 rounded-full bg-white transition-all ${
                  accepting ? "end-0.5" : "start-0.5"
                }`}
              />
            </span>
            {accepting ? "זמין לקריאות" : "לא זמין"}
          </button>
        </div>
      </Card>

      <Card>
        <h2 className="text-lg font-bold text-ink">ימי עבודה</h2>

        <div className="mt-4 flex flex-wrap gap-2">
          {WORK_DAYS.map((day) => {
            const on = days.includes(day);
            return (
              <button
                key={day}
                type="button"
                aria-pressed={on}
                aria-label={WORK_DAY_FULL_LABEL[day]}
                onClick={() => toggleDay(day)}
                className={`h-12 w-16 rounded-xl border text-base font-bold transition-colors ${
                  on
                    ? "border-pro bg-pro text-white"
                    : "border-line bg-surface text-ink hover:border-pro/40"
                }`}
              >
                {WORK_DAY_LABEL[day]}
              </button>
            );
          })}
        </div>
        {fieldErrors.workDays && (
          <p className="mt-2">
            <ErrorText>{fieldErrors.workDays}</ErrorText>
          </p>
        )}

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div>
            <label
              htmlFor="workStartTime"
              className="mb-1 block text-sm font-medium text-ink"
            >
              משעה
            </label>
            <input
              id="workStartTime"
              name="workStartTime"
              type="time"
              required
              defaultValue={trimSeconds(profile.workStartTime)}
              className={`${INPUT_CLASS} ltr-nums`}
            />
            {fieldErrors.workStartTime && (
              <p className="mt-2">
                <ErrorText>{fieldErrors.workStartTime}</ErrorText>
              </p>
            )}
          </div>

          <div>
            <label
              htmlFor="workEndTime"
              className="mb-1 block text-sm font-medium text-ink"
            >
              עד שעה
            </label>
            <input
              id="workEndTime"
              name="workEndTime"
              type="time"
              required
              defaultValue={trimSeconds(profile.workEndTime)}
              className={`${INPUT_CLASS} ltr-nums`}
            />
            {fieldErrors.workEndTime && (
              <p className="mt-2">
                <ErrorText>{fieldErrors.workEndTime}</ErrorText>
              </p>
            )}
          </div>
        </div>
      </Card>

      <Card>
        <h2 className="text-lg font-bold text-ink">אזור פעילות</h2>
        <p className="mt-1 text-sm text-muted">
          הרדיוס נמדד מכתובת הבסיס שלכם
          {profile.serviceAddressText ? ` — ${profile.serviceAddressText}` : ""}
          . קריאה מוצגת רק אם היא בתוך הרדיוס שלכם וגם בתוך הרדיוס שהלקוח ביקש
          לשדר אליו.
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          {SERVICE_RADIUS_OPTIONS.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={option === radiusKm}
              onClick={() => setRadiusKm(option)}
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
      </Card>

      <Card>
        <h2 className="text-lg font-bold text-ink">תחומי התמחות</h2>
        <div className="mt-4 flex flex-wrap gap-2">
          {categories.map((category) => {
            const on = trades.includes(category.id);
            return (
              <button
                key={category.id}
                type="button"
                aria-pressed={on}
                onClick={() => toggleTrade(category.id)}
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
        {fieldErrors.categoryIds && (
          <p className="mt-2">
            <ErrorText>{fieldErrors.categoryIds}</ErrorText>
          </p>
        )}
      </Card>

      {state.error && <ErrorText>{state.error}</ErrorText>}

      <div className="flex flex-wrap items-center gap-4">
        <button type="submit" disabled={pending} className={BUTTON_PRO}>
          {pending ? "שומר…" : "שמירת ההגדרות"}
        </button>
        {state.saved && !pending && (
          <p role="status" className="text-sm font-semibold text-cta-strong">
            ✓ ההגדרות נשמרו
          </p>
        )}
      </div>
    </form>
  );
}
