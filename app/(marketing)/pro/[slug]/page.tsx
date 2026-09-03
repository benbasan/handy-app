import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/ui/AppShell";
import { Badge, BUTTON_CTA, BUTTON_QUIET } from "@/components/ui/primitives";
import { MARKETING_ROUTES } from "@/lib/routes";
import { JsonLd, absoluteUrl, breadcrumbJsonLd, pageMetadata } from "@/lib/seo";
import {
  getPublicProProfile,
  listPublicProReviews,
} from "@/lib/supabase/publicProfiles";
import { getCurrentUser } from "@/lib/supabase/session";
import {
  PAYMENT_METHOD_LABEL,
  WORK_DAY_LABEL,
  WORK_DAYS,
  trimSeconds,
  type PaymentMethod,
} from "@/lib/validation/pros";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/pro/[slug]">) {
  const { slug } = await params;
  const pro = await getPublicProProfile(slug);
  if (!pro) return {};

  const trades = pro.categoryNames.join(", ");
  const where = pro.serviceCity ? ` ב${pro.serviceCity}` : "";

  return pageMetadata({
    title: `${pro.fullName ?? "בעל מקצוע"} — ${trades || "בעל מקצוע מאומת"}${where}`,
    description:
      pro.bio ??
      `${pro.fullName ?? "בעל מקצוע"} — בעל מקצוע מאומת ב-Handy${where}. ${pro.reviewsCount} ביקורות, הצעת מחיר מלאה מראש שכוללת את הביקור.`,
    path: MARKETING_ROUTES.proProfile(slug),
  });
}

/**
 * design/screens/customer-5.2-pro-public-profile.png — the page a customer
 * reads before they choose.
 *
 * Everything here comes from `pro_public_profile()` and
 * `pro_public_reviews()`, two security definer functions that name the columns
 * they return. That is not a performance choice: `pro_profiles` carries a
 * payout account and a service point beside the bio, and RLS picks rows, not
 * columns. The page cannot leak what it was never handed.
 *
 * "מסמכים שאומתו" is three booleans. product-spec.md 4.2 and
 * architecture.md section 4 are both explicit that a customer sees the badge
 * and never the document — so this lists which *kinds* were approved.
 *
 * Two figures from the mock are missing on purpose: "97% אחריות על העבודה" and
 * a fixed response-time promise. Nothing in this product measures either, and
 * the one thing this page exists to earn is trust.
 */
export default async function PublicProProfilePage({
  params,
}: PageProps<"/pro/[slug]">) {
  const { slug } = await params;

  const [user, pro] = await Promise.all([
    getCurrentUser(),
    getPublicProProfile(slug),
  ]);

  if (!pro) notFound();

  const reviews = await listPublicProReviews(slug);
  const name = pro.fullName ?? "בעל מקצוע מאומת";
  const initial = name.trim().charAt(0);

  const documents = [
    { label: "תעודת זהות", ok: pro.hasIdCard },
    { label: "רישיון עוסק", ok: pro.hasLicense },
    { label: "ביטוח אחריות מקצועית", ok: pro.hasInsurance },
    { label: "אימות טלפון", ok: true },
  ];

  return (
    <AppShell user={user}>
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "Handy", path: MARKETING_ROUTES.home },
          { name: "בעלי מקצוע", path: MARKETING_ROUTES.services },
          { name, path: MARKETING_ROUTES.proProfile(slug) },
        ])}
      />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "LocalBusiness",
          name,
          url: absoluteUrl(MARKETING_ROUTES.proProfile(slug)),
          description: pro.bio ?? undefined,
          image: pro.avatarUrl ?? undefined,
          areaServed: pro.serviceCity
            ? { "@type": "City", name: pro.serviceCity }
            : undefined,
          aggregateRating:
            pro.ratingAvg !== null && pro.reviewsCount > 0
              ? {
                  "@type": "AggregateRating",
                  ratingValue: pro.ratingAvg,
                  reviewCount: pro.reviewsCount,
                  bestRating: 5,
                }
              : undefined,
        }}
      />

      <section className="rounded-2xl border border-line bg-surface p-6 sm:p-8">
        <div className="flex flex-wrap items-start gap-6">
          {pro.avatarUrl ? (
            /* The Storage origin changes per deployment, so next/image
               would need a remotePattern for a host known only at runtime. */
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={pro.avatarUrl}
              alt=""
              className="size-28 rounded-2xl object-cover"
            />
          ) : (
            <span
              aria-hidden
              className="flex size-28 items-center justify-center rounded-2xl bg-brand-soft text-4xl font-bold text-brand"
            >
              {initial}
            </span>
          )}

          <div className="min-w-64 flex-1">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-3xl font-bold text-ink sm:text-4xl">
                {name}
              </h1>
              <Badge tone="done">✓ מאומת Handy</Badge>
              {!pro.acceptingJobs && (
                <Badge tone="neutral">לא מקבל קריאות כרגע</Badge>
              )}
            </div>

            <p className="mt-2 text-muted">
              {[
                pro.categoryNames.join(", ") || null,
                pro.serviceCity,
                pro.yearsExperience !== null
                  ? `${pro.yearsExperience} שנות ניסיון`
                  : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>

            <dl className="mt-5 flex flex-wrap gap-8">
              <Figure
                value={
                  pro.ratingAvg === null ? "—" : `★ ${pro.ratingAvg.toFixed(2)}`
                }
                label={
                  pro.reviewsCount > 0
                    ? `דירוג מ-${pro.reviewsCount} ביקורות`
                    : "עדיין ללא ביקורות"
                }
              />
              <Figure
                value={String(pro.jobsCompletedCount)}
                label="עבודות שנסגרו"
              />
              {pro.avgResponseMinutes !== null && (
                <Figure
                  value={`${pro.avgResponseMinutes} דק׳`}
                  label="זמן תגובה ממוצע להצעה"
                />
              )}
              <Figure value={`${pro.radiusKm} ק״מ`} label="רדיוס פעילות" />
            </dl>
          </div>

          <div className="w-full space-y-3 sm:w-56">
            <Link href="/new-request" className={`${BUTTON_CTA} w-full`}>
              הזמן את {name.split(" ")[0]} לקריאה
            </Link>
            <Link href="/login" className={`${BUTTON_QUIET} w-full`}>
              שלח הודעה
            </Link>
            {pro.minPrice !== null && (
              <p className="text-center text-sm text-muted">
                מחיר ביקור מ-
                <span className="ltr-nums">{Math.round(pro.minPrice)}</span> ₪
              </p>
            )}
          </div>
        </div>
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-[20rem_minmax(0,1fr)] lg:items-start">
        <aside className="space-y-4 lg:order-1">
          <div className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
            <h2 className="text-lg font-bold text-ink">מסמכים שאומתו</h2>
            <ul className="mt-3 space-y-2 text-sm">
              {documents.map((document) => (
                <li
                  key={document.label}
                  className="flex items-center justify-between gap-3"
                >
                  <span className="text-ink">{document.label}</span>
                  <span
                    className={
                      document.ok ? "font-bold text-cta-strong" : "text-muted"
                    }
                  >
                    {document.ok ? "✓" : "—"}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-muted">
              המסמכים עצמם נשמרים באחסון פרטי ואינם מוצגים ללקוחות — רק מה
              שאומת.
            </p>
          </div>

          <div className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
            <h2 className="text-lg font-bold text-ink">זמינות השבוע</h2>
            <ul className="mt-3 flex flex-wrap gap-1.5">
              {WORK_DAYS.map((day) => {
                const working = pro.workDays.includes(day);
                return (
                  <li
                    key={day}
                    aria-label={`יום ${WORK_DAY_LABEL[day]}${working ? "" : " — לא עובד"}`}
                    className={`flex size-9 items-center justify-center rounded-xl text-sm font-bold ${
                      working
                        ? "bg-brand text-white"
                        : "border border-line text-muted"
                    }`}
                  >
                    {WORK_DAY_LABEL[day]}
                  </li>
                );
              })}
            </ul>
            <p className="mt-3 text-sm text-muted">
              <span className="ltr-nums">
                {trimSeconds(pro.workStartTime)}–{trimSeconds(pro.workEndTime)}
              </span>
            </p>
          </div>

          {pro.paymentMethods.length > 0 && (
            <div className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
              <h2 className="text-lg font-bold text-ink">אמצעי תשלום</h2>
              <ul className="mt-3 flex flex-wrap gap-2">
                {pro.paymentMethods.map((method) => (
                  <li key={method}>
                    <Badge tone="neutral">
                      {PAYMENT_METHOD_LABEL[method as PaymentMethod] ?? method}
                    </Badge>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-muted">
                התשלום עובר ישירות לבעל המקצוע. Handy אינה מעבדת אותו.
              </p>
            </div>
          )}
        </aside>

        <div className="space-y-6 lg:order-2">
          <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
            <h2 className="text-lg font-bold text-ink">על העבודה שלי</h2>
            <p className="mt-3 leading-relaxed whitespace-pre-line text-muted">
              {pro.bio ?? "בעל המקצוע עוד לא הוסיף תיאור."}
            </p>

            {pro.categoryNames.length > 0 && (
              <ul className="mt-4 flex flex-wrap gap-2">
                {pro.categorySlugs.map((categorySlug, index) => (
                  <li key={categorySlug}>
                    <Link
                      href={MARKETING_ROUTES.category(categorySlug)}
                      className="inline-flex rounded-full bg-canvas px-3 py-1.5 text-sm font-medium text-ink hover:text-brand"
                    >
                      {pro.categoryNames[index]}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {pro.galleryUrls.length > 0 && (
            <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
              <h2 className="text-lg font-bold text-ink">גלריית עבודות</h2>
              <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {pro.galleryUrls.map((url) => (
                  <li key={url}>
                    {/* eslint-disable-next-line @next/next/no-img-element -- see the note on the portrait above. */}
                    <img
                      src={url}
                      alt=""
                      className="aspect-square w-full rounded-xl object-cover"
                    />
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="rounded-2xl border border-line bg-surface">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4 sm:px-6">
              <h2 className="text-lg font-bold text-ink">ביקורות מאומתות</h2>
              {pro.reviewsCount > 0 && (
                <p className="text-sm text-muted">
                  <span className="ltr-nums">
                    ★ {pro.ratingAvg?.toFixed(2)}
                  </span>{" "}
                  · <span className="ltr-nums">{pro.reviewsCount}</span> עבודות
                </p>
              )}
            </div>

            {reviews.length === 0 ? (
              <p className="px-5 py-6 text-muted sm:px-6">
                עדיין אין ביקורות. כל ביקורת ב-Handy מגיעה מלקוח שהעבודה שלו
                נסגרה בפועל.
              </p>
            ) : (
              <ul>
                {reviews.map((review, index) => (
                  <li
                    key={`${review.createdAt}-${index}`}
                    className="border-b border-line/70 px-5 py-4 last:border-b-0 sm:px-6"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="font-bold text-ink">
                        {review.reviewerName}
                      </p>
                      <p className="text-sm text-muted">
                        {review.categoryName} ·{" "}
                        <time
                          className="ltr-nums"
                          dateTime={review.createdAt.slice(0, 10)}
                        >
                          {review.createdAt.slice(0, 10)}
                        </time>
                      </p>
                    </div>

                    <p
                      aria-label={`דירוג ${review.rating} מתוך 5`}
                      className="mt-1 text-alert"
                    >
                      {"★".repeat(review.rating)}
                    </p>

                    {review.comment && (
                      <p className="mt-1 leading-relaxed text-muted">
                        {review.comment}
                      </p>
                    )}

                    {review.proReply && (
                      <p className="mt-3 rounded-xl bg-canvas p-3 text-sm text-muted">
                        <span className="font-bold text-ink">
                          תגובת {name.split(" ")[0]}:
                        </span>{" "}
                        {review.proReply}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </AppShell>
  );
}

function Figure({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <dt className="sr-only">{label}</dt>
      <dd>
        <span className="ltr-nums block text-2xl font-bold text-ink">
          {value}
        </span>
        <span className="mt-0.5 block text-xs text-muted">{label}</span>
      </dd>
    </div>
  );
}
