"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { loadProPeek, type ProPeek } from "@/lib/actions/proPeek";
import { CheckIcon, CloseIcon, StarIcon } from "@/components/ui/icons";
import { BUTTON_QUIET, SECTION_TITLE } from "@/components/ui/primitives";
import { MARKETING_ROUTES } from "@/lib/routes";

/**
 * "הצצה מהירה" (Phase 14). The customer is comparing three offers; opening a
 * pro's profile in place of that screen would cost them the comparison. So the
 * profile comes to them — bio, what was verified, three latest reviews and the
 * gallery — in a panel over the list, with the full page one link away in a new
 * tab.
 */
export function ProPeekButton({
  slug,
  proName,
}: {
  slug: string;
  proName: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [peek, setPeek] = useState<ProPeek | null | undefined>(undefined);
  const [pending, startTransition] = useTransition();

  function show() {
    setOpen(true);
    if (peek !== undefined) return;
    startTransition(async () => {
      setPeek(await loadProPeek(slug));
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={show}
        className="text-sm font-semibold text-brand underline-offset-2 hover:underline"
      >
        פרופיל וביקורות
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`הפרופיל של ${proName ?? "בעל המקצוע"}`}
          className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 sm:items-center sm:p-4"
          onClick={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <div className="relative max-h-[90dvh] w-full max-w-lg animate-enter overflow-y-auto rounded-t-2xl bg-surface p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] shadow-overlay sm:rounded-2xl">
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="סגירה"
              className="absolute end-3 top-3 inline-flex size-11 items-center justify-center rounded-full text-muted hover:bg-canvas"
            >
              <CloseIcon className="size-5" />
            </button>

            {pending || peek === undefined ? (
              <p className="py-10 text-center text-muted">טוען…</p>
            ) : peek === null ? (
              <p className="py-10 text-center text-muted">
                הפרופיל הציבורי של בעל המקצוע הזה לא זמין כרגע.
              </p>
            ) : (
              <PeekBody peek={peek} />
            )}
          </div>
        </div>
      )}
    </>
  );
}

function PeekBody({ peek }: { peek: ProPeek }) {
  const verified = [
    peek.hasIdCard && "תעודת זהות",
    peek.hasLicense && "רישיון מקצועי",
    peek.hasInsurance && "ביטוח",
  ].filter(Boolean) as string[];

  return (
    <div>
      <div className="flex items-center gap-4 pe-10">
        {peek.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- public-bucket portrait, as ProCard draws it
          <img
            src={peek.avatarUrl}
            alt=""
            className="size-16 shrink-0 rounded-xl object-cover"
          />
        ) : (
          <span
            aria-hidden
            className="flex size-16 shrink-0 items-center justify-center rounded-xl bg-canvas text-xl font-bold text-muted"
          >
            {(peek.fullName ?? "?").slice(0, 1)}
          </span>
        )}
        <div className="min-w-0">
          <h2 className={SECTION_TITLE}>{peek.fullName ?? "בעל מקצוע"}</h2>
          <p className="mt-1 text-sm text-muted">
            {peek.ratingAvg !== null && (
              <>
                <StarIcon
                  filled
                  className="me-0.5 inline size-3.5 align-[-2px]"
                />
                <span className="ltr-nums">{peek.ratingAvg.toFixed(1)}</span> (
                <span className="ltr-nums">{peek.reviewsCount}</span> ביקורות)
                ·{" "}
              </>
            )}
            <span className="ltr-nums">{peek.jobsCompletedCount}</span> עבודות
          </p>
          {peek.yearsExperience !== null && (
            <p className="text-sm text-muted">
              <span className="ltr-nums">{peek.yearsExperience}</span> שנות
              ניסיון
            </p>
          )}
        </div>
      </div>

      {verified.length > 0 && (
        <ul className="mt-4 flex flex-wrap gap-2">
          {verified.map((label) => (
            <li
              key={label}
              className="inline-flex items-center gap-1 rounded-full bg-cta/15 px-3 py-1 text-xs font-semibold text-cta-strong"
            >
              <CheckIcon className="size-3.5" />
              {label} נבדקו
            </li>
          ))}
        </ul>
      )}

      {peek.bio && (
        <p className="mt-4 text-sm whitespace-pre-line text-ink">{peek.bio}</p>
      )}

      {peek.galleryUrls.length > 0 && (
        <ul className="mt-4 grid grid-cols-3 gap-2">
          {peek.galleryUrls.map((url) => (
            <li key={url}>
              {/* eslint-disable-next-line @next/next/no-img-element -- public-bucket gallery */}
              <img
                src={url}
                alt=""
                className="aspect-square w-full rounded-lg object-cover"
              />
            </li>
          ))}
        </ul>
      )}

      <h3 className="mt-5 text-sm font-bold text-ink">ביקורות אחרונות</h3>
      {peek.reviews.length === 0 ? (
        <p className="mt-2 text-sm text-muted">עדיין אין ביקורות.</p>
      ) : (
        <ul className="mt-2 space-y-3">
          {peek.reviews.map((review) => (
            <li
              key={`${review.reviewerName}-${review.createdAt}`}
              className="rounded-xl bg-canvas p-3 text-sm"
            >
              <p className="font-semibold text-ink">
                {review.reviewerName} ·{" "}
                <span className="ltr-nums">{review.rating}</span>/5
              </p>
              {review.comment && (
                <p className="mt-1 text-ink">{review.comment}</p>
              )}
            </li>
          ))}
        </ul>
      )}

      <Link
        href={MARKETING_ROUTES.proProfile(peek.slug)}
        target="_blank"
        rel="noopener"
        className={`${BUTTON_QUIET} mt-5 w-full`}
      >
        לפרופיל המלא (בכרטיסייה חדשה)
      </Link>
    </div>
  );
}
