import type { ReactNode } from "react";
import type { IconComponent } from "@/components/ui/icons";

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
 * The card without its padding: radius, hairline border, white ground, and
 * since Phase 13.5 the first step of the depth scale.
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
 *
 * The border survives the shadow rather than being replaced by it: `bg-surface`
 * is #ffffff and the canvas under it is #f7f9fc, and a shadow soft enough not
 * to look like a bubble cannot separate those two on its own.
 */
export const CARD_BASE =
  "rounded-2xl border border-line bg-surface shadow-card";

export const CARD_CLASS = `${CARD_BASE} p-5 sm:p-6`;

/**
 * The card that *is* the screen's decision, rather than one of several.
 *
 * One step up the depth scale, and deliberately expensive to spend: the pro's
 * acceptance card, the price-update approval, the recommended offer. A screen
 * with two of these has none.
 */
export const CARD_RAISED =
  "rounded-2xl border border-line bg-surface shadow-lift";

/**
 * The `<h1>` on a screen — one size, sixteen screens, previously sixteen
 * copies of the same four utilities.
 */
export const PAGE_TITLE = "text-3xl font-bold text-ink sm:text-4xl";

/**
 * The `<h1>` on a page that is selling something rather than doing something:
 * the landing pages, the marketing hero, the 404. Bigger than PAGE_TITLE on
 * purpose — and named, because seven copies of it had already drifted into
 * three different spellings.
 */
export const HERO_TITLE =
  "text-4xl leading-tight font-bold text-ink sm:text-5xl";

/**
 * The sentence under a page title. Nineteen inline copies before it had a name,
 * which is the largest single duplication the Phase 13.5 audit found.
 */
export const PAGE_LEAD = "mt-2 text-muted";

/** The `<h2>` heading a card or a section inside a screen. */
export const SECTION_TITLE = "text-lg font-bold text-ink";

/** The label above a form control. */
export const FIELD_LABEL = "mb-1 block text-sm font-medium text-ink";

/**
 * Every button and button-shaped link in the product.
 *
 * The focus ring arrived in Phase 13.5. Before it, `focus-visible` appeared
 * exactly once in the whole app and this constant carried no focus style at
 * all — so a keyboard user tabbing across the compare-bids screen, where the
 * next press assigns work and the one after it charges 35 ₪, was moving an
 * invisible cursor. The offset ring needs a colour to sit against, and every
 * screen in this app is on the canvas.
 *
 * The hue belongs to the variant, not to the base: a green ring around the
 * indigo pro button would read as a different control.
 */
export const BUTTON_BASE =
  "inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-base font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:cursor-not-allowed disabled:opacity-60";

/**
 * The smaller weight the three shells draw in their header rows, and the only
 * place a button is allowed to be smaller than BUTTON_BASE.
 *
 * `min-h-11` is 44px, which is the floor a finger can reliably hit. Written out
 * because `px-4 py-2 text-sm` on its own measured 34px, and it was the variant
 * used for "פרסם קריאה" and "פיד קריאות" — the primary action of each side of
 * the marketplace, on the device most of them are used from.
 */
export const BUTTON_COMPACT = "min-h-11 px-4 py-2 text-sm";

export const BUTTON_CTA = `${BUTTON_BASE} bg-cta text-white hover:bg-cta-strong focus-visible:ring-cta`;

export const BUTTON_BRAND = `${BUTTON_BASE} bg-brand text-white hover:bg-brand-strong focus-visible:ring-brand`;

/** The pro side's primary weight — indigo, as in every design/screens/pro-*.png. */
export const BUTTON_PRO = `${BUTTON_BASE} bg-pro text-white hover:bg-pro-strong focus-visible:ring-pro`;

export const BUTTON_QUIET = `${BUTTON_BASE} border border-line bg-surface text-ink hover:bg-canvas focus-visible:ring-ink`;

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
  id,
  step,
  title,
  hint,
  tone = "brand",
  children,
}: {
  /**
   * An anchor for a form that has to bring somebody back to a step they got
   * wrong. Optional: most sections are never the target of anything.
   */
  id?: string;
  step?: number;
  title: string;
  hint?: string;
  tone?: "brand" | "pro";
  children: ReactNode;
}) {
  return (
    <section id={id} className={CARD_CLASS}>
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
          <h2 className={SECTION_TITLE}>{title}</h2>
          {hint && <p className="mt-1 text-sm text-muted">{hint}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

/**
 * "there is nothing here, and that is not a failure".
 *
 * Eleven screens drew this by hand before Phase 13.5 — a `p-10 text-center`
 * card, a bold line, a muted line under it, sometimes a way out — and they had
 * drifted: some offered an action and some left the reader at a dead end, and
 * none of them had a picture, so a full feed and an empty one differed only in
 * the words. An empty state is the screen a new pro sees first and the screen a
 * customer sees while the product is doing exactly what it promised, so it is
 * worth being one shape.
 *
 * `title` is what is true, `body` is what to do about it. The icon is optional
 * and muted on purpose: it is orientation, not decoration, and it must not
 * out-weigh the action underneath it.
 */
export function EmptyState({
  icon: Icon,
  title,
  body,
  action,
}: {
  icon?: IconComponent;
  title: string;
  body?: ReactNode;
  /** A way out. A dead end is the one thing an empty state must not be. */
  action?: ReactNode;
}) {
  return (
    <div className={`${CARD_BASE} p-10 text-center`}>
      {Icon && <Icon className="mx-auto mb-4 size-10 text-muted" />}
      <p className={SECTION_TITLE}>{title}</p>
      {body && <p className={PAGE_LEAD}>{body}</p>}
      {action && (
        <div className="mt-5 flex flex-wrap justify-center gap-3">{action}</div>
      )}
    </div>
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
