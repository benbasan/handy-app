import Link from "next/link";
import {
  Badge,
  BUTTON_PRO,
  BUTTON_QUIET,
  Card,
} from "@/components/ui/primitives";
import { PRO_ROUTES } from "@/lib/routes";
import type { ProProfile } from "@/lib/supabase/pros";

/**
 * Where the pro stands with the Handy team, and what to do about it.
 *
 * The five states come straight from `pro_profiles.verification_status`, and
 * the copy is deliberate about which of them is a gate: until `verified`, the
 * feed is empty because `pro_serves_job()` says so in the RLS policy — not
 * because this card hides a button.
 */
export const VERIFICATION_LABEL: Record<
  string,
  { text: string; tone: "neutral" | "waiting" | "done" | "pro" }
> = {
  draft: { text: "טיוטה", tone: "neutral" },
  pending: { text: "ממתין לאישור", tone: "waiting" },
  verified: { text: "מאומת", tone: "done" },
  rejected: { text: "נדחה", tone: "neutral" },
  suspended: { text: "מושהה", tone: "neutral" },
};

const TOTAL_STEPS = 5;

export function ProStatusCard({ profile }: { profile: ProProfile }) {
  const status = VERIFICATION_LABEL[profile.verificationStatus] ?? {
    text: profile.verificationStatus,
    tone: "neutral" as const,
  };

  const resumeStep = Math.min(profile.onboardingStep + 1, TOTAL_STEPS);

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-ink">סטטוס הפרופיל</h2>
        <Badge tone={status.tone}>{status.text}</Badge>
      </div>

      {profile.verificationStatus === "draft" && (
        <>
          <p className="mt-3 text-sm text-muted">
            השלמתם {profile.onboardingStep} מתוך {TOTAL_STEPS} שלבים. עד לסיום
            ולאישור צוות Handy הפיד ריק — זו אכיפה במסד הנתונים, לא הסתרה בממשק.
          </p>

          <Progress step={profile.onboardingStep} />

          <div className="mt-4 flex flex-wrap gap-3">
            <Link
              href={`${PRO_ROUTES.onboarding}?step=${resumeStep}`}
              className={BUTTON_PRO}
            >
              {profile.onboardingStep === 0
                ? "מתחילים את ההרשמה"
                : "המשך מהמקום שעצרתם"}
            </Link>
            <Link href={PRO_ROUTES.join} className={BUTTON_QUIET}>
              מילוי מהיר במסך אחד
            </Link>
          </div>
        </>
      )}

      {profile.verificationStatus === "pending" && (
        <p className="mt-3 text-sm text-muted">
          הפרופיל נשלח לאישור. צוות Handy בודק את המסמכים ידנית — יעד מענה 24
          שעות, ותקבלו SMS ברגע שהוא מאושר.
        </p>
      )}

      {profile.verificationStatus === "verified" && (
        <>
          <p className="mt-3 text-sm text-muted">
            הפרופיל מאומת. קריאות בתחומים שבחרתם וברדיוס {profile.radiusKm} ק״מ
            מגיעות לפיד שלכם
            {profile.acceptingJobs ? "" : " — כרגע כיביתם את קבלת הקריאות"}.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link href={PRO_ROUTES.jobs} className={BUTTON_PRO}>
              לפיד הקריאות
            </Link>
            <Link href={PRO_ROUTES.settings} className={BUTTON_QUIET}>
              זמינות והגדרות
            </Link>
          </div>
        </>
      )}

      {profile.verificationStatus === "rejected" && (
        <>
          <p className="mt-3 text-sm text-muted">
            הבקשה נדחתה. לרוב מדובר במסמך לא קריא או חסר — אפשר להעלות מסמכים
            מעודכנים ולשלוח שוב לאישור.
          </p>
          <Link
            href={`${PRO_ROUTES.onboarding}?step=3`}
            className={`${BUTTON_PRO} mt-4`}
          >
            העלאת מסמכים מחדש
          </Link>
        </>
      )}

      {profile.verificationStatus === "suspended" && (
        <p className="mt-3 text-sm text-muted">
          הפרופיל מושהה על ידי צוות Handy. פנו לתמיכה כדי לברר את הסיבה ואת מה
          שנדרש כדי לחזור לפעילות.
        </p>
      )}
    </Card>
  );
}

function Progress({ step }: { step: number }) {
  const pct = Math.round((step / TOTAL_STEPS) * 100);

  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={TOTAL_STEPS}
      aria-valuenow={step}
      aria-label="התקדמות בהרשמה"
      className="mt-4 h-2 w-full overflow-hidden rounded-full bg-canvas"
    >
      {/* The bar is inside an RTL document, so it fills from the trailing edge
          on its own — no direction override, and no physical utility. */}
      <div
        className="h-full rounded-full bg-pro"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
