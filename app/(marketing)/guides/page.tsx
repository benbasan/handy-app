import Link from "next/link";
import { AppShell } from "@/components/ui/AppShell";
import { Badge } from "@/components/ui/primitives";
import { GUIDES, featuredGuide } from "@/lib/content/guides";
import { MARKETING_ROUTES } from "@/lib/routes";
import { JsonLd, absoluteUrl, pageMetadata } from "@/lib/seo";
import { getCurrentUser } from "@/lib/supabase/session";

export const dynamic = "force-dynamic";

export const metadata = pageMetadata({
  title: "מדריכי תחזוקה",
  description:
    "מה כדאי לנסות לפני שקוראים לבעל מקצוע, ואיך לזהות הצעת מחיר הגיונית — מדריכי תחזוקה קצרים מ-Handy.",
  path: MARKETING_ROUTES.guides,
});

/**
 * design/screens/content-6.6-blog-maintenance-guides.png — the lead article in
 * the large card, the rest as a list beside it.
 *
 * The mock's cards carry a cover image. There is no artwork in this repo and
 * an empty grey frame on every card is worse than none, so a card leads with
 * its topic and reading time instead — the two things that actually help
 * somebody choose one.
 */
export default async function GuidesPage() {
  const user = await getCurrentUser();
  const lead = featuredGuide();
  const rest = GUIDES.filter((guide) => guide.slug !== lead.slug);

  return (
    <AppShell user={user}>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "ItemList",
          itemListElement: GUIDES.map((guide, index) => ({
            "@type": "ListItem",
            position: index + 1,
            url: absoluteUrl(MARKETING_ROUTES.guide(guide.slug)),
            name: guide.title,
          })),
        }}
      />

      <section>
        <h1 className="text-3xl font-bold text-ink sm:text-5xl">
          מדריכי תחזוקה
        </h1>
        <p className="mt-3 max-w-2xl text-lg text-muted">
          מה כדאי לנסות לפני שקוראים לבעל מקצוע, ואיך לזהות הצעת מחיר הגיונית.
        </p>
      </section>

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_28rem] lg:items-start">
        <ul className="space-y-3 lg:order-2">
          {rest.map((guide) => (
            <li key={guide.slug}>
              <Link
                href={MARKETING_ROUTES.guide(guide.slug)}
                className="block rounded-2xl border border-line bg-surface p-5 transition-colors hover:border-brand"
              >
                <h2 className="font-bold text-ink">{guide.title}</h2>
                <p className="mt-1 text-sm text-muted">{guide.summary}</p>
                <p className="mt-2 text-xs text-muted">
                  {guide.topic} ·{" "}
                  <span className="ltr-nums">{guide.minutes}</span> דק׳
                </p>
              </Link>
            </li>
          ))}
        </ul>

        <article className="rounded-2xl border border-line bg-surface p-6 sm:p-8 lg:order-1">
          <Badge tone="open">כתבה מובילה</Badge>
          <h2 className="mt-3 text-2xl font-bold text-ink sm:text-3xl">
            <Link
              href={MARKETING_ROUTES.guide(lead.slug)}
              className="hover:text-brand"
            >
              {lead.title}
            </Link>
          </h2>
          <p className="mt-3 text-muted">{lead.summary}</p>
          <p className="mt-4 text-sm text-muted">
            <span className="ltr-nums">{lead.minutes}</span> דק׳ קריאה ·{" "}
            {lead.topic}
          </p>
        </article>
      </div>
    </AppShell>
  );
}
