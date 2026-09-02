import Link from "next/link";
import { OnboardingDocumentsStep } from "@/components/pro/OnboardingDocumentsStep";
import { OnboardingPayoutStep } from "@/components/pro/OnboardingPayoutStep";
import { OnboardingPracticeStep } from "@/components/pro/OnboardingPracticeStep";
import { OnboardingProfileStep } from "@/components/pro/OnboardingProfileStep";
import { BUTTON_PRO, Card } from "@/components/ui/primitives";
import { startOnboarding } from "@/lib/actions/pros";
import { getBrowserMapsKey } from "@/lib/maps/config";
import { PRO_ROUTES } from "@/lib/routes";
import { listCategories } from "@/lib/supabase/jobs";
import {
  getMyProProfile,
  latestDocByType,
  listMyVerificationDocs,
} from "@/lib/supabase/pros";
import { requireRole } from "@/lib/supabase/session";
import { formatIsraeliMobile } from "@/lib/validation/auth";
import { DEFAULT_SERVICE_RADIUS_KM } from "@/lib/validation/pros";

export const metadata = { title: "הקמת החשבון שלך — Handy" };

/**
 * design/screens/pro-1.4-onboarding.png — the guided five-step onboarding.
 *
 * The rail's five steps are the design's, and they cover product-spec.md 4.2:
 * the spec's own step 5 ("שליחה לאישור") is the submit button at the end of
 * step 5 here rather than a screen of its own, which is how the design draws
 * it — a rail that ends on "תשלומים ומוכנות".
 *
 * The current step lives in the URL rather than in component state, so
 * "אפשר לעצור ולהמשיך בכל רגע" survives a closed tab: `onboarding_step` on
 * the row records how far the pro got, and every step is reachable by link.
 */

const STEPS = [
  { number: 1, title: "ברוך הבא" },
  { number: 2, title: "פרופיל מקצועי" },
  { number: 3, title: "מסמכים ואימות" },
  { number: 4, title: "איך מגישים הצעה" },
  { number: 5, title: "תשלומים ומוכנות" },
] as const;

export default async function ProOnboardingPage({
  searchParams,
}: PageProps<"/pro/onboarding">) {
  const user = await requireRole("pro");

  const [profile, categories, docs, params] = await Promise.all([
    getMyProProfile(),
    listCategories(),
    listMyVerificationDocs(),
    searchParams,
  ]);

  const requested = Number(
    Array.isArray(params.step) ? params.step[0] : params.step,
  );
  const step =
    Number.isInteger(requested) && requested >= 1 && requested <= 5
      ? requested
      : Math.min((profile?.onboardingStep ?? 0) + 1, 5);

  const onFile = latestDocByType(docs);

  // The same three conditions `submit_pro_for_approval()` enforces, restated
  // for the screen so the pro is told what is missing rather than refused
  // without explanation. The database is still the authority.
  const missing = [
    profile && profile.categoryIds.length > 0
      ? null
      : "בחירת תחום התמחות אחד לפחות",
    profile?.hasServicePoint ? null : "כתובת בסיס לחישוב הרדיוס",
    onFile.has("id_card") ? null : "העלאת ת.ז או רישיון מקצוע",
  ].filter((item): item is string => item !== null);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-ink sm:text-4xl">
            הקמת החשבון שלך ב-Handy
          </h1>
          <p className="mt-2 text-muted">
            שלב {step} מתוך {STEPS.length} · אפשר לעצור ולהמשיך בכל רגע
          </p>
        </div>

        <Link
          href={PRO_ROUTES.dashboard}
          className="text-sm font-semibold text-pro hover:underline"
        >
          דלג בינתיים
        </Link>
      </header>

      <div
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={STEPS.length}
        aria-valuenow={step}
        aria-label="התקדמות בהרשמה"
        className="h-2 w-full overflow-hidden rounded-full bg-line"
      >
        <div
          className="h-full rounded-full bg-pro"
          style={{ width: `${(step / STEPS.length) * 100}%` }}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[20rem_minmax(0,1fr)] lg:items-start">
        <aside className="space-y-4 lg:sticky lg:top-6 lg:order-2 lg:self-start">
          <nav aria-label="שלבי ההרשמה" className="space-y-2">
            {STEPS.map((item) => {
              const done = (profile?.onboardingStep ?? 0) >= item.number;
              const current = item.number === step;

              return (
                <Link
                  key={item.number}
                  href={`${PRO_ROUTES.onboarding}?step=${item.number}`}
                  aria-current={current ? "step" : undefined}
                  className={`flex items-center gap-3 rounded-2xl border p-4 text-sm font-bold transition-colors ${
                    current
                      ? "border-pro bg-pro-soft text-ink"
                      : "border-line bg-surface text-muted hover:border-pro/40"
                  }`}
                >
                  <span
                    aria-hidden
                    className={`flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                      done || current
                        ? "bg-pro text-white"
                        : "bg-canvas text-muted"
                    }`}
                  >
                    {done && !current
                      ? "✓"
                      : String(item.number).padStart(2, "0")}
                  </span>
                  {item.title}
                </Link>
              );
            })}
          </nav>

          <div className="rounded-2xl bg-ink p-5 text-sm text-white/80">
            <h2 className="text-base font-bold text-white">צריך עזרה?</h2>
            <p className="mt-2">
              מנהל הקהילה זמין בשיחה א׳–ה׳,{" "}
              <span dir="ltr" className="ltr-nums">
                09:00–18:00
              </span>
              .
            </p>
            {/* The help centre itself is pro-5.5, which is Phase 8. A link to a
                404 is worse than no link, so the hours stand on their own. */}
          </div>
        </aside>

        <Card className="lg:order-1">
          <h2 className="text-xl font-bold text-ink">
            {step === 1
              ? `ברוך הבא${user.fullName ? `, ${user.fullName}` : ""}`
              : STEPS[step - 1]!.title}
          </h2>

          <div className="mt-4">
            {step === 1 && <WelcomeStep />}

            {step === 2 && (
              <OnboardingProfileStep
                categories={categories}
                mapsKey={getBrowserMapsKey()}
                phone={formatIsraeliMobile(user.phone)}
                defaults={{
                  fullName: user.fullName ?? "",
                  bio: profile?.bio ?? "",
                  categoryIds: profile?.categoryIds ?? [],
                  radiusKm: profile?.radiusKm ?? DEFAULT_SERVICE_RADIUS_KM,
                  addressText: profile?.serviceAddressText ?? "",
                }}
              />
            )}

            {step === 3 && (
              <OnboardingDocumentsStep
                userId={user.id}
                existing={new Set(onFile.keys())}
              />
            )}

            {step === 4 && <OnboardingPracticeStep />}

            {step === 5 && (
              <OnboardingPayoutStep
                defaults={{
                  paymentMethods: profile?.paymentMethods ?? [],
                  bankName: profile?.payoutBankName ?? "",
                  bankBranch: profile?.payoutBankBranch ?? "",
                  accountLast4: profile?.payoutAccountLast4 ?? "",
                }}
                canSubmit={missing.length === 0}
                missing={missing}
              />
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

function WelcomeStep() {
  return (
    <div className="space-y-4">
      <p className="text-muted">
        נעבור יחד על חמישה שלבים קצרים: פרופיל, מסמכים, איך מגישים הצעה שנבחרת,
        ואיך מקבלים את הכסף. בסוף התהליך הפרופיל נכנס לאישור.
      </p>

      <FactRow
        title="למה זה משתלם"
        body="בעלי מקצוע שמשלימים את כל השלבים מקבלים בממוצע פי 3 יותר הצעות שנבחרות."
      />
      <FactRow
        title="כמה זמן זה לוקח"
        body="כ-8 דקות. אפשר לעצור באמצע ולהמשיך מאותה נקודה."
      />
      <FactRow
        title="מה קורה בסוף"
        body="צוות Handy מאשר את הפרופיל תוך 24 שעות ואז מתחילות להיכנס קריאות."
      />

      <form action={startOnboarding}>
        <button type="submit" className={BUTTON_PRO}>
          בואו נתחיל
        </button>
      </form>
    </div>
  );
}

function FactRow({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-line p-4">
      <h3 className="font-bold text-ink">{title}</h3>
      <p className="mt-1 text-sm text-muted">{body}</p>
    </div>
  );
}
