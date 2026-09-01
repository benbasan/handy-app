import { CurrentUserCard } from "@/components/ui/CurrentUserCard";
import { requireRole } from "@/lib/supabase/session";

export const metadata = { title: "לוח ניהול — Handy" };

export default async function AdminHomePage() {
  const user = await requireRole("admin");

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      <header>
        <h1 className="text-2xl font-bold">לוח ניהול</h1>
        <p className="mt-1 text-neutral-600">
          גישה מוגבלת למשתמשים בתפקיד <code>admin</code>.
        </p>
      </header>

      <CurrentUserCard user={user} />

      <p className="text-sm text-neutral-500">
        אישור בעלי מקצוע, ניהול קריאות ומחלוקות נבנים ב-Phase 7 — ראו{" "}
        <code className="rounded bg-neutral-100 px-1">docs/roadmap.md</code>.
      </p>
    </main>
  );
}
