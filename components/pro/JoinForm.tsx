"use client";

import { useActionState, useState } from "react";
import {
  ProProfileFields,
  type ProProfileDefaults,
} from "@/components/pro/ProProfileFields";
import {
  VerificationUploads,
  type UploadedDocs,
} from "@/components/pro/VerificationUploads";
import {
  BUTTON_PRO,
  Card,
  ErrorText,
  SectionCard,
} from "@/components/ui/primitives";
import { saveProJoin } from "@/lib/actions/pros";
import { EMPTY_PRO_FORM_STATE } from "@/lib/actions/state";
import type { Category } from "@/lib/supabase/jobs";
import {
  REQUIRED_DOC_TYPES,
  SERVICE_RADIUS_LABEL,
  type VerificationDocType,
} from "@/lib/validation/pros";

/**
 * "פתיחת פרופיל מקצועי" — design/screens/pro-1.3-signup-verification.png.
 *
 * The design's fast path onto the platform: details and documents in one card,
 * trades and area in a second, and a summary of "הפרופיל שלך" pinned beside
 * them with the submit button. It writes exactly what steps 2 and 3 of the
 * guided onboarding write, so a pro who came this way resumes at step 4
 * instead of answering the same questions twice.
 */
export function JoinForm({
  userId,
  phone,
  categories,
  mapsKey,
  defaults,
  existingDocs,
}: {
  userId: string;
  phone: string;
  categories: Category[];
  mapsKey: string | null;
  defaults: ProProfileDefaults;
  existingDocs: ReadonlySet<VerificationDocType>;
}) {
  const [state, formAction, pending] = useActionState(
    saveProJoin,
    EMPTY_PRO_FORM_STATE,
  );
  const [docs, setDocs] = useState<UploadedDocs>({});

  // Mirrored from the fields below so the summary card can react without
  // lifting every control out of ProProfileFields.
  const [summary, setSummary] = useState<{
    categoryIds: string[];
    radiusKm: number;
  }>({ categoryIds: defaults.categoryIds, radiusKm: defaults.radiusKm });

  const fieldErrors = state.fieldErrors ?? {};

  const chosenTrades = categories
    .filter((category) => summary.categoryIds.includes(category.id))
    .map((category) => category.nameHe);

  return (
    <form action={formAction}>
      <div className="grid gap-6 lg:grid-cols-[20rem_minmax(0,1fr)] lg:items-start">
        <aside className="space-y-4 lg:sticky lg:top-6 lg:order-2 lg:self-start">
          <Card>
            <h2 className="text-lg font-bold text-ink">הפרופיל שלך</h2>

            <dl className="mt-4 divide-y divide-line text-sm">
              <SummaryRow
                label="התמחות"
                value={chosenTrades.length > 0 ? chosenTrades.join(", ") : null}
              />
              <SummaryRow
                label="רדיוס"
                value={SERVICE_RADIUS_LABEL[summary.radiusKm] ?? null}
              />
              <SummaryRow
                label="מסמכים"
                value={`${Object.keys(docs).length + existingDocs.size} הועלו`}
              />
            </dl>

            <p className="mt-4 rounded-xl bg-canvas p-4 text-sm text-muted">
              ✓ האישור נמסר תוך 24 שעות ע״י צוות Handy
            </p>

            {state.error && (
              <p className="mt-4">
                <ErrorText>{state.error}</ErrorText>
              </p>
            )}

            <button
              type="submit"
              disabled={pending}
              className={`${BUTTON_PRO} mt-4 w-full`}
            >
              {pending ? "שומר…" : "שלח והמשך ל-Onboarding"}
            </button>
          </Card>

          <div className="rounded-2xl bg-ink p-5 text-sm text-white/85">
            <h2 className="text-base font-bold text-white">
              למה למלא את הכול עכשיו?
            </h2>
            <p className="mt-2">
              פרופיל מאומת מקבל פי 3 יותר עבודות. אפשר לעצור ולהמשיך בכל רגע —
              מה שמילאתם נשמר.
            </p>
          </div>
        </aside>

        <div className="space-y-6 lg:order-1">
          <SectionCard step={1} tone="pro" title="פרטים ומסמכים">
            <ProProfileFields
              categories={categories}
              mapsKey={mapsKey}
              phone={phone}
              defaults={defaults}
              fieldErrors={fieldErrors}
              onSelectionChange={setSummary}
            />

            <div className="mt-6 border-t border-line pt-5">
              <h3 className="mb-3 text-sm font-semibold text-ink">
                מסמכי אימות
              </h3>
              <VerificationUploads
                userId={userId}
                types={REQUIRED_DOC_TYPES}
                existing={existingDocs}
                value={docs}
                onChange={setDocs}
                fieldErrors={fieldErrors}
              />
            </div>
          </SectionCard>

          <SectionCard
            step={2}
            tone="pro"
            title="אישור צוות Handy"
            hint="השלב האחרון קורה אצלנו, לא אצלכם."
          >
            <ol className="space-y-3 text-sm text-muted">
              <li>· המסמכים נבדקים ידנית — יעד מענה 24 שעות.</li>
              <li>
                · עד לאישור הפרופיל בסטטוס <strong>טיוטה</strong>, ואי אפשר
                לראות קריאות או להגיש הצעות. האכיפה היא ברמת מסד הנתונים, לא רק
                בממשק.
              </li>
              <li>· כשהפרופיל מאושר נשלח SMS, והפיד נפתח מיד.</li>
            </ol>
          </SectionCard>
        </div>
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
        className={`text-end font-bold ${value ? "text-pro" : "text-muted/60"}`}
      >
        {value ?? "—"}
      </dd>
    </div>
  );
}
