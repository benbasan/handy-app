import { SupportForm } from "@/components/marketing/SupportForm";
import { AppShell } from "@/components/ui/AppShell";
import { SUPPORT_CHANNELS } from "@/lib/content/help";
import { MARKETING_ROUTES } from "@/lib/routes";
import { pageMetadata } from "@/lib/seo";
import { getCurrentUser } from "@/lib/supabase/session";

export const dynamic = "force-dynamic";

export const metadata = pageMetadata({
  title: "צור קשר ותמיכה",
  description:
    "פנייה לצוות התמיכה של Handy — בעיה בקריאה פעילה, מחיר ותשלום, תלונה על בעל מקצוע. וואטסאפ, אימייל וטופס פנייה.",
  path: MARKETING_ROUTES.contact,
});

/** design/screens/content-6.4-support-contact.png. */
export default async function ContactPage() {
  const user = await getCurrentUser();

  return (
    <AppShell user={user}>
      <section className="text-center">
        <h1 className="text-3xl font-bold text-ink sm:text-5xl">
          פנייה לתמיכה
        </h1>
        <p className="mt-3 text-muted">זמן מענה ממוצע: כשעה בשעות הפעילות.</p>
      </section>

      <div className="mt-8 grid gap-6 lg:grid-cols-[20rem_minmax(0,1fr)] lg:items-start">
        <aside className="space-y-4 lg:order-1">
          <div className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
            <h2 className="text-lg font-bold text-ink">דרכי יצירת קשר</h2>
            <dl className="mt-3 space-y-3 text-sm">
              <div className="flex items-center justify-between gap-3 border-b border-line pb-3">
                <dt className="text-muted">וואטסאפ</dt>
                <dd className="ltr-nums font-bold text-ink">
                  {SUPPORT_CHANNELS.whatsapp}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3 border-b border-line pb-3">
                <dt className="text-muted">אימייל</dt>
                <dd>
                  <a
                    href={`mailto:${SUPPORT_CHANNELS.email}`}
                    dir="ltr"
                    className="font-bold text-brand hover:underline"
                  >
                    {SUPPORT_CHANNELS.email}
                  </a>
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted">שעות</dt>
                <dd className="ltr-nums font-bold text-ink">
                  {SUPPORT_CHANNELS.hours}
                </dd>
              </div>
            </dl>
          </div>

          <div className="rounded-2xl border border-alert bg-alert-soft p-5 sm:p-6">
            <h2 className="text-lg font-bold text-alert">מקרה דחוף בשטח?</h2>
            <p className="mt-2 text-sm text-ink/80">
              נזק, הצפה או חשד להתנהלות לא תקינה — התקשרו, ואנחנו מטפלים תוך 15
              דקות.
            </p>
          </div>
        </aside>

        <div className="lg:order-2">
          <SupportForm
            defaultName={user?.fullName ?? undefined}
            defaultPhone={user?.phone}
          />
        </div>
      </div>
    </AppShell>
  );
}
