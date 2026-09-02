"use client";

import { useActionState } from "react";
import { Badge, BUTTON_BASE } from "@/components/ui/primitives";
import { decideProVerification } from "@/lib/actions/admin";
import { EMPTY_ADMIN_DECISION_STATE } from "@/lib/actions/state";
import { formatIsraeliMobile } from "@/lib/validation/auth";
import { VERIFICATION_DOC_LABEL } from "@/lib/validation/pros";
import type { ProApplication } from "@/lib/supabase/pros";

/**
 * One row of the approvals queue — design/screens/admin-7.2-pro-approvals.png.
 *
 * The buttons post to `decideProVerification`, which forwards to
 * `set_pro_verification()`. That function checks `is_admin()` itself, and no
 * client role holds an UPDATE grant on `verification_status` — so this row has
 * no privileged path to offer even if it were rendered to the wrong person.
 */
const STATUS_TONE: Record<
  string,
  { label: string; tone: "waiting" | "done" | "neutral" }
> = {
  pending: { label: "ממתין לבדיקה", tone: "waiting" },
  verified: { label: "מאומת", tone: "done" },
  rejected: { label: "נדחה", tone: "neutral" },
  suspended: { label: "מושהה", tone: "neutral" },
  draft: { label: "טיוטה", tone: "neutral" },
};

export function ProApprovalRow({
  application,
  docUrls,
}: {
  application: ProApplication;
  /** Signed, short-lived URLs keyed by object path. */
  docUrls: Record<string, string>;
}) {
  const [state, formAction, pending] = useActionState(
    decideProVerification,
    EMPTY_ADMIN_DECISION_STATE,
  );

  const status =
    state.decidedProId === application.userId && state.decidedStatus
      ? (STATUS_TONE[state.decidedStatus] ?? STATUS_TONE.pending!)
      : (STATUS_TONE[application.verificationStatus] ?? STATUS_TONE.pending!);

  const waitingFor = application.submittedAt
    ? hoursSince(application.submittedAt)
    : null;

  return (
    <li className="rounded-2xl border border-line bg-surface p-5">
      <div className="flex flex-wrap items-center gap-4">
        <span
          aria-hidden
          className="flex size-12 shrink-0 items-center justify-center rounded-full bg-canvas text-xl"
        >
          🧰
        </span>

        <div className="min-w-48 flex-1">
          <p className="font-bold text-ink">
            {application.fullName ?? "בעל מקצוע ללא שם"}
          </p>
          <p className="mt-1 text-sm text-muted">
            {application.categoryNames.length > 0
              ? application.categoryNames.join(", ")
              : "ללא תחום"}
            {application.serviceAddressText
              ? ` · ${application.serviceAddressText}`
              : ""}{" "}
            · <span dir="ltr">{formatIsraeliMobile(application.phone)}</span>
          </p>
        </div>

        <div className="min-w-40 text-sm">
          <p className="font-semibold text-ink">
            {application.docs.length > 0
              ? [
                  ...new Set(
                    application.docs.map(
                      (doc) =>
                        VERIFICATION_DOC_LABEL[doc.docType] ?? doc.docType,
                    ),
                  ),
                ].join(" + ")
              : "מסמכים לא הועלו"}
          </p>
          {waitingFor !== null && (
            <p className="mt-1 text-muted">ממתין {waitingFor}</p>
          )}
        </div>

        <Badge tone={status.tone}>{status.label}</Badge>
      </div>

      {application.docs.length > 0 && (
        <ul className="mt-4 flex flex-wrap gap-2">
          {application.docs.map((doc) => {
            const url = docUrls[doc.filePath];
            const label = VERIFICATION_DOC_LABEL[doc.docType] ?? doc.docType;

            return (
              <li key={doc.id}>
                {url ? (
                  <a
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 rounded-full border border-line px-3 py-1.5 text-xs font-semibold text-ink hover:border-ink"
                  >
                    צפה במסמך · {label}
                  </a>
                ) : (
                  <span className="inline-flex items-center gap-2 rounded-full border border-line px-3 py-1.5 text-xs text-muted">
                    {label} — הקובץ אינו זמין
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <form action={formAction} className="mt-4 flex flex-wrap gap-2">
        <input type="hidden" name="proId" value={application.userId} />

        <button
          type="submit"
          name="status"
          value="verified"
          disabled={pending}
          className={`${BUTTON_BASE} bg-cta px-5 py-2 text-sm text-white hover:bg-cta-strong`}
        >
          אשר
        </button>

        <button
          type="submit"
          name="status"
          value="rejected"
          disabled={pending}
          className={`${BUTTON_BASE} bg-red-600 px-5 py-2 text-sm text-white hover:bg-red-700`}
        >
          דחה
        </button>

        <button
          type="submit"
          name="status"
          value="suspended"
          disabled={pending}
          className={`${BUTTON_BASE} border border-line px-5 py-2 text-sm text-ink hover:bg-canvas`}
        >
          השהה
        </button>

        {state.error && (
          <p role="alert" className="text-sm font-medium text-red-700">
            {state.error}
          </p>
        )}
      </form>
    </li>
  );
}

function hoursSince(iso: string): string {
  const hours = Math.floor((Date.now() - new Date(iso).getTime()) / 3_600_000);
  if (hours < 1) return "פחות משעה";
  if (hours < 24) return `${hours} שעות`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "יום אחד" : `${days} ימים`;
}
