import { CurrentUserCard } from "@/components/ui/CurrentUserCard";
import { getProVerificationStatus, requireRole } from "@/lib/supabase/session";

export const metadata = { title: "אזור בעלי מקצוע — Handy" };

export default async function ProHomePage() {
  const user = await requireRole("pro");
  const verificationStatus = await getProVerificationStatus(user.id);

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      <header>
        <h1 className="text-2xl font-bold">
          שלום{user.fullName ? `, ${user.fullName}` : ""}
        </h1>
        <p className="mt-1 text-muted">אזור בעלי המקצוע ב-Handy.</p>
      </header>

      <CurrentUserCard user={user} verificationStatus={verificationStatus} />

      {verificationStatus === "pending" && (
        <p className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          הפרופיל ממתין לאימות. עד שיאושר לא יוצגו קריאות פתוחות ולא ניתן להגיש
          הצעות — האכיפה היא ברמת מסד הנתונים, לא רק בממשק.
        </p>
      )}

      <p className="text-sm text-muted">
        Onboarding, פיד קריאות והגשת הצעות נבנים בשלבים הבאים — ראו{" "}
        <code className="rounded bg-canvas px-1">docs/roadmap.md</code>.
      </p>
    </main>
  );
}
