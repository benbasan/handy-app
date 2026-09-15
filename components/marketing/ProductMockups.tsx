import { BrandMark } from "@/components/ui/BrandMark";
import { CARD_BASE } from "@/components/ui/primitives";
import { CameraIcon, CheckIcon, StarIcon } from "@/components/ui/icons";

/**
 * Pictures of the product, drawn in the product's own components' shapes
 * (Phase 19, and #8 "איך זה נראה" on the backlog).
 *
 * The landing page had no image at all. Photographs were ruled out by the
 * user in favour of the product itself, which is also the more honest picture:
 * what a visitor sees here is what they will be looking at in ten minutes.
 *
 * **Every figure on these is an example, and says so on its face.** CLAUDE.md
 * section 3 forbids an invented figure on a public page; a mock-up is allowed
 * a price and a rating only because the "דוגמה" tag sits on the same card, in
 * the first line a reader's eye lands on. The whole mock-up is `aria-hidden`
 * with an sr-only sentence beside it, so a screen reader hears "an example of
 * the offers screen" rather than three strangers' prices read out as fact.
 *
 * Kept as static markup rather than rendering `BidCard` itself: that component
 * is a client island bound to a live bid, a server action and a countdown, and
 * a picture of it must not be able to select anything.
 */

export function ExampleTag() {
  return (
    <span className="rounded-full bg-accent px-2.5 py-0.5 text-xs font-bold text-ink">
      דוגמה
    </span>
  );
}

type ExampleOffer = {
  initial: string;
  name: string;
  rating: string | null;
  reviews: number;
  price: number;
  window: string;
  ground: string;
  top?: boolean;
};

const OFFERS: readonly ExampleOffer[] = [
  {
    initial: "מ",
    name: "מיכאל ש.",
    rating: "4.9",
    reviews: 38,
    price: 280,
    window: "היום 14:00–16:00",
    ground: "bg-accent-soft",
    top: true,
  },
  {
    initial: "ר",
    name: "רונן א.",
    rating: "4.7",
    reviews: 21,
    price: 320,
    window: "מחר 08:00–10:00",
    ground: "bg-brand-soft",
  },
  {
    initial: "ס",
    name: "סאמר ח.",
    rating: null,
    reviews: 0,
    price: 300,
    window: "היום 17:00–19:00",
    ground: "bg-canvas",
  },
];

/** The compare-offers screen, in a phone. */
export function OffersPhoneMockup({ className = "" }: { className?: string }) {
  return (
    <div className={className}>
      <p className="sr-only">
        דוגמה למסך ההצעות: שלוש הצעות מחיר מבעלי מקצוע מאומתים לאותה קריאה, כל
        אחת עם מחיר, דירוג וחלון הגעה.
      </p>
      <div
        aria-hidden
        className="mx-auto w-full max-w-[18rem] rounded-[2.5rem] bg-ink p-2.5 shadow-overlay"
      >
        <div className="space-y-2 rounded-[2rem] bg-canvas px-3 pt-4 pb-4">
          <div className="flex items-center justify-between gap-2 px-1">
            <p className="font-display text-sm font-bold text-ink">
              3 הצעות לקריאה שלך
            </p>
            <ExampleTag />
          </div>
          <p className="px-1 text-xs text-muted">
            אינסטלציה · נזילה מתחת לכיור
          </p>

          {OFFERS.map((offer) => (
            <div
              key={offer.name}
              className={`space-y-2 p-2.5 ${
                // Not CARD_RAISED + border-brand: that constant carries
                // border-line, and two border colours at one specificity are
                // decided by stylesheet order, not by the class string.
                offer.top
                  ? "rounded-2xl border border-brand bg-surface shadow-lift"
                  : CARD_BASE
              }`}
            >
              <div className="flex items-center gap-2">
                <span
                  className={`flex size-9 shrink-0 items-center justify-center rounded-xl font-display text-sm font-bold text-ink ${offer.ground}`}
                >
                  {offer.initial}
                </span>
                <span className="min-w-0 flex-1 leading-tight">
                  <span className="block text-sm font-bold text-ink">
                    {offer.name}
                  </span>
                  <span className="flex items-center gap-1 text-xs text-muted">
                    {offer.rating ? (
                      <>
                        <StarIcon filled className="size-3 text-accent" />
                        <span className="ltr-nums">{offer.rating}</span>·
                        <span className="ltr-nums">{offer.reviews}</span>
                        ביקורות
                      </>
                    ) : (
                      "עדיין ללא ביקורות"
                    )}
                  </span>
                </span>
                <span className="ltr-nums font-display text-xl font-bold text-ink">
                  ₪{offer.price}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5 text-[11px] font-medium">
                <span className="rounded-full bg-brand-soft px-2 py-0.5 text-brand-strong">
                  מאומת
                </span>
                <span className="rounded-full bg-accent-soft px-2 py-0.5 text-ink">
                  <span className="ltr-nums">{offer.window}</span>
                </span>
              </div>
              {offer.top && (
                <span className="flex min-h-9 items-center justify-center rounded-xl bg-cta text-sm font-bold text-white">
                  בחר הצעה
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** A field price update as the customer meets it: photo, two prices, a choice. */
export function PriceUpdateMockup({ className = "" }: { className?: string }) {
  return (
    <div className={className}>
      <p className="sr-only">
        דוגמה לבקשת עדכון מחיר: תמונה של התקלה מהשטח, המחיר המקורי והמחיר החדש,
        ושני כפתורים — לאשר, או להמשיך במחיר המקורי.
      </p>
      <div
        aria-hidden
        className="space-y-3 rounded-2xl border-2 border-alert bg-surface p-4 shadow-lift sm:p-5"
      >
        <div className="flex items-center justify-between gap-2">
          <p className="font-display font-bold text-alert-strong">
            בקשת עדכון מחיר
          </p>
          <ExampleTag />
        </div>

        <div className="flex h-32 items-center justify-center gap-2 rounded-xl bg-[repeating-linear-gradient(45deg,#efe5d8_0_10px,#f6eee3_10px_20px)] text-sm text-muted">
          <CameraIcon className="size-5" />
          תמונה של התקלה מהשטח
        </div>

        <p className="text-sm text-ink">
          הסיפון מתחת לכיור סדוק וצריך להחליף אותו.
        </p>

        <div className="flex items-baseline gap-3">
          <span className="ltr-nums text-muted line-through">₪280</span>
          <span className="ltr-nums font-display text-2xl font-bold text-ink">
            ₪410
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <span className="flex min-h-11 items-center justify-center rounded-xl bg-cta px-2 text-center text-sm font-bold text-white">
            מאשר את המחיר המעודכן
          </span>
          <span className="flex min-h-11 items-center justify-center rounded-xl border border-line bg-surface px-2 text-center text-sm font-bold text-ink">
            לא מאשר
          </span>
        </div>
        <p className="text-xs text-muted">
          אם לא תאשרו — העבודה ממשיכה במחיר המקורי.
        </p>
      </div>
    </div>
  );
}

/** Three small pictures for "איך זה עובד", one per step. */
export function StepPicture({ step }: { step: 1 | 2 | 3 }) {
  if (step === 1) {
    return (
      <div aria-hidden className={`${CARD_BASE} space-y-2 p-3`}>
        <p className="text-xs font-bold text-muted">מה קרה?</p>
        <p className="rounded-xl bg-canvas px-3 py-2 text-sm text-ink">
          המזגן בסלון מטפטף מים על הרצפה
        </p>
        <div className="flex gap-1.5">
          <span className="rounded-full bg-brand-soft px-2 py-0.5 text-xs text-brand-strong">
            מיזוג אוויר
          </span>
          <span className="flex items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-xs text-ink">
            <CameraIcon className="size-3.5" />
            תמונה
          </span>
        </div>
      </div>
    );
  }

  if (step === 2) {
    return (
      <div aria-hidden className={`${CARD_BASE} space-y-1.5 p-3`}>
        {[
          ["₪280", "היום"],
          ["₪320", "מחר"],
        ].map(([price, when]) => (
          <div
            key={price}
            className="flex items-center justify-between rounded-xl bg-canvas px-3 py-2 text-sm"
          >
            <span className="text-muted">{when}</span>
            <span className="ltr-nums font-display font-bold text-ink">
              {price}
            </span>
          </div>
        ))}
        <p className="text-center text-xs text-muted">הצעות מחיר נכנסות</p>
      </div>
    );
  }

  return (
    <div aria-hidden className={`${CARD_BASE} flex items-center gap-3 p-3`}>
      <BrandMark className="size-10" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-ink">בעל המקצוע אישר</p>
        <p className="text-xs text-muted">בדרך אליכם</p>
      </div>
      <span className="flex size-8 items-center justify-center rounded-full bg-brand text-white">
        <CheckIcon className="size-4" />
      </span>
    </div>
  );
}

/** The pro's feed, in a phone: a new call nearby and what they can do with it. */
export function FeedPhoneMockup({ className = "" }: { className?: string }) {
  return (
    <div className={className}>
      <p className="sr-only">
        דוגמה לפיד של בעל מקצוע: קריאה חדשה באזור, עם תיאור, תמונה, מרחק ומועד,
        וכפתור להגשת הצעה.
      </p>
      <div
        aria-hidden
        className="mx-auto w-full max-w-[18rem] rounded-[2.5rem] bg-ink p-2.5 shadow-overlay"
      >
        <div className="space-y-2 rounded-[2rem] bg-canvas px-3 pt-4 pb-4">
          <div className="flex items-center justify-between gap-2 px-1">
            <p className="font-display text-sm font-bold text-ink">
              קריאות באזור שלך
            </p>
            <ExampleTag />
          </div>

          <div className="space-y-2 rounded-2xl border border-pro bg-surface p-3 shadow-lift">
            <div className="flex items-center justify-between gap-2">
              <span className="rounded-full bg-alert-soft px-2 py-0.5 text-[11px] font-bold text-alert-strong">
                חדשה
              </span>
              <span className="text-xs text-muted">
                <span className="ltr-nums">3.2</span> ק״מ · היום
              </span>
            </div>
            <p className="text-sm font-bold text-ink">אינסטלציה · רמת גן</p>
            <p className="text-xs text-muted">
              נזילה מתחת לכיור במטבח, יש מים על הרצפה.
            </p>
            <div className="flex h-16 items-center justify-center gap-1.5 rounded-xl bg-[repeating-linear-gradient(45deg,#efe5d8_0_8px,#f6eee3_8px_16px)] text-xs text-muted">
              <CameraIcon className="size-4" />
              תמונה מהלקוח
            </div>
            <div className="grid grid-cols-[1fr_auto] gap-1.5">
              <span className="flex min-h-9 items-center justify-center rounded-xl bg-pro text-sm font-bold text-white">
                הגשת הצעה
              </span>
              <span className="flex min-h-9 items-center justify-center rounded-xl border border-line px-3 text-xs font-semibold text-muted">
                לא מתאים לי
              </span>
            </div>
          </div>

          <div className={`${CARD_BASE} space-y-1 p-3`}>
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-bold text-ink">
                מיזוג אוויר · גבעתיים
              </p>
              <span className="text-xs text-muted">
                <span className="ltr-nums">5.8</span> ק״מ
              </span>
            </div>
            <p className="text-xs text-muted">המזגן בחדר השינה לא מקרר.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
