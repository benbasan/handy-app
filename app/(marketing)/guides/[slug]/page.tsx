import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/ui/AppShell";
import { BUTTON_CTA } from "@/components/ui/primitives";
import { GUIDES, findGuide } from "@/lib/content/guides";
import { MARKETING_ROUTES } from "@/lib/routes";
import { JsonLd, absoluteUrl, breadcrumbJsonLd, pageMetadata } from "@/lib/seo";
import { getCurrentUser } from "@/lib/supabase/session";

export const dynamic = "force-dynamic";

/** The guide list is content in the repo, so every URL is known at build time. */
export function generateStaticParams() {
  return GUIDES.map((guide) => ({ slug: guide.slug }));
}

export async function generateMetadata({
  params,
}: PageProps<"/guides/[slug]">) {
  const { slug } = await params;
  const guide = findGuide(slug);
  if (!guide) return {};

  return pageMetadata({
    title: guide.title,
    description: guide.summary,
    path: MARKETING_ROUTES.guide(guide.slug),
  });
}

/** design/screens/content-6.6-blog-maintenance-guides.png, one article deep. */
export default async function GuidePage({
  params,
}: PageProps<"/guides/[slug]">) {
  const { slug } = await params;
  const [user, guide] = await Promise.all([
    getCurrentUser(),
    Promise.resolve(findGuide(slug)),
  ]);

  if (!guide) notFound();

  return (
    <AppShell user={user}>
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "Handy", path: MARKETING_ROUTES.home },
          { name: "מדריכים", path: MARKETING_ROUTES.guides },
          { name: guide.title, path: MARKETING_ROUTES.guide(guide.slug) },
        ])}
      />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Article",
          headline: guide.title,
          description: guide.summary,
          datePublished: guide.publishedAt,
          inLanguage: "he-IL",
          mainEntityOfPage: absoluteUrl(MARKETING_ROUTES.guide(guide.slug)),
          author: { "@type": "Organization", name: "Handy" },
          publisher: { "@type": "Organization", name: "Handy" },
        }}
      />

      <nav aria-label="מיקום" className="text-sm text-muted">
        <Link href={MARKETING_ROUTES.home} className="hover:text-brand">
          Handy
        </Link>
        <span aria-hidden> › </span>
        <Link href={MARKETING_ROUTES.guides} className="hover:text-brand">
          מדריכים
        </Link>
      </nav>

      <article className="mt-4 rounded-2xl border border-line bg-surface p-6 sm:p-8">
        <p className="text-sm text-muted">
          {guide.topic} · <span className="ltr-nums">{guide.minutes}</span> דק׳
          קריאה ·{" "}
          <time className="ltr-nums" dateTime={guide.publishedAt}>
            {guide.publishedAt}
          </time>
        </p>

        <h1 className="mt-2 text-3xl font-bold text-ink sm:text-4xl">
          {guide.title}
        </h1>
        <p className="mt-3 text-lg text-muted">{guide.summary}</p>

        <div className="mt-6 space-y-5">
          {guide.body.map((block, index) => {
            if (block.kind === "h2") {
              return (
                <h2 key={index} className="text-xl font-bold text-ink">
                  {block.text}
                </h2>
              );
            }
            if (block.kind === "p") {
              return (
                <p key={index} className="leading-relaxed text-muted">
                  {block.text}
                </p>
              );
            }
            if (block.kind === "list") {
              return (
                <ul key={index} className="space-y-2">
                  {block.items.map((item) => (
                    <li
                      key={item}
                      className="flex gap-2 leading-relaxed text-muted"
                    >
                      <span aria-hidden className="text-brand">
                        •
                      </span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              );
            }
            return (
              <aside
                key={index}
                className="rounded-xl border border-alert bg-alert-soft p-4"
              >
                <h3 className="font-bold text-alert">{block.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-ink/80">
                  {block.text}
                </p>
              </aside>
            );
          })}
        </div>
      </article>

      <section className="mt-8 rounded-2xl bg-ink p-6 text-center text-white sm:p-8">
        <h2 className="text-2xl font-bold">לא הצלחתם לבד?</h2>
        <p className="mt-2 text-white/75">
          פרסום קריאה הוא בחינם, וההצעות הראשונות מגיעות תוך דקות.
        </p>
        <Link href="/new-request" className={`${BUTTON_CTA} mt-5`}>
          פרסם קריאה
        </Link>
      </section>
    </AppShell>
  );
}
