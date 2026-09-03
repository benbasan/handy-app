import Link from "next/link";
import { ProCard } from "@/components/marketing/ProCard";
import { AppShell } from "@/components/ui/AppShell";
import { BUTTON_CTA, BUTTON_QUIET } from "@/components/ui/primitives";
import { categoryCopy } from "@/lib/content/categories";
import { CITIES, type City, inCity } from "@/lib/content/cities";
import { MARKETING_ROUTES } from "@/lib/routes";
import { JsonLd, breadcrumbJsonLd, faqJsonLd } from "@/lib/seo";
import type { Category } from "@/lib/supabase/jobs";
import type { CategoryPro, CategoryStats } from "@/lib/supabase/publicProfiles";
import type { CurrentUser } from "@/lib/supabase/session";

/**
 * design/screens/customer-5.3-category-page.png — "אינסטלטור בתל אביב".
 *
 * One component behind two URLs: `/services/<category>` (the whole country)
 * and `/services/<category>/<city>`. They are the same page asking the same
 * questions of a different point, and splitting them into two files would have
 * been two chances to word the same promise differently.
 *
 * Every number in the opening paragraph is counted from rows by
 * `category_stats()`. A figure that has nothing behind it is omitted rather
 * than filled in — this is a page that argues for trusting the marketplace,
 * and it cannot do that with an invented statistic in its first sentence.
 */
export function CategoryLanding({
  user,
  category,
  city,
  stats,
  pros,
}: {
  user: CurrentUser | null;
  category: Category;
  /** null on the country-wide page. */
  city: City | null;
  stats: CategoryStats;
  pros: readonly CategoryPro[];
}) {
  const copy = categoryCopy(category.slug);
  const where = city ? ` ${inCity(city)}` : " בישראל";
  const heading = `${copy.professional}${where}`;
  const path = city
    ? MARKETING_ROUTES.categoryInCity(category.slug, city.slug)
    : MARKETING_ROUTES.category(category.slug);

  const otherCities = CITIES.filter(
    (candidate) => candidate.slug !== city?.slug,
  ).slice(0, 12);

  return (
    <AppShell user={user}>
      <JsonLd
        data={breadcrumbJsonLd(
          [
            { name: "Handy", path: MARKETING_ROUTES.home },
            { name: "תחומי שירות", path: MARKETING_ROUTES.services },
            {
              name: category.nameHe,
              path: MARKETING_ROUTES.category(category.slug),
            },
            ...(city ? [{ name: city.nameHe, path }] : []),
          ].filter(Boolean),
        )}
      />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Service",
          serviceType: copy.professional,
          name: heading,
          description: copy.summary,
          areaServed: city
            ? { "@type": "City", name: city.nameHe }
            : { "@type": "Country", name: "IL" },
          provider: { "@type": "Organization", name: "Handy" },
        }}
      />
      {copy.faq.length > 0 && <JsonLd data={faqJsonLd(copy.faq)} />}

      <nav aria-label="מיקום" className="text-sm text-muted">
        <Link href={MARKETING_ROUTES.home} className="hover:text-brand">
          Handy
        </Link>
        <span aria-hidden> › </span>
        <Link href={MARKETING_ROUTES.services} className="hover:text-brand">
          תחומי שירות
        </Link>
        <span aria-hidden> › </span>
        {city ? (
          <>
            <Link
              href={MARKETING_ROUTES.category(category.slug)}
              className="hover:text-brand"
            >
              {category.nameHe}
            </Link>
            <span aria-hidden> › </span>
            <span className="text-ink">{city.nameHe}</span>
          </>
        ) : (
          <span className="text-ink">{category.nameHe}</span>
        )}
      </nav>

      <section className="mt-4">
        <h1 className="text-3xl font-bold text-ink sm:text-5xl">{heading}</h1>

        <p className="mt-4 max-w-2xl text-lg text-muted">
          {copy.summary}{" "}
          {stats.prosCount > 0 && (
            <>
              <span className="ltr-nums font-semibold text-ink">
                {stats.prosCount}
              </span>{" "}
              {copy.professionalPlural} מאומתים
              {city ? ` באזור ${city.nameHe}` : ""}.
            </>
          )}{" "}
          {stats.avgFirstBidMinutes !== null && (
            <>
              הצעה ראשונה תוך{" "}
              <span className="ltr-nums font-semibold text-ink">
                {stats.avgFirstBidMinutes}
              </span>{" "}
              דקות בממוצע.
            </>
          )}
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/new-request" className={BUTTON_CTA}>
            פרסם קריאה ל{copy.professional}
          </Link>
          <Link href={MARKETING_ROUTES.pricing} className={BUTTON_QUIET}>
            מדריך מחירים
          </Link>
        </div>

        {stats.jobsClosed > 0 &&
          stats.priceLow !== null &&
          stats.priceHigh !== null && (
            <p className="mt-4 text-sm text-muted">
              טווח המחירים ב-
              <span className="ltr-nums">{stats.jobsClosed}</span> עבודות שנסגרו
              ב-Handy בתחום הזה:{" "}
              <span className="ltr-nums font-semibold text-ink">
                {Math.round(stats.priceLow)}–{Math.round(stats.priceHigh)} ₪
              </span>
              .
            </p>
          )}
      </section>

      <section className="mt-12">
        <h2 className="text-2xl font-bold text-ink sm:text-3xl">
          {copy.professionalPlural} מומלצים{city ? ` ב${city.nameHe}` : ""}
        </h2>

        {pros.length === 0 ? (
          <p className="mt-4 rounded-2xl border border-line bg-surface p-6 text-muted">
            עדיין אין {copy.professionalPlural} מאומתים שמכסים את האזור הזה.
            אפשר לפרסם קריאה בכל מקרה — היא תישלח לכל מי שיצטרף לאזור, ואפשר
            להרחיב את רדיוס החיפוש.
          </p>
        ) : (
          <ul className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {pros.map((pro) => (
              <li key={pro.slug}>
                <ProCard pro={pro} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {copy.commonJobs.length > 0 && (
        <section className="mt-12">
          <h2 className="text-2xl font-bold text-ink">
            מה מזמינים הכי הרבה בתחום {category.nameHe}
          </h2>
          <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {copy.commonJobs.map((job) => (
              <li
                key={job}
                className="rounded-xl border border-line bg-surface px-4 py-3 text-sm text-ink"
              >
                {job}
              </li>
            ))}
          </ul>
        </section>
      )}

      {copy.faq.length > 0 && (
        <section className="mt-12">
          <h2 className="text-2xl font-bold text-ink">שאלות נפוצות</h2>
          <div className="mt-4 space-y-3">
            {copy.faq.map((entry) => (
              <details
                key={entry.question}
                className="group rounded-2xl border border-line bg-surface p-5"
              >
                <summary className="cursor-pointer list-none font-bold text-ink group-open:text-brand">
                  {entry.question}
                </summary>
                <p className="mt-2 text-sm leading-relaxed text-muted">
                  {entry.answer}
                </p>
              </details>
            ))}
          </div>
        </section>
      )}

      <section className="mt-12">
        <h2 className="text-xl font-bold text-ink">
          {copy.professionalPlural} בערים נוספות
        </h2>
        <ul className="mt-4 flex flex-wrap gap-2">
          {otherCities.map((candidate) => (
            <li key={candidate.slug}>
              <Link
                href={MARKETING_ROUTES.categoryInCity(
                  category.slug,
                  candidate.slug,
                )}
                className="inline-flex rounded-full border border-line bg-surface px-4 py-2 text-sm font-medium text-ink hover:border-brand hover:text-brand"
              >
                {copy.professional} {inCity(candidate)}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </AppShell>
  );
}
