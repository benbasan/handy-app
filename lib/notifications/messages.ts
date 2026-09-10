import { CUSTOMER_ROUTES, PRO_ROUTES } from "@/lib/routes";
import type { UserRole } from "@/lib/validation/auth";
import { KIND_AUDIENCE, type NotificationKind } from "./kinds";

/**
 * What a notification says, and where it goes when you open it.
 *
 * The one home for this copy, and the reason it is not columns on the row:
 * a sentence frozen at write time cannot be corrected, and the two sides of
 * one event do not read the same words. `notifications` stores the kind and
 * the identifiers; this renders them.
 *
 * **No names, and no amounts, in `body`.** Not squeamishness — a push body
 * transits Google's or Apple's push service on its way to the handset, and
 * "דנה לוי בחרה בך על 480 ₪" would put a customer's name and a price through a
 * third party for every notification this product sends. The screen behind the
 * link has all of it, under RLS, where it belongs. This is the same line
 * `lib/observability.ts` draws for logs, drawn again for a different reason.
 */

export type NotificationView = {
  title: string;
  body: string;
  href: string;
  /** Which dot the row gets — the palette legend on design/screens/. */
  tone: "brand" | "pro" | "alert" | "cta";
};

type Input = {
  kind: NotificationKind;
  jobId: string | null;
  payload: Record<string, unknown>;
  /** The reader, which is how `message_received` picks a side. */
  role: UserRole;
};

const COPY: Record<
  NotificationKind,
  { title: string; body: string; tone: NotificationView["tone"] }
> = {
  // ---- the pro's side ----
  job_in_radius: {
    title: "קריאה חדשה באזור שלך",
    body: "היא בתוך הרדיוס והתחומים שהגדרתם.",
    tone: "pro",
  },
  bid_selected: {
    title: "הלקוח בחר בהצעה שלך",
    body: "יש שעתיים לאשר. אישור מחייב אתכם להגיע, וגובה דמי קבלת עבודה.",
    tone: "alert",
  },
  selection_expiring: {
    title: "נותרה פחות מחצי שעה לאשר",
    body: "בלי אישור הקריאה חוזרת ללקוח, והעבודה עוברת למישהו אחר.",
    tone: "alert",
  },
  selection_moved: {
    title: "הלקוח העביר את הבחירה לבעל מקצוע אחר",
    body: "ההצעה שלכם חזרה להמתנה כל עוד היא בתוקף.",
    tone: "pro",
  },
  selection_withdrawn: {
    title: "הלקוח ביטל את הבחירה",
    body: "ההצעה שלכם חזרה להמתנה כל עוד היא בתוקף.",
    tone: "pro",
  },
  selection_lapsed_pro: {
    title: "חלון האישור נסגר",
    body: "העבודה חזרה לבחירת הלקוח. לא חויבתם על כלום.",
    tone: "pro",
  },
  price_update_approved: {
    title: "הלקוח אישר את עדכון המחיר",
    body: "המחיר המעודכן חל על הקריאה מעכשיו.",
    tone: "cta",
  },
  price_update_rejected: {
    title: "הלקוח לא אישר את עדכון המחיר",
    body: "העבודה ממשיכה במחיר שסוכם מראש.",
    tone: "pro",
  },
  review_received: {
    title: "התקבלה ביקורת חדשה",
    body: "אפשר להשיב עליה מהפרופיל הציבורי שלכם.",
    tone: "pro",
  },
  pro_verified: {
    title: "הפרופיל אושר",
    body: "הפיד נפתח — קריאות באזור שלכם מתחילות להגיע.",
    tone: "cta",
  },
  pro_rejected: {
    title: "הפרופיל לא אושר",
    body: "אפשר לתקן את המסמכים ולשלוח שוב.",
    tone: "alert",
  },

  // ---- the customer's side ----
  first_bid_received: {
    title: "התקבלה ההצעה הראשונה",
    body: "אפשר להשוות, לשאול בצ׳אט, ולבחור.",
    tone: "brand",
  },
  bid_received: {
    title: "התקבלה הצעה נוספת",
    body: "אפשר להשוות מחיר, דירוג וזמן הגעה.",
    tone: "brand",
  },
  pro_accepted: {
    title: "בעל המקצוע אישר את העבודה",
    body: "המחיר נעול. כל שינוי בשטח יחייב תמונה ואישור שלכם.",
    tone: "cta",
  },
  pro_declined: {
    title: "בעל המקצוע ויתר על העבודה",
    body: "הקריאה חזרה אליכם, וההצעות האחרות עדיין פתוחות.",
    tone: "brand",
  },
  selection_lapsed_customer: {
    title: "בעל המקצוע לא אישר בזמן",
    body: "הקריאה חזרה אליכם. אפשר לבחור מישהו אחר.",
    tone: "brand",
  },
  pro_on_the_way: {
    title: "בעל המקצוע יצא לדרך",
    body: "אפשר לעקוב אחרי ההגעה במסך המעקב.",
    tone: "brand",
  },
  pro_arrived: {
    title: "בעל המקצוע התחיל בעבודה",
    body: "המחיר המאושר מוצג במסך המעקב.",
    tone: "brand",
  },
  price_update_requested: {
    title: "בקשה לעדכון מחיר ממתינה לכם",
    body: "יש תמונה מהשטח לצד הבקשה. בלי אישור, המחיר המקורי תקף.",
    tone: "alert",
  },
  job_completed: {
    title: "העבודה נסגרה",
    body: "אפשר לראות את סיכום החיוב, להוריד קבלה ולדרג.",
    tone: "cta",
  },

  // ---- both ----
  message_received: {
    title: "הודעה חדשה",
    body: "בשיחה על אחת הקריאות שלכם.",
    tone: "brand",
  },
};

/**
 * Where "פתח" leads.
 *
 * A job id is the same string on both sides and the screens are not, so the
 * audience decides the path. A kind with no job behind it — the verification
 * decision — lands on the dashboard, which is where its consequence is.
 */
function hrefFor({ kind, jobId, payload, role }: Input): string {
  const audience = KIND_AUDIENCE[kind];
  const side = audience === "both" ? role : audience;

  if (side === "pro") {
    if (kind === "pro_verified" || kind === "pro_rejected") {
      return PRO_ROUTES.dashboard;
    }
    if (!jobId) return PRO_ROUTES.dashboard;

    switch (kind) {
      case "job_in_radius":
        return PRO_ROUTES.quote(jobId);
      case "bid_selected":
      case "selection_expiring":
      case "selection_moved":
      case "selection_withdrawn":
      case "selection_lapsed_pro":
        return PRO_ROUTES.offers;
      case "review_received":
        return PRO_ROUTES.profile;
      case "message_received":
        return `${PRO_ROUTES.messages}?job=${jobId}`;
      default:
        return PRO_ROUTES.manageJob(jobId);
    }
  }

  if (!jobId) return CUSTOMER_ROUTES.account;

  switch (kind) {
    case "first_bid_received":
    case "bid_received":
    case "pro_declined":
    case "selection_lapsed_customer":
      return CUSTOMER_ROUTES.offers(jobId);
    case "job_completed":
      return CUSTOMER_ROUTES.summary(jobId);
    case "message_received": {
      const proId = payload.pro_id;
      return typeof proId === "string"
        ? `${CUSTOMER_ROUTES.chat(jobId)}?pro=${proId}`
        : CUSTOMER_ROUTES.chat(jobId);
    }
    default:
      return CUSTOMER_ROUTES.track(jobId);
  }
}

export function notificationView(input: Input): NotificationView {
  const copy = COPY[input.kind];
  return { ...copy, href: hrefFor(input) };
}
