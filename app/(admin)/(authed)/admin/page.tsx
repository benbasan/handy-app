import Link from "next/link";
import { CurrentUserCard } from "@/components/ui/CurrentUserCard";
import { BUTTON_BRAND } from "@/components/ui/primitives";
import { ADMIN_ROUTES } from "@/lib/routes";
import { listProApplications } from "@/lib/supabase/pros";
import { requireRole } from "@/lib/supabase/session";

export const metadata = { title: "לוח ניהול — Handy" };

export default async function AdminHomePage() {
  const user = await requireRole("admin");
  const pending = await listProApplications(["pending"]);

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      <header>
        <h1 className="text-2xl font-bold">לוח ניהול</h1>
        <p className="mt-1 text-muted">
          גישה מוגבלת למשתמשים בתפקיד <code>admin</code>.
        </p>
      </header>

      <CurrentUserCard user={user} />

      {/* The approvals desk built in Phase 3, deliberately minimal: it exists
          so the pro flow can be walked end to end. The overview, jobs table,
          disputes and trust metrics are Phase 7. */}
      <section className="rounded-2xl border border-line bg-surface p-5">
        <h2 className="text-lg font-bold text-ink">אישור בעלי מקצוע</h2>
        <p className="mt-1 text-sm text-muted">
          {pending.length === 0
            ? "אין כרגע בקשות ממתינות."
            : `${pending.length} בקשות ממתינות לבדיקה. יעד מענה: 24 שעות.`}
        </p>
        <Link href={ADMIN_ROUTES.pros} className={`${BUTTON_BRAND} mt-4`}>
          לתור האישורים
        </Link>
      </section>

      <p className="text-sm text-muted">
        ניהול קריאות, מחלוקות ומדדי אמון נבנים ב-Phase 7 — ראו{" "}
        <code className="rounded bg-canvas px-1">docs/roadmap.md</code>.
      </p>
    </main>
  );
}
