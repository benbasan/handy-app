"use client";

import { useState } from "react";
import { useActionState } from "react";
import {
  VerificationUploads,
  type UploadedDocs,
} from "@/components/pro/VerificationUploads";
import { BUTTON_PRO, ErrorText } from "@/components/ui/primitives";
import { saveProDocuments } from "@/lib/actions/pros";
import { EMPTY_PRO_FORM_STATE } from "@/lib/actions/state";
import {
  VERIFICATION_DOC_TYPES,
  type VerificationDocType,
} from "@/lib/validation/pros";

/**
 * Onboarding step 3 — מסמכים ואימות.
 *
 * All four document types, unlike the fast /pro/join screen which asks only
 * for the two that are required. product-spec.md 4.2 puts the photography
 * guidance on this step, which is why it is spelled out here rather than left
 * to the tiles' one-line hints.
 */
export function OnboardingDocumentsStep({
  userId,
  existing,
}: {
  userId: string;
  existing: ReadonlySet<VerificationDocType>;
}) {
  const [state, formAction, pending] = useActionState(
    saveProDocuments,
    EMPTY_PRO_FORM_STATE,
  );
  const [docs, setDocs] = useState<UploadedDocs>({});

  const missingRequired = !existing.has("id_card") && !docs.id_card;

  return (
    <form action={formAction} className="space-y-6">
      <ol className="space-y-2 rounded-xl bg-canvas p-4 text-sm text-muted">
        <li>· צלמו על משטח שטוח, בתאורה טבעית, בלי פלאש.</li>
        <li>· ודאו שכל ארבע הפינות של המסמך בתוך הפריים.</li>
        <li>· כל הספרות והאותיות חייבות להיות קריאות בזום.</li>
      </ol>

      <VerificationUploads
        userId={userId}
        types={VERIFICATION_DOC_TYPES}
        existing={existing}
        value={docs}
        onChange={setDocs}
        fieldErrors={state.fieldErrors ?? {}}
      />

      {missingRequired && (
        <p className="text-sm text-muted">
          ת.ז או רישיון מקצוע הוא המסמך היחיד שחייב להיות בתיק לפני שליחה
          לאישור. אפשר להמשיך עכשיו ולהעלות אותו לפני השליחה בשלב 5.
        </p>
      )}

      {state.error && <ErrorText>{state.error}</ErrorText>}

      <button type="submit" disabled={pending} className={BUTTON_PRO}>
        {pending ? "שומר…" : "שמירה והמשך"}
      </button>
    </form>
  );
}
