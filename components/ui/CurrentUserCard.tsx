import { signOut } from "@/lib/actions/auth";
import { CARD_BASE, SECTION_TITLE } from "@/components/ui/primitives";
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
 * The customer's and the pro's account card.
 *
 * It began life as the "who am I" screen from Phase 1's definition of done —
 * proof that a real session existed, that the role landed correctly, and that
 * the row came out of the database rather than a cookie. That was the right
 * card for a repo with no product in it, and the wrong one to leave on
 * `/account` for the next ten phases: it explained RLS to a customer, printed
 * `customer` in a `<code>` chip beside their name, and showed them a raw
 * UUID under the heading "מזהה משתמש".
 *
 * None of that was a leak — every value is the caller's own — and all of it
 * was a developer talking to themselves on a consumer screen. What is left is
 * what somebody actually wants from an account card: who they are, which
 * number signs them in, since when, and the way out.
 *
 * The role still appears, because a pro and a customer see different products
 * and a person who has both should be able to tell which one they are looking
 * at. It appears as the Hebrew label alone.
 */
export function CurrentUserCard({
  user,
  verificationStatus,
}: {
  user: CurrentUser;
  verificationStatus?: string | null;
}) {
  return (
    <div className={`w-full ${CARD_BASE} p-5`}>
      <h2 className={SECTION_TITLE}>פרטי החשבון</h2>

      <dl className="mt-4 space-y-3 text-sm">
        <Row label="תפקיד">
          <span className="rounded-full bg-ink px-2.5 py-0.5 text-xs font-semibold text-white">
            {USER_ROLE_LABEL[user.role]}
          </span>
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
          {/* A date, not a timestamp: the minute somebody signed up is not a
              fact they have any use for. */}
          {new Intl.DateTimeFormat("he-IL", { dateStyle: "long" }).format(
            new Date(user.createdAt),
          )}
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
