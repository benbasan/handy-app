import { PostJobForm } from "@/components/customer/PostJobForm";
import { PAGE_LEAD, PAGE_TITLE } from "@/components/ui/primitives";
import { getBrowserMapsKey } from "@/lib/maps/config";
import { listCategories } from "@/lib/supabase/jobs";
import { mySavedPlaces } from "@/lib/supabase/places";
import { requireRole } from "@/lib/supabase/session";

export const metadata = { title: "פרסום קריאה חדשה — Handy" };

/**
 * design/screens/customer-2.1-post-job.png. The categories come from the
 * database rather than a hard-coded list, so adding a תחום is a seed/admin
 * change and not a code change.
 */
export default async function NewRequestPage({
  searchParams,
}: PageProps<"/new-request">) {
  const user = await requireRole("customer");
  const [categories, savedPlaces, params] = await Promise.all([
    listCategories(),
    mySavedPlaces(),
    searchParams,
  ]);

  // `?category=` carries the tile the visitor already tapped on the landing
  // page or a services page. Resolved here against the table rather than
  // trusted: an unknown slug selects nothing, which is the same state the form
  // opens in anyway.
  const requested = Array.isArray(params.category)
    ? params.category[0]
    : params.category;
  const initialCategoryId =
    categories.find((category) => category.slug === requested)?.id ?? null;

  return (
    <>
      <header className="mb-6 text-center sm:text-start">
        <h1 className={PAGE_TITLE}>פרסום קריאה חדשה</h1>
        <p className={PAGE_LEAD}>
          ככל שהתיאור מדויק יותר, ההצעות שתקבלו מדויקות יותר.
        </p>
      </header>

      <PostJobForm
        userId={user.id}
        categories={categories}
        mapsKey={getBrowserMapsKey()}
        savedPlaces={savedPlaces}
        initialCategoryId={initialCategoryId}
      />
    </>
  );
}
