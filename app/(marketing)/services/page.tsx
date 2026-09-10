import Link from "next/link";
import {
  CARD_BASE,
  HERO_TITLE,
  SECTION_TITLE,
} from "@/components/ui/primitives";
import { AppShell } from "@/components/ui/AppShell";
import { CategoryIcon } from "@/lib/categories";
import { categoryCopy } from "@/lib/content/categories";
import { CITIES, inCity } from "@/lib/content/cities";
import { MARKETING_ROUTES } from "@/lib/routes";
import { JsonLd, breadcrumbJsonLd, pageMetadata } from "@/lib/seo";
import { listCategories } from "@/lib/supabase/jobs";
import { getCurrentUser } from "@/lib/supabase/session";

export const dynamic = "force-dynamic";

export const metadata = pageMetadata({
  title: "תחומי שירות",
  description:
    "אינסטלציה, חשמל, מיזוג, נגרות, מנעולן ועוד — בעלי מקצוע מאומתים בכל תחום, עם הצעת מחיר מלאה מראש.",
  path: MARKETING_ROUTES.services,
});

/**
 * The index the footer's "תחומי שירות" points at, and the hub the
 * category+city pages hang off. Not a screen in design/screens — it is the
 * parent every one of those pages needs in order to have a breadcrumb that
 * leads somewhere, and a crawler needs in order to find them at all.
 */
export default async function ServicesPage() {
  const [user, categories] = await Promise.all([
    getCurrentUser(),
    listCategories(),
  ]);

  return (
    <AppShell user={user}>
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "Handy", path: MARKETING_ROUTES.home },
          { name: "תחומי שירות", path: MARKETING_ROUTES.services },
        ])}
      />

      <section>
        <h1 className={HERO_TITLE}>תחומי שירות</h1>
        <p className="mt-3 max-w-2xl text-lg text-muted">
          כל תחום, וכל עיר שבה יש לנו בעלי מקצוע מאומתים. פרסום קריאה הוא בחינם,
          וההצעה כוללת תמיד את הביקור.
        </p>
      </section>

      <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {categories.map((category) => {
          const copy = categoryCopy(category.slug);

          return (
            <li key={category.id} className={`${CARD_BASE} p-5`}>
              <h2 className={`flex items-center gap-2 ${SECTION_TITLE}`}>
                <CategoryIcon
                  slug={category.slug}
                  className="size-6 text-brand"
                />
                <Link
                  href={MARKETING_ROUTES.category(category.slug)}
                  className="hover:text-brand"
                >
                  {category.nameHe}
                </Link>
              </h2>

              <p className="mt-2 text-sm text-muted">{copy.summary}</p>

              <ul className="mt-3 flex flex-wrap gap-1.5">
                {CITIES.slice(0, 6).map((city) => (
                  <li key={city.slug}>
                    <Link
                      href={MARKETING_ROUTES.categoryInCity(
                        category.slug,
                        city.slug,
                      )}
                      className="inline-flex rounded-full bg-canvas px-3 py-1 text-xs font-medium text-muted hover:text-brand"
                    >
                      {copy.professional} {inCity(city)}
                    </Link>
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ul>
    </AppShell>
  );
}
