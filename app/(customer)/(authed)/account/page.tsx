import { CurrentUserCard } from "@/components/ui/CurrentUserCard";
import { requireRole } from "@/lib/supabase/session";

export const metadata = { title: "האזור האישי — Handy" };

export default async function CustomerAccountPage() {
  const user = await requireRole("customer");

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      <header>
        <h1 className="text-2xl font-bold">
          שלום{user.fullName ? `, ${user.fullName}` : ""}
        </h1>
        <p className="mt-1 text-neutral-600">האזור האישי שלכם ב-Handy.</p>
      </header>

      <CurrentUserCard user={user} />

      <p className="text-sm text-neutral-500">
        פרסום קריאה, מעקב והצעות מחיר נבנים בשלבים הבאים — ראו{" "}
        <code className="rounded bg-neutral-100 px-1">docs/roadmap.md</code>.
      </p>
    </main>
  );
}
