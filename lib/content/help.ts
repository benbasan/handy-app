/**
 * מרכז העזרה — design/screens/content-6.3-faq.png (customers) and
 * design/screens/pro-5.5-help-center.png (pros).
 *
 * Content in code, like lib/content/categories.ts and for the same reason: an
 * answer here restates a business rule that lives in a migration, and the two
 * have to be reviewed together. A CMS would have let the answer drift away
 * from the rule with nobody noticing.
 *
 * Every answer below is true of the built product. Where one describes a rule
 * the database enforces, the enforcing function is named in a comment so the
 * next person can check rather than trust.
 */

export type FaqEntry = { question: string; answer: string };

export type FaqTopic = {
  /** URL fragment and filter key. */
  id: string;
  label: string;
  entries: readonly FaqEntry[];
};

/** The four chips on the customer help screen, in the design's order. */
export const CUSTOMER_FAQ: readonly FaqTopic[] = [
  {
    id: "jobs",
    label: "קריאות ותשלום",
    entries: [
      {
        question: "כמה עולה לפרסם קריאה?",
        answer:
          "פרסום קריאה וקבלת הצעות הם ללא עלות. משלמים רק לבעל המקצוע, בסיום העבודה. Handy גובה עמלה מבעל המקצוע בלבד — לא מכם.",
      },
      {
        // Enforced by request_price_update() + decide_price_update(); the live
        // price is job_effective_price(), which never counts a pending row.
        question: "מה קורה אם המחיר משתנה בשטח?",
        answer:
          "בעל המקצוע חייב לצרף תמונה של התקלה ולבקש אישור שלכם באתר. בלי אישור העבודה ממשיכה במחיר המקורי — זה לא נוהג, זו התנהגות המערכת: מחיר שלא אושר לא נכנס לחישוב בשום שלב.",
      },
      {
        question: "איך משלמים?",
        answer:
          "ישירות לבעל המקצוע — מזומן, ביט, פייבוקס או העברה בנקאית. Handy לא מעבדת את התשלום; היא רושמת אותו כדי להנפיק קבלה ולחשב את העמלה שלה.",
      },
      {
        question: "מה אם לא הגיע אף אחד?",
        answer:
          "אם לא התקבלו הצעות בתוך שעה, אפשר להרחיב את רדיוס החיפוש בקריאה או לפנות לתמיכה ונחפש בעל מקצוע ידנית.",
      },
      {
        question: "אפשר לבטל קריאה?",
        answer:
          "ביטול לפני בחירת הצעה הוא ללא עלות ובלחיצה אחת. אחרי שבעל מקצוע כבר יצא אליכם — פנו לתמיכה, כדי שנוכל לתאם את זה מול שני הצדדים.",
      },
      {
        question: "איפה הקבלה שלי?",
        answer:
          "בסיום העבודה, במסך הסיכום של הקריאה, יש כפתור הורדת קבלה כ-PDF. הקבלה מפרטת את מחיר הבסיס, כל עדכון מחיר שאושר, והסכום ששולם בפועל.",
      },
    ],
  },
  {
    id: "pros",
    label: "בעלי מקצוע",
    entries: [
      {
        // is_verified_pro() gates the INSERT policy on bids.
        question: "איך אתם מאמתים בעלי מקצוע?",
        answer:
          "כל בעל מקצוע מוסר תעודת זהות, ורישיון מקצועי היכן שהחוק דורש אותו. צוות Handy בודק את המסמכים ידנית תוך 24 שעות. עד שהפרופיל מאושר — בעל המקצוע לא יכול להגיש שום הצעה.",
      },
      {
        question: "מה אומר התג ״מאומת״?",
        answer:
          "שהמסמכים נבדקו ואושרו. המסמכים עצמם אף פעם לא מוצגים ללקוחות — בעמוד הפרופיל הציבורי רואים אילו סוגי מסמכים אומתו, לא את הקבצים.",
      },
      {
        question: "אפשר לשלוח הודעה לפני שבוחרים?",
        answer:
          "כן. לכל הצעה יש שיחה נפרדת משלה, ואפשר לשאול שאלות לפני שמחליטים. בעל מקצוע אחד לא רואה את השיחה שלכם עם אחר.",
      },
      {
        question: "איך אני מדרג?",
        answer:
          "אחרי שהעבודה הסתיימה, במסך הסיכום. אפשר לדרג רק קריאה שנסגרה — וזו הסיבה שכל ביקורת באתר קשורה לעבודה אמיתית שבוצעה.",
      },
    ],
  },
  {
    id: "trust",
    label: "אבטחה ופרטיות",
    entries: [
      {
        question: "מי רואה את הכתובת שלי?",
        answer:
          "הקריאה מוצגת לבעלי מקצוע מאומתים ברדיוס שביקשתם, והכתובת המלאה נחוצה להם כדי להגיע. אף אחד מחוץ לרדיוס הזה לא רואה אותה.",
      },
      {
        question: "מה קורה לתמונות שהעליתי?",
        answer:
          "הן נשמרות באחסון פרטי. כל צפייה עוברת קישור חתום שנוצר בשרת, ורק מי שרשאי לראות את הקריאה עצמה מקבל אותו.",
      },
      {
        question: "אפשר להסיר את הפרטים שלי?",
        answer:
          "כן — פנו לתמיכה ונטפל בזה. שימו לב שקבלות ורישומי חיוב נשמרים כנדרש בחוק גם אחרי סגירת חשבון.",
      },
    ],
  },
  {
    id: "account",
    label: "חשבון",
    entries: [
      {
        question: "אין לי סיסמה — איך מתחברים?",
        answer:
          "בטלפון בלבד: מזינים מספר, מקבלים קוד ב-SMS, ונכנסים. אין סיסמאות ב-Handy, ולכן גם אין מה לגנוב.",
      },
      {
        question: "החלפתי מספר טלפון",
        answer:
          "פנו לתמיכה עם המספר הישן והחדש. את החיבור בין החשבון למספר אנחנו מעבירים ידנית, כי הוא גם אמצעי הזיהוי היחיד שלכם.",
      },
      {
        question: "איפה ההיסטוריה שלי?",
        answer:
          "באזור האישי — כל הקריאות הפתוחות והסגורות, הקבלות, ובעלי המקצוע ששמרתם לפעם הבאה.",
      },
    ],
  },
];

/** The most-asked links in the design's "נושאים פופולריים" card. */
export const POPULAR_HELP_TOPICS: readonly {
  label: string;
  topicId: string;
}[] = [
  { label: "עדכון מחיר בשטח", topicId: "jobs" },
  { label: "ביטול קריאה", topicId: "jobs" },
  { label: "דירוג ותלונה על בעל מקצוע", topicId: "pros" },
  { label: "קבלה וחשבונית", topicId: "jobs" },
];

/** מרכז עזרה לבעלי מקצוע — product-spec.md 4.11. */
export const PRO_FAQ: readonly FaqEntry[] = [
  {
    question: "מתי מגיע הכסף מהעבודה?",
    answer:
      "התשלום נגבה על ידך ישירות מהלקוח בשטח — Handy אינה צד לתשלום. מה שנרשם אצלנו הוא איך נגבה, כדי להנפיק קבלה ולחשב את העמלה.",
  },
  {
    // commission_rate() — one function, so the wallet, the bid form and the
    // receipt cannot drift apart.
    question: "כמה העמלה, ועל מה בדיוק?",
    answer:
      "12% מהסכום הסופי של עבודה שנסגרה, כולל עדכוני מחיר שאושרו. אין דמי הרשמה, אין דמי מנוי, ואין תשלום על הצעה שלא נבחרה.",
  },
  {
    question: "אפשר לעדכן מחיר אחרי שהלקוח בחר?",
    answer:
      "כן, אבל חובה לצרף תמונה של התקלה ולקבל אישור מפורש מהלקוח. עד לאישור העבודה ממשיכה במחיר המקורי, ובקשה שלא נענתה נסגרת כלא-מאושרת בסיום העבודה.",
  },
  {
    question: "למה לא מגיעות לי קריאות?",
    answer:
      "בדקו שהמתג ״זמין לקריאות״ דלוק, שרדיוס הפעילות לא צר מדי, ושתחומי ההתמחות בפרופיל מעודכנים. קריאה מגיעה אליכם רק אם היא בתוך הרדיוס שלכם וגם בתוך הרדיוס שהלקוח ביקש.",
  },
  {
    question: "מה קורה אם לקוח לא משלם?",
    answer:
      "פותחים מחלוקת מתוך העבודה. צוות Handy בודק אותה מול התיעוד המלא של הקריאה — ההצעה, התמונות, אישורי המחיר וההתכתבות — ומכריע.",
  },
  {
    question: "הפרופיל שלי הוחזר ל״ממתין לאישור״",
    answer:
      "זה קורה כשצוות Handy ביקש מסמכים מחודשים. עד שהמסמכים נבדקים שוב אי אפשר להגיש הצעות חדשות. העלו את המסמך המבוקש והפרופיל יחזור לתור.",
  },
];

/** The four guides linked from the pro help centre's sidebar. */
export const PRO_GUIDE_LINKS: readonly { label: string; slug: string }[] = [
  { label: "איך לכתוב הצעה שנבחרת", slug: "winning-quote" },
  { label: "צילום נכון של תקלה בשטח", slug: "field-photo" },
  { label: "ניהול לוח זמנים בעומס", slug: "busy-schedule" },
  { label: "חשבוניות ודיווח מע״מ", slug: "invoicing-vat" },
];

/** דרכי יצירת קשר — design/screens/content-6.4-support-contact.png. */
export const SUPPORT_CHANNELS = {
  whatsapp: "03-000-0000",
  email: "help@handy.co.il",
  hours: "08:00–22:00",
  /** מנהל קהילת בעלי המקצוע, on the pro help screen. */
  proHours: "09:00–18:00, ימים א׳–ה׳",
} as const;
