/**
 * The editorial half of a service category.
 *
 * `public.categories` holds the two facts the product needs — a Hebrew name
 * and a slug — and nothing else, because everything else about a category is
 * copy: what to call the person who does it, what the trade covers, what
 * customers actually ask before they post. That is content, it is reviewed in
 * a diff, and it has no business in a table nobody can edit anyway (the
 * category list has no client write grant at all).
 *
 * Keyed by `categories.slug`, like lib/categories.ts's icons, so renaming a
 * category in Hebrew cannot silently blank its page.
 */
export type CategoryCopy = {
  /** "אינסטלטור" — the person, for a page title. `categories.name_he` is the trade. */
  professional: string;
  /** "אינסטלטורים" — the same, for "N אינסטלטורים מאומתים באזור". */
  professionalPlural: string;
  /** One sentence describing what the trade covers, for the page and its meta description. */
  summary: string;
  /** The jobs customers post most often in this trade. */
  commonJobs: readonly string[];
  /** Trade-specific questions, on top of the shared ones in lib/content/help.ts. */
  faq: readonly { question: string; answer: string }[];
};

const FALLBACK: CategoryCopy = {
  professional: "בעל מקצוע",
  professionalPlural: "בעלי מקצוע",
  summary:
    "בעלי מקצוע מאומתים באזור שלכם, עם הצעת מחיר מלאה מראש שכוללת את הביקור.",
  commonJobs: [],
  faq: [],
};

const CATEGORY_COPY: Record<string, CategoryCopy> = {
  plumbing: {
    professional: "אינסטלטור",
    professionalPlural: "אינסטלטורים",
    summary:
      "נזילות, סתימות, החלפת ברזים והתקנת כלים סניטריים — כולל טיפול בדחיפות באותו יום.",
    commonJobs: [
      "פתיחת סתימה בכיור או במקלחת",
      "החלפת ברז מטבח או אמבטיה",
      "איתור ותיקון נזילה נסתרת",
      "התקנת אסלה או כיור",
      "תיקון דוד שמש מטפטף",
    ],
    faq: [
      {
        question: "כמה זמן לוקח לפתוח סתימה?",
        answer:
          "רוב הסתימות נפתחות בביקור אחד. אם מתברר בשטח שנדרשת עבודה גדולה יותר — בעל המקצוע חייב לצלם את התקלה ולבקש את אישורכם לפני שהמחיר משתנה.",
      },
      {
        question: "האם המחיר כולל את הביקור?",
        answer:
          "כן. כל הצעה ב-Handy כוללת את הביקור, ואין דמי הגעה נפרדים (חוק עסקי 2).",
      },
    ],
  },
  electrical: {
    professional: "חשמלאי",
    professionalPlural: "חשמלאים",
    summary:
      "מפסק שקופץ, שקע שרוף, החלפת לוח חשמל והתקנת גופי תאורה — בידי חשמלאים מורשים.",
    commonJobs: [
      "מפסק שקופץ שוב ושוב",
      "החלפת שקע או מפסק",
      "התקנת גוף תאורה או מאוורר תקרה",
      "החלפת לוח חשמל ישן",
      "הוספת נקודת חשמל",
    ],
    faq: [
      {
        question: "בעל המקצוע חייב להיות חשמלאי מורשה?",
        answer:
          "עבודת חשמל דורשת רישיון בחוק. בעלי מקצוע בתחום החשמל ב-Handy מעלים רישיון בתהליך האימות, והתג מאומת מוצג רק אחרי שצוות Handy בדק אותו.",
      },
    ],
  },
  hvac: {
    professional: "טכנאי מזגנים",
    professionalPlural: "טכנאי מזגנים",
    summary:
      "מזגן שלא מקרר, טפטוף מים, ניקוי וחיטוי, ותיקוני קיץ דחופים — לבית ולעסק.",
    commonJobs: [
      "מזגן שמקרר חלש",
      "טפטוף מים מהיחידה הפנימית",
      "ניקוי וחיטוי לפני הקיץ",
      "מילוי גז",
      "התקנת מזגן עילי",
    ],
    faq: [
      {
        question: "כדאי לנקות את המזגן לפני שקוראים לטכנאי?",
        answer:
          "לרוב כן — פילטר סתום הוא הסיבה הנפוצה ביותר לקירור חלש, והוא משהו שאפשר לעשות לבד בעשר דקות. יש על זה מדריך במרכז המדריכים שלנו.",
      },
    ],
  },
  carpentry: {
    professional: "נגר",
    professionalPlural: "נגרים",
    summary:
      "תיקון והרכבת ארונות, התאמת דלתות, מדפים לפי מידה ותיקוני עץ בבית.",
    commonJobs: [
      "דלת ארון שלא נסגרת",
      "התאמת דלת פנים שנתפסת",
      "מדפים לפי מידה",
      "תיקון מגירות",
      "הרכבת ארון הזזה",
    ],
    faq: [],
  },
  painting: {
    professional: "צבעי",
    professionalPlural: "צבעים",
    summary: "צביעת חדר או דירה, תיקוני שפכטל, וטיפול בכתמי רטיבות אחרי איטום.",
    commonJobs: [
      "צביעת חדר",
      "תיקון שפכטל וסדקים",
      "צביעה אחרי נזילה",
      "צביעת דירה לפני מעבר",
    ],
    faq: [],
  },
  locksmith: {
    professional: "מנעולן",
    professionalPlural: "מנעולנים",
    summary:
      "פריצת דלת ננעלת, החלפת צילינדר, שכפול מפתחות ושדרוג מנעול — כולל שירות דחוף.",
    commonJobs: [
      "ננעלתי בחוץ",
      "החלפת צילינדר",
      "שדרוג מנעול רב-בריח",
      "תיקון ידית דלת",
    ],
    faq: [
      {
        question: "זה דחוף — כמה מהר מגיעים?",
        answer:
          "בקריאות דחופות ההצעות הראשונות מגיעות תוך דקות, וכל הצעה כוללת זמן הגעה משוער. בוחרים לפי מה שמתאים לכם, לא רק לפי מחיר.",
      },
    ],
  },
  gardening: {
    professional: "גנן",
    professionalPlural: "גננים",
    summary: "גיזום, טיפול בדשא, מערכות השקיה ועיצוב גינה — חד-פעמי או קבוע.",
    commonJobs: [
      "גיזום עצים ושיחים",
      "תיקון מערכת השקיה",
      "טיפול בדשא",
      "פינוי גזם",
    ],
    faq: [],
  },
  cleaning: {
    professional: "איש ניקיון",
    professionalPlural: "אנשי ניקיון",
    summary:
      "ניקיון יסודי, ניקיון אחרי שיפוץ או מעבר דירה, וניקוי ספות ושטיחים.",
    commonJobs: [
      "ניקיון אחרי שיפוץ",
      "ניקיון לפני כניסה לדירה",
      "ניקוי ספה או שטיח",
      "ניקיון חלונות",
    ],
    faq: [],
  },
  "furniture-assembly": {
    professional: "מרכיב רהיטים",
    professionalPlural: "מרכיבי רהיטים",
    summary: "הרכבת רהיטים מקופסה, תלייה על הקיר, והתקנת מטבחונים וארונות.",
    commonJobs: [
      "הרכבת ארון",
      "הרכבת מיטה או ספה",
      "תלייה של טלוויזיה על הקיר",
      "התקנת מדפים",
    ],
    faq: [],
  },
  waterproofing: {
    professional: "בעל מקצוע לאיטום",
    professionalPlural: "בעלי מקצוע לאיטום",
    summary:
      "איטום גגות ומרפסות, טיפול ברטיבות בקירות, ואיטום חדרים רטובים לפני החורף.",
    commonJobs: [
      "רטיבות בתקרה",
      "איטום מרפסת",
      "איטום גג לפני החורף",
      "רטיבות בקיר חיצוני",
    ],
    faq: [],
  },
};

export function categoryCopy(slug: string): CategoryCopy {
  return CATEGORY_COPY[slug] ?? FALLBACK;
}
