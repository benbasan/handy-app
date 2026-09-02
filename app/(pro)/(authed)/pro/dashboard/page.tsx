import Link from "next/link";
import { redirect } from "next/navigation";
import { ProStatusCard } from "@/components/pro/ProStatusCard";
import { CurrentUserCard } from "@/components/ui/CurrentUserCard";
import { BUTTON_QUIET, Card } from "@/components/ui/primitives";
import { PRO_ROUTES } from "@/lib/routes";
import { listCategories } from "@/lib/supabase/jobs";
import { getMyProProfile, listFeedJobs } from "@/lib/supabase/pros";
import { requireRole } from "@/lib/supabase/session";
import {
  formatWorkDays,
  SERVICE_RADIUS_LABEL,
  trimSeconds,
} from "@/lib/validation/pros";

export const metadata = { title: "דשבורד בעל מקצוע — Handy" };

/**
 * design/screens/pro-2.1-dashboard.png, at the phase this project is actually
 * at.
 *
 * The design's card grid is mostly Phase 4 and Phase 6 material — today's
 * earnings, pending bids, the day's schedule — and CLAUDE.md's
 * one-phase-at-a-time rule says not to build those early. What is real now is
 * the part this phase delivers: where the pro stands with verification, how
 * many open jobs their radius and trades actually reach, and the settings
 * behind those two numbers. The rest of the grid arrives with the flows that
 * populate it.
 */
export default async function ProDashboardPage({
  searchParams,
}: PageProps<"/pro/dashboard">) {
  const user = await requireRole("pro");
  const profile = await getMyProProfile();

  // A pro with no extension row means the sign-up trigger did not complete.
  // Failing to the sign-up screen is the only honest reading.
  if (!profile) redirect(PRO_ROUTES.join);

  const [categories, feed, params] = await Promise.all([
    listCategories(),
    // Cheap for an unverified pro: the RLS policy returns nothing before the
    // query does any work.
    listFeedJobs(null),
    searchParams,
  ]);

  const justSubmitted = params.submitted === "1";
  const myTrades = categories
    .filter((category) => profile.categoryIds.includes(category.id))
    .map((category) => category.nameHe);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold text-ink">
          {greeting()}
          {user.fullName ? `, ${user.fullName}` : ""}
        </h1>
        <p className="mt-2 text-muted">
          {profile.verificationStatus === "verified"
            ? `${feed.length} קריאות פתוחות מחכות לך באזור · ${SERVICE_RADIUS_LABEL[profile.radiusKm] ?? `עד ${profile.radiusKm} ק״מ`}`
            : "עוד כמה צעדים והפיד נפתח."}
        </p>
      </header>

      {justSubmitted && (
        <p
          role="status"
          className="rounded-2xl border border-cta bg-cta/10 p-4 text-sm font-semibold text-cta-strong"
        >
          ✓ הפרופיל נשלח לאישור. נעדכן ב-SMS ברגע שצוות Handy יאשר אותו — יעד
          מענה 24 שעות.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat
          value={
            profile.verificationStatus === "verified"
              ? String(feed.length)
              : "—"
          }
          label="קריאות חדשות באזור"
          hint={
            profile.verificationStatus === "verified"
              ? `ברדיוס ${profile.radiusKm} ק״מ`
              : "נפתח עם אישור הפרופיל"
          }
        />
        <Stat
          value={String(profile.categoryIds.length)}
          label="תחומי התמחות"
          hint={myTrades.length > 0 ? myTrades.join(", ") : "עוד לא נבחרו"}
        />
        <Stat
          value={`${profile.radiusKm} ק״מ`}
          label="רדיוס פעילות"
          hint={profile.serviceAddressText ?? "עוד לא הוגדרה כתובת בסיס"}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <div className="space-y-6">
          <ProStatusCard profile={profile} />

          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-bold text-ink">זמינות ולוח זמנים</h2>
              <Link
                href={PRO_ROUTES.settings}
                className={`${BUTTON_QUIET} px-4 py-2 text-sm`}
              >
                עריכה
              </Link>
            </div>

            <dl className="mt-4 divide-y divide-line text-sm">
              <Row label="קבלת קריאות">
                {profile.acceptingJobs ? "פעילה" : "כבויה"}
              </Row>
              <Row label="ימי עבודה">{formatWorkDays(profile.workDays)}</Row>
              <Row label="שעות">
                <span dir="ltr" className="ltr-nums">
                  {trimSeconds(profile.workStartTime)}–
                  {trimSeconds(profile.workEndTime)}
                </span>
              </Row>
              <Row label="גבייה מהלקוח">
                {profile.paymentMethods.length > 0
                  ? `${profile.paymentMethods.length} אמצעים נבחרו`
                  : "עוד לא נבחרו"}
              </Row>
            </dl>
          </Card>
        </div>

        <aside>
          <CurrentUserCard
            user={user}
            verificationStatus={profile.verificationStatus}
          />
        </aside>
      </div>
    </div>
  );
}

/** The design opens with "בוקר טוב"; past midday that would just be wrong. */
function greeting(): string {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      hour: "numeric",
      hour12: false,
      timeZone: "Asia/Jerusalem",
    }).format(new Date()),
  );

  if (hour < 12) return "בוקר טוב";
  if (hour < 18) return "צהריים טובים";
  return "ערב טוב";
}

function Stat({
  value,
  label,
  hint,
}: {
  value: string;
  label: string;
  hint: string;
}) {
  return (
    <Card>
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-1 text-3xl font-bold text-ink">{value}</p>
      <p className="mt-1 text-xs text-muted">{hint}</p>
    </Card>
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
    <div className="flex items-baseline justify-between gap-3 py-3">
      <dt className="text-muted">{label}</dt>
      <dd className="text-end font-semibold text-ink">{children}</dd>
    </div>
  );
}
