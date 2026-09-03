import type { MetadataRoute } from "next";
import { CITIES } from "@/lib/content/cities";
import { GUIDES } from "@/lib/content/guides";
import { LEGAL_DOCUMENTS, LEGAL_UPDATED_AT } from "@/lib/content/legal";
import { MARKETING_ROUTES, PRO_ROUTES } from "@/lib/routes";
import { absoluteUrl } from "@/lib/seo";
import { listCategories } from "@/lib/supabase/jobs";
import { listPublicProSlugs } from "@/lib/supabase/publicProfiles";

/**
 * Every public URL, generated from the same sources the pages are.
 *
 * The category+city grid is the point of the file: ten trades across eighteen
 * cities is where this phase's organic reach actually lives, and none of those
 * URLs is linked from more than one place, so a crawler needs to be told.
 *
 * Two of the sources are database reads (`categories`, `public_pro_slugs()`),
 * both world-readable, both of which come back empty in a build with no
 * Supabase configured — which is why the static half is built first and the
 * dynamic half is appended.
 */
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const staticPages: MetadataRoute.Sitemap = [
    { url: absoluteUrl(MARKETING_ROUTES.home), priority: 1, lastModified: now },
    { url: absoluteUrl(MARKETING_ROUTES.howItWorks), priority: 0.8 },
    { url: absoluteUrl(MARKETING_ROUTES.pricing), priority: 0.9 },
    { url: absoluteUrl(MARKETING_ROUTES.services), priority: 0.9 },
    { url: absoluteUrl(MARKETING_ROUTES.help), priority: 0.7 },
    { url: absoluteUrl(MARKETING_ROUTES.contact), priority: 0.6 },
    { url: absoluteUrl(MARKETING_ROUTES.guides), priority: 0.7 },
    { url: absoluteUrl(PRO_ROUTES.landing), priority: 0.8 },
    ...LEGAL_DOCUMENTS.map((document) => ({
      url: absoluteUrl(document.path),
      lastModified: new Date(LEGAL_UPDATED_AT),
      priority: 0.3,
    })),
    ...GUIDES.map((guide) => ({
      url: absoluteUrl(MARKETING_ROUTES.guide(guide.slug)),
      lastModified: new Date(guide.publishedAt),
      priority: 0.6,
    })),
  ];

  const [categories, proSlugs] = await Promise.all([
    listCategories(),
    listPublicProSlugs(),
  ]);

  const categoryPages: MetadataRoute.Sitemap = categories.flatMap(
    (category) => [
      {
        url: absoluteUrl(MARKETING_ROUTES.category(category.slug)),
        priority: 0.8,
        lastModified: now,
      },
      ...CITIES.map((city) => ({
        url: absoluteUrl(
          MARKETING_ROUTES.categoryInCity(category.slug, city.slug),
        ),
        priority: 0.7,
        lastModified: now,
      })),
    ],
  );

  const proPages: MetadataRoute.Sitemap = proSlugs.map((slug) => ({
    url: absoluteUrl(MARKETING_ROUTES.proProfile(slug)),
    priority: 0.5,
    lastModified: now,
  }));

  return [...staticPages, ...categoryPages, ...proPages];
}
