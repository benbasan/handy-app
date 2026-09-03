import { notFound } from "next/navigation";
import { CategoryLanding } from "@/components/marketing/CategoryLanding";
import { categoryCopy } from "@/lib/content/categories";
import { findCity, inCity } from "@/lib/content/cities";
import { MARKETING_ROUTES } from "@/lib/routes";
import { pageMetadata } from "@/lib/seo";
import { listCategories } from "@/lib/supabase/jobs";
import {
  getCategoryStats,
  listCategoryPros,
} from "@/lib/supabase/publicProfiles";
import { getCurrentUser } from "@/lib/supabase/session";

export const dynamic = "force-dynamic";

async function findCategory(slug: string) {
  const categories = await listCategories();
  return categories.find((category) => category.slug === slug) ?? null;
}

export async function generateMetadata({
  params,
}: PageProps<"/services/[category]/[city]">) {
  const { category: categorySlug, city: citySlug } = await params;
  const [category, city] = [
    await findCategory(categorySlug),
    findCity(citySlug),
  ];
  if (!category || !city) return {};

  const copy = categoryCopy(categorySlug);

  return pageMetadata({
    title: `${copy.professional} ${inCity(city)}`,
    description: `${copy.summary} ${copy.professionalPlural} מאומתים ${inCity(city)} — הצעות מחיר תוך דקות, כולל הביקור, ותשלום ישיר לבעל המקצוע.`,
    path: MARKETING_ROUTES.categoryInCity(categorySlug, citySlug),
  });
}

/** design/screens/customer-5.3-category-page.png — "אינסטלטור בתל אביב". */
export default async function CategoryCityPage({
  params,
}: PageProps<"/services/[category]/[city]">) {
  const { category: categorySlug, city: citySlug } = await params;
  const city = findCity(citySlug);

  const [user, category] = await Promise.all([
    getCurrentUser(),
    findCategory(categorySlug),
  ]);

  if (!category || !city) notFound();

  const [stats, pros] = await Promise.all([
    getCategoryStats({ categorySlug, lat: city.lat, lng: city.lng }),
    listCategoryPros({ categorySlug, lat: city.lat, lng: city.lng }),
  ]);

  return (
    <CategoryLanding
      user={user}
      category={category}
      city={city}
      stats={stats}
      pros={pros}
    />
  );
}
