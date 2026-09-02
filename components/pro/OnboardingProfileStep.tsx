"use client";

import { useActionState } from "react";
import {
  ProProfileFields,
  type ProProfileDefaults,
} from "@/components/pro/ProProfileFields";
import { BUTTON_PRO, ErrorText } from "@/components/ui/primitives";
import { saveProProfile } from "@/lib/actions/pros";
import { EMPTY_PRO_FORM_STATE } from "@/lib/actions/state";
import type { Category } from "@/lib/supabase/jobs";

/** Onboarding step 2 — פרופיל מקצועי. The same fields /pro/join collects. */
export function OnboardingProfileStep({
  categories,
  mapsKey,
  phone,
  defaults,
}: {
  categories: Category[];
  mapsKey: string | null;
  phone: string;
  defaults: ProProfileDefaults;
}) {
  const [state, formAction, pending] = useActionState(
    saveProProfile,
    EMPTY_PRO_FORM_STATE,
  );

  return (
    <form action={formAction} className="space-y-6">
      <ProProfileFields
        categories={categories}
        mapsKey={mapsKey}
        phone={phone}
        defaults={defaults}
        fieldErrors={state.fieldErrors ?? {}}
      />

      {state.error && <ErrorText>{state.error}</ErrorText>}

      <button type="submit" disabled={pending} className={BUTTON_PRO}>
        {pending ? "שומר…" : "שמירה והמשך"}
      </button>
    </form>
  );
}
