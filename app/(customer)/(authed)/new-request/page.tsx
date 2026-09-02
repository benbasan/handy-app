import { PostJobForm } from "@/components/customer/PostJobForm";
import { getBrowserMapsKey } from "@/lib/maps/config";
import { listCategories } from "@/lib/supabase/jobs";
import { requireRole } from "@/lib/supabase/session";

export const metadata = { title: "פרסום קריאה חדשה — Handy" };

/**
 * design/screens/customer-2.1-post-job.png. The categories come from the
 * database rather than a hard-coded list, so adding a תחום is a seed/admin
 * change and not a code change.
 */
export default async function NewRequestPage() {
  const user = await requireRole("customer");
  const categories = await listCategories();

  return (
    <>
      <header className="mb-6 text-center sm:text-start">
        <h1 className="text-3xl font-bold text-ink sm:text-4xl">
          פרסום קריאה חדשה
        </h1>
        <p className="mt-2 text-muted">
          ככל שהתיאור מדויק יותר, ההצעות שתקבלו מדויקות יותר.
        </p>
      </header>

      <PostJobForm
        userId={user.id}
        categories={categories}
        mapsKey={getBrowserMapsKey()}
      />
    </>
  );
}
