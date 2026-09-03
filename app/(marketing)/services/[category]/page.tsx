import { notFound } from "next/navigation";
import { CategoryLanding } from "@/components/marketing/CategoryLanding";
import { categoryCopy } from "@/lib/content/categories";
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
}: PageProps<"/services/[category]">) {
  const { category: slug } = await params;
  const category = await findCategory(slug);
  if (!category) return {};

  const copy = categoryCopy(slug);

  return pageMetadata({
    title: `${copy.professional} בישראל — ${category.nameHe}`,
    description: `${copy.summary} ${copy.professionalPlural} מאומתים, הצעת מחיר מלאה מראש שכוללת את הביקור, ותשלום ישיר לבעל המקצוע.`,
    path: MARKETING_ROUTES.category(slug),
  });
}

/**
 * The country-wide version of design/screens/customer-5.3-category-page.png.
 * Same component as the city page, asked with no point — see
 * components/marketing/CategoryLanding.tsx.
 */
export default async function CategoryPage({
  params,
}: PageProps<"/services/[category]">) {
  const { category: slug } = await params;

  const [user, category] = await Promise.all([
    getCurrentUser(),
    findCategory(slug),
  ]);

  if (!category) notFound();

  const [stats, pros] = await Promise.all([
    getCategoryStats({ categorySlug: slug }),
    listCategoryPros({ categorySlug: slug }),
  ]);

  return (
    <CategoryLanding
      user={user}
      category={category}
      city={null}
      stats={stats}
      pros={pros}
    />
  );
}
