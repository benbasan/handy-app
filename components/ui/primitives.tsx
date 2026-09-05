import type { ReactNode } from "react";

/**
 * The handful of shapes every customer screen in design/screens/ is built
 * from: a white card on the canvas, a section heading inside it, and three
 * button weights. Kept as class strings rather than wrapper components where
 * the element itself varies (`button`, `a`, `Link`, `label`).
 *
 * RTL note: every spacing utility used here and in callers is logical
 * (`ms/me/ps/pe/start/end`). A physical `ml-` reads fine in a Latin preview and
 * silently mirrors wrong in Hebrew — see CLAUDE.md section 3.
 */
/**
 * The card without its padding: radius, hairline border, white ground.
 *
 * Split out from CARD_CLASS because the app draws the same card at four
 * different insets — `p-5 sm:p-6` for most of it, `p-6 sm:p-8` on the wide
 * marketing panels, plain `p-5` in a dense list, `p-4` for a footnote — and
 * before this the three tokens that make a card *look* like a card were
 * written out beside each of them, fifty-five times across thirty-five files.
 * The comment at the top of this module promised "a later re-skin is one edit
 * here"; for buttons and inputs that was true, and for the card it was not.
 *
 * The padding stays with the caller. Which inset a given card takes is a
 * judgement against design/screens/, not a thing to unify from the outside.
 */
export const CARD_BASE = "rounded-2xl border border-line bg-surface";

export const CARD_CLASS = `${CARD_BASE} p-5 sm:p-6`;

/**
 * The `<h1>` on a screen — one size, sixteen screens, previously sixteen
 * copies of the same four utilities.
 */
export const PAGE_TITLE = "text-3xl font-bold text-ink sm:text-4xl";

/** The label above a form control. */
export const FIELD_LABEL = "mb-1 block text-sm font-medium text-ink";

export const BUTTON_BASE =
  "inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-base font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60";

export const BUTTON_CTA = `${BUTTON_BASE} bg-cta text-white hover:bg-cta-strong`;

export const BUTTON_BRAND = `${BUTTON_BASE} bg-brand text-white hover:bg-brand-strong`;

/** The pro side's primary weight — indigo, as in every design/screens/pro-*.png. */
export const BUTTON_PRO = `${BUTTON_BASE} bg-pro text-white hover:bg-pro-strong`;

export const BUTTON_QUIET = `${BUTTON_BASE} border border-line bg-surface text-ink hover:bg-canvas`;

export const INPUT_CLASS =
  "block w-full rounded-xl border border-line bg-canvas px-4 py-3 text-base text-ink outline-none placeholder:text-muted focus:border-brand focus:bg-surface focus:ring-2 focus:ring-brand/20";

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`${CARD_CLASS} ${className}`}>{children}</div>;
}

/**
 * A numbered card, which is how the posting form carries the spec's step
 * sequence on a single page — see components/customer/PostJobForm.tsx. The
 * pro's join screen reuses it with `tone="pro"` for the same job in indigo.
 */
export function SectionCard({
  step,
  title,
  hint,
  tone = "brand",
  children,
}: {
  step?: number;
  title: string;
  hint?: string;
  tone?: "brand" | "pro";
  children: ReactNode;
}) {
  return (
    <section className={CARD_CLASS}>
      <div className="mb-4 flex items-start gap-3">
        {step !== undefined && (
          <span
            aria-hidden
            className={`mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
              tone === "pro"
                ? "bg-pro-soft text-pro"
                : "bg-brand-soft text-brand"
            }`}
          >
            {step}
          </span>
        )}
        <div>
          <h2 className="text-lg font-bold text-ink">{title}</h2>
          {hint && <p className="mt-1 text-sm text-muted">{hint}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

const BADGE_TONES = {
  open: "bg-brand-soft text-brand",
  done: "bg-cta/15 text-cta-strong",
  waiting: "bg-alert/15 text-alert-strong",
  neutral: "bg-canvas text-muted",
  pro: "bg-pro-soft text-pro",
} as const;

export function Badge({
  tone = "neutral",
  children,
}: {
  tone?: keyof typeof BADGE_TONES;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${BADGE_TONES[tone]}`}
    >
      {children}
    </span>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="text-sm font-medium text-red-700">
      {children}
    </p>
  );
}
