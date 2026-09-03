import type { Metadata } from "next";

/**
 * The pieces of SEO that have to be identical on every public page, in one
 * place — Phase 8's whole point is pages a search engine reaches, and a
 * canonical URL that differs per page by accident is worse than none.
 *
 * `NEXT_PUBLIC_SITE_URL` is the deployed origin. It is public by definition
 * (it is printed into every canonical tag) and it falls back to localhost, so
 * a build with no environment at all still produces valid absolute URLs
 * rather than throwing — the same posture lib/supabase/env.ts takes.
 */
export const SITE_NAME = "Handy";

export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"
).replace(/\/$/, "");

export function absoluteUrl(path: string): string {
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

/**
 * Title, description, canonical and Open Graph for one public page.
 *
 * The title suffix is applied here rather than through a template in the root
 * layout: the signed-in screens set their own titles and have carried the
 * "— Handy" suffix by hand since Phase 2, and one page ending up as
 * "Handy — Handy" is exactly the kind of thing nobody notices for a year.
 */
export function pageMetadata({
  title,
  description,
  path,
  noIndex = false,
}: {
  /** Without the site name — it is appended here. */
  title: string;
  description: string;
  path: string;
  noIndex?: boolean;
}): Metadata {
  const fullTitle = `${title} | ${SITE_NAME}`;
  const url = absoluteUrl(path);

  return {
    title: fullTitle,
    description,
    alternates: { canonical: url },
    robots: noIndex ? { index: false, follow: true } : undefined,
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      locale: "he_IL",
      title: fullTitle,
      description,
      url,
    },
  };
}

/**
 * Structured data. Rendered as a plain script tag because that is what the
 * consumers of it read; `<` is escaped so a string that ever comes from the
 * database (a pro's bio, a review) cannot close the tag early.
 */
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data).replace(/</g, "\\u003c"),
      }}
    />
  );
}

/** The organisation behind every public page — reused by several of them. */
export function organizationJsonLd(): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE_NAME,
    url: SITE_URL,
    description:
      "פלטפורמה שמחברת בין לקוחות לבעלי מקצוע מאומתים באזור המגורים, עם הצעות מחיר מלאות מראש.",
    areaServed: { "@type": "Country", name: "IL" },
  };
}

/** Handy › תחומי שירות › אינסטלציה — the trail the design prints, as data. */
export function breadcrumbJsonLd(
  crumbs: ReadonlyArray<{ name: string; path: string }>,
): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((crumb, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: crumb.name,
      item: absoluteUrl(crumb.path),
    })),
  };
}

export function faqJsonLd(
  entries: ReadonlyArray<{ question: string; answer: string }>,
): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: entries.map((entry) => ({
      "@type": "Question",
      name: entry.question,
      acceptedAnswer: { "@type": "Answer", text: entry.answer },
    })),
  };
}
