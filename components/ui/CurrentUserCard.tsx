import { signOut } from "@/lib/actions/auth";
import { USER_ROLE_LABEL } from "@/lib/routes";
import type { CurrentUser } from "@/lib/supabase/session";
import { formatIsraeliMobile } from "@/lib/validation/auth";

const VERIFICATION_LABEL: Record<string, string> = {
  pending: "ממתין לאימות",
  verified: "מאומת",
  rejected: "נדחה",
  suspended: "מושהה",
};

/**
 * The "who am I" screen from the Phase 1 definition of done: proof that a real
 * session exists, that the role landed correctly, and that the row came out of
 * the database rather than out of a cookie.
 */
export function CurrentUserCard({
  user,
  verificationStatus,
}: {
  user: CurrentUser;
  verificationStatus?: string | null;
}) {
  return (
    <div className="w-full rounded-2xl border border-line bg-surface p-5">
      <h2 className="text-lg font-bold text-ink">מי אני</h2>
      <p className="mt-1 text-sm text-muted">
        הנתונים נקראים מטבלת <code>profiles</code> תחת RLS — כל משתמש רואה רק את
        השורה שלו.
      </p>

      <dl className="mt-4 space-y-3 text-sm">
        <Row label="תפקיד">
          <span className="rounded-full bg-ink px-2.5 py-0.5 text-xs font-semibold text-white">
            {USER_ROLE_LABEL[user.role]}
          </span>
          <code className="ms-2 text-xs text-muted">{user.role}</code>
        </Row>

        <Row label="שם">{user.fullName ?? "— לא הוזן —"}</Row>

        <Row label="טלפון">
          <span dir="ltr">{formatIsraeliMobile(user.phone)}</span>
        </Row>

        {verificationStatus && (
          <Row label="סטטוס אימות">
            {VERIFICATION_LABEL[verificationStatus] ?? verificationStatus}
          </Row>
        )}

        <Row label="נרשם בתאריך">
          {new Intl.DateTimeFormat("he-IL", {
            dateStyle: "long",
            timeStyle: "short",
          }).format(new Date(user.createdAt))}
        </Row>

        <Row label="מזהה משתמש">
          <code dir="ltr" className="text-xs break-all text-muted">
            {user.id}
          </code>
        </Row>
      </dl>

      <form action={signOut} className="mt-5">
        <button
          type="submit"
          className="rounded-xl border border-line px-4 py-2 text-sm font-medium text-ink"
        >
          התנתקות
        </button>
      </form>
    </div>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2">
      <dt className="w-32 shrink-0 text-muted">{label}</dt>
      <dd className="text-ink">{children}</dd>
    </div>
  );
}
