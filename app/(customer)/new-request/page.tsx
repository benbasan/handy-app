import Link from "next/link";
import { PostJobForm } from "@/components/customer/PostJobForm";
import { AppShell } from "@/components/ui/AppShell";
import {
  BUTTON_QUIET,
  EmptyState,
  PAGE_LEAD,
  PAGE_TITLE,
} from "@/components/ui/primitives";
import { matchCategoryIntent } from "@/lib/content/intent";
import { getBrowserMapsKey } from "@/lib/maps/config";
import { ROLE_HOME } from "@/lib/routes";
import { listCategories } from "@/lib/supabase/jobs";
import { countMyUnreadNotifications } from "@/lib/supabase/notifications";
import { mySavedPlaces } from "@/lib/supabase/places";
import { getCurrentUser } from "@/lib/supabase/session";
import { DESCRIPTION_MAX } from "@/lib/validation/jobs";

export const metadata = { title: "פרסום קריאה חדשה — Handy" };

// Identity decides what renders — the form, or a note for a pro who landed
// here — so this is a per-request page.
export const dynamic = "force-dynamic";

/**
 * design/screens/customer-2.1-post-job.png. The categories come from the
 * database rather than a hard-coded list, so adding a תחום is a seed/admin
 * change and not a code change.
 *
 * **Outside `(authed)` since Phase 13.7.** Until then a visitor who pressed
 * "פרסם קריאה — חינם" met a phone-number screen before a single field, which
 * is the opposite of product-spec.md section 2 ("ההרשמה קורית תוך כדי פרסום
 * הקריאה הראשונה"). The form now opens for everyone and asks for the phone
 * when publish is pressed. What did not move is who may write: `createJob`
 * calls `requireRole("customer")`, and RLS on `jobs` and `job-media` is
 * untouched. A door opened, not a permission.
 */
export default async function NewRequestPage({
  searchParams,
}: PageProps<"/new-request">) {
  const [user, categories, params] = await Promise.all([
    getCurrentUser(),
    listCategories(),
    searchParams,
  ]);

  const isCustomer = user?.role === "customer";
  const [savedPlaces, unreadNotifications] = isCustomer
    ? await Promise.all([mySavedPlaces(), countMyUnreadNotifications()])
    : [[], 0];

  // `?category=` carries the tile the visitor already tapped on the landing
  // page or a services page. Resolved here against the table rather than
  // trusted: an unknown slug selects nothing, which is the same state the form
  // opens in anyway.
  const first = (value: string | string[] | undefined) =>
    Array.isArray(value) ? value[0] : value;

  // `?q=` is the sentence from the landing page's "מה קרה?" box. It becomes
  // the description, and — only when no tile was chosen and the sentence
  // clearly names one trade — the category too (lib/content/intent.ts).
  const typed = first(params.q)?.trim().slice(0, DESCRIPTION_MAX) || null;
  const requested =
    first(params.category) ?? (typed && matchCategoryIntent(typed));

  const initialCategoryId =
    categories.find((category) => category.slug === requested)?.id ?? null;

  return (
    <AppShell user={user} unreadNotifications={unreadNotifications}>
      {user && !isCustomer ? (
        // A pro or an admin on the customer's form. `createJob` would refuse
        // them anyway; saying so before they type is kinder than after.
        <EmptyState
          title="פרסום קריאה הוא מסך של לקוחות"
          body="אתם מחוברים כבעל מקצוע או כמנהל. כדי לפרסם קריאה, התנתקו והיכנסו עם מספר של לקוח."
          action={
            <Link href={ROLE_HOME[user.role]} className={BUTTON_QUIET}>
              חזרה למסך הבית
            </Link>
          }
        />
      ) : (
        <>
          <header className="mb-6 text-center sm:text-start">
            <h1 className={PAGE_TITLE}>פרסום קריאה חדשה</h1>
            <p className={PAGE_LEAD}>
              ככל שהתיאור מדויק יותר, ההצעות שתקבלו מדויקות יותר.
            </p>
          </header>

          <PostJobForm
            userId={user?.id ?? null}
            categories={categories}
            mapsKey={getBrowserMapsKey()}
            savedPlaces={savedPlaces}
            initialCategoryId={initialCategoryId}
            initialDescription={typed}
          />
        </>
      )}
    </AppShell>
  );
}
