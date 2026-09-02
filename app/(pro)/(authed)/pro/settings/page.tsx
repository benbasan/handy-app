import Link from "next/link";
import { redirect } from "next/navigation";
import { AvailabilityForm } from "@/components/pro/AvailabilityForm";
import { BUTTON_QUIET, Card } from "@/components/ui/primitives";
import { PRO_ROUTES } from "@/lib/routes";
import { listCategories } from "@/lib/supabase/jobs";
import { getMyProProfile } from "@/lib/supabase/pros";
import { requireRole } from "@/lib/supabase/session";
import {
  PAYMENT_METHOD_LABEL,
  type PaymentMethod,
} from "@/lib/validation/pros";

export const metadata = { title: "זמינות, אזור ולוח זמנים — Handy" };

/** design/screens/pro-5.2-availability-settings.png. */
export default async function ProSettingsPage() {
  await requireRole("pro");

  const [profile, categories] = await Promise.all([
    getMyProProfile(),
    listCategories(),
  ]);

  if (!profile) redirect(PRO_ROUTES.join);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold text-ink sm:text-4xl">
          זמינות, אזור ולוח זמנים
        </h1>
        <p className="mt-2 text-muted">
          רק קריאות שמתאימות להגדרות האלה יגיעו אליך.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[20rem_minmax(0,1fr)] lg:items-start">
        <aside className="space-y-4 lg:order-2">
          <div className="rounded-2xl bg-ink p-5 text-sm text-white/80">
            <h2 className="text-base font-bold text-white">
              חשבון בנק לתשלומים
            </h2>
            {profile.payoutAccountLast4 ? (
              <p className="mt-2">
                {profile.payoutBankName}
                {profile.payoutBankBranch
                  ? ` · סניף ${profile.payoutBankBranch}`
                  : ""}{" "}
                · חשבון המסתיים ב-
                <span dir="ltr" className="ltr-nums">
                  {profile.payoutAccountLast4}
                </span>
                . העמלה נגבית כל שני וחמישי.
              </p>
            ) : (
              <p className="mt-2">
                עוד לא הוגדר חשבון לחיוב העמלה. הוא נקבע בשלב 5 של ההרשמה.
              </p>
            )}
            <Link
              href={`${PRO_ROUTES.onboarding}?step=5`}
              className="mt-4 inline-flex items-center justify-center rounded-xl border border-white/25 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-white/10"
            >
              עריכת פרטי הגבייה
            </Link>
          </div>

          <Card>
            <h2 className="font-bold text-ink">גבייה מהלקוח</h2>
            <p className="mt-2 text-sm text-muted">
              {profile.paymentMethods.length > 0
                ? profile.paymentMethods
                    .map(
                      (method) =>
                        PAYMENT_METHOD_LABEL[method as PaymentMethod] ?? method,
                    )
                    .join(" · ")
                : "עוד לא נבחרו אמצעי גבייה."}
            </p>
          </Card>

          <Card>
            <h2 className="font-bold text-ink">הפרופיל שלך</h2>
            <p className="mt-2 text-sm text-muted">
              שם, תיאור מקצועי וכתובת הבסיס נערכים במסך ההרשמה.
            </p>
            <Link
              href={PRO_ROUTES.join}
              className={`${BUTTON_QUIET} mt-3 w-full px-4 py-2 text-sm`}
            >
              עריכת הפרופיל
            </Link>
          </Card>
        </aside>

        <div className="lg:order-1">
          <AvailabilityForm profile={profile} categories={categories} />
        </div>
      </div>
    </div>
  );
}
