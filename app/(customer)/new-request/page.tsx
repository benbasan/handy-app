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
import {
  getPricingGuide,
  getPublicProProfile,
} from "@/lib/supabase/publicProfiles";
import { listMySavedPros } from "@/lib/supabase/completion";
import { DESCRIPTION_MAX, MIN_PRICE_SAMPLE } from "@/lib/validation/jobs";

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
  const [user, categories, params, pricing] = await Promise.all([
    getCurrentUser(),
    listCategories(),
    searchParams,
    getPricingGuide(),
  ]);

  const isCustomer = user?.role === "customer";
  const [savedPlaces, unreadNotifications, savedPros] = isCustomer
    ? await Promise.all([
        mySavedPlaces(),
        countMyUnreadNotifications(),
        listMySavedPros(),
      ])
    : [[], 0, []];

  // "מה זה בדרך כלל עולה" (Phase 14): what closed jobs in each trade actually
  // cost, from pricing_guide(). A trade with fewer than MIN_PRICE_SAMPLE closed
  // jobs gets no range at all rather than a confident-looking one.
  const priceRanges = Object.fromEntries(
    pricing
      .filter(
        (row) =>
          row.jobsClosed >= MIN_PRICE_SAMPLE &&
          row.priceLow !== null &&
          row.priceHigh !== null,
      )
      .map((row) => [
        row.categorySlug,
        {
          low: row.priceLow!,
          high: row.priceHigh!,
          jobsClosed: row.jobsClosed,
        },
      ]),
  );

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

  // `?pro=<slug>` is a pro's personal link (Phase 13.8): the call goes to them
  // first and only. Looked up through the same public function a stranger's
  // profile page uses, so an unknown or unverified slug simply is not there
  // and the form is the ordinary one.
  const proSlug = first(params.pro)?.trim().toLowerCase() || null;
  const requestedPro = proSlug ? await getPublicProProfile(proSlug) : null;

  // A pro who works in exactly one trade has already answered step 1.
  const proTrade =
    requestedPro?.categorySlugs.length === 1
      ? requestedPro.categorySlugs[0]
      : null;

  const requested =
    first(params.category) ?? (typed && matchCategoryIntent(typed)) ?? proTrade;

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
            priceRanges={priceRanges}
            savedPros={savedPros
              .filter((pro) => pro.publicSlug !== null)
              .map((pro) => ({
                slug: pro.publicSlug!,
                fullName: pro.fullName,
              }))}
            requestedPro={
              requestedPro
                ? {
                    slug: requestedPro.slug,
                    fullName: requestedPro.fullName,
                    avatarUrl: requestedPro.avatarUrl,
                    ratingAvg: requestedPro.ratingAvg,
                    jobsCompletedCount: requestedPro.jobsCompletedCount,
                  }
                : null
            }
          />
        </>
      )}
    </AppShell>
  );
}
