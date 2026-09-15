/**
 * Two short lists per trade, written for the two moments a customer is waiting
 * (Phase 18):
 *
 *   * `UNTIL_THEY_ARRIVE` — "עד שמגיעים". On the offers screen of a call posted
 *     as `asap`, before any pro has accepted. Only the trades where something
 *     can actually get worse while you wait have one; a painting job with an
 *     urgency flag gets no safety card, because a safety card about paint would
 *     be noise that teaches people to skip the real ones.
 *   * `VISIT_PREP` — "להתכונן לביקור". On the tracking screen, once a pro has
 *     accepted. Every trade has one, with a general fallback.
 *
 * Editorial copy in code, like `guides.ts`: no figure, no promise about what a
 * pro will do or charge. The emergency numbers are the national ones (101 מד״א,
 * 102 כבאות והצלה, 103 חברת החשמל) and appear only where the danger they are for
 * is plausible.
 */

export type PrepList = {
  title: string;
  items: readonly string[];
};

/** The one line every urgent card ends with, whatever the trade. */
export const DANGER_LINE =
  "עשן, ריח גז או סכנה לאדם: צאו מהבית והתקשרו ל-102 (כבאות והצלה) או ל-101 (מד״א). בעל מקצוע הוא לא הכתובת.";

export const UNTIL_THEY_ARRIVE: Readonly<Record<string, PrepList>> = {
  plumbing: {
    title: "עד שבעל המקצוע מגיע",
    items: [
      "סגרו את ברז הניל של הכיור או האסלה. אם הנזילה לא נעצרת — את הברז הראשי, ליד שעון המים.",
      "אם מים מגיעים לשקע או ללוח החשמל, הורידו את המפסק בלוח לפני שנוגעים במשהו, ובידיים יבשות.",
      "שימו דלי ומגבות, והזיזו מהאזור מכשירי חשמל ורהיטים.",
      "צלמו את מקור הנזילה ושלחו בצ׳אט — זה מה שבעל המקצוע ירצה לראות.",
    ],
  },
  electrical: {
    title: "עד שבעל המקצוע מגיע",
    items: [
      "אל תגעו בשקע, במתג או במכשיר שחם, מעלה ריח או מנצנץ.",
      "אם אפשר להגיע ללוח בבטחה ובידיים יבשות — הורידו את המפסק של המעגל הבעייתי, או את הראשי.",
      "אין חשמל בכל הבניין או ברחוב? זו כנראה תקלה של חברת החשמל: 103.",
      "אל תחזירו מפסק שקופץ שוב ושוב. זה הסימן שבעל המקצוע צריך לראות.",
    ],
  },
  hvac: {
    title: "עד שבעל המקצוע מגיע",
    items: [
      "כבו את המזגן בשלט, ואם יש לו מפסק נפרד בלוח — גם שם.",
      "מים מטפטפים מהיחידה? שימו מגבת או דלי מתחת, ואל תגעו ביחידה כשהיא רטובה.",
      "אל תפתחו את כיסוי היחידה ואל תנסו לנקות אותה מבפנים.",
      "צלמו את המדבקה בצד היחידה (דגם ויצרן) ושלחו בצ׳אט.",
    ],
  },
  locksmith: {
    title: "עד שהמנעולן מגיע",
    items: [
      "משהו דולק על הכיריים, או מישהו שזקוק לעזרה נמצא בפנים? אל תחכו: 102.",
      "ייתכן שהמנעולן יבקש לוודא שזו הדירה שלכם. הכינו תעודה או מסמך עם הכתובת, אם יש בהישג יד.",
      "אל תנסו לפרוץ את המנעול בעצמכם — נזק לצילינדר או למשקוף מייקר את התיקון.",
    ],
  },
  waterproofing: {
    title: "עד שבעל המקצוע מגיע",
    items: [
      "הזיזו רהיטים, מכשירי חשמל ושטיחים מהקיר או מהתקרה הרטובים.",
      "אם המים מגיעים לשקע או לגוף תאורה, הורידו את המפסק שלו בלוח.",
      "צלמו את הכתם ואת היקפו עכשיו. אם הוא גדל עד הביקור, צלמו שוב.",
    ],
  },
};

const GENERAL_PREP: PrepList = {
  title: "להתכונן לביקור",
  items: [
    "פנו גישה חופשית למקום העבודה.",
    "שאלו בצ׳אט לפני הביקור מה כלול במחיר, אם זה עוד לא ברור.",
    "השאירו את הטלפון זמין — בעל המקצוע עשוי להתקשר כשהוא בדרך.",
  ],
};

export const VISIT_PREP: Readonly<Record<string, PrepList>> = {
  plumbing: {
    title: "להתכונן לביקור",
    items: [
      "פנו את הארון שמתחת לכיור, או את הגישה לאסלה או למקלחת.",
      "ודאו שאפשר להגיע לברז הראשי ולשעון המים.",
      "קניתם חלק בעצמכם (ברז, סיפון)? השאירו אותו באריזה, עם הקבלה.",
    ],
  },
  electrical: {
    title: "להתכונן לביקור",
    items: [
      "פנו גישה חופשית ללוח החשמל.",
      "כתבו בצ׳אט אילו שקעים, מתגים או מכשירים לא עובדים — רשימה אחת חוסכת סיבוב בבית.",
      "גוף תאורה או מתג שקניתם — השאירו באריזה עד שבעל המקצוע יראה אותו.",
    ],
  },
  hvac: {
    title: "להתכונן לביקור",
    items: [
      "פנו גישה ליחידה הפנימית, ואם אפשר — גם ליחידה החיצונית.",
      "הזיזו רהיטים שנמצאים ישירות מתחת ליחידה.",
      "הכינו את השלט, וצלמו את מדבקת הדגם אם עוד לא שלחתם.",
    ],
  },
  carpentry: {
    title: "להתכונן לביקור",
    items: [
      "רוקנו את הארון, המגירה או הדלת שצריך לתקן.",
      "יש מידות, תמונה של מה שאתם רוצים או דוגמת גימור? שלחו בצ׳אט לפני הביקור.",
      "פנו מקום עבודה סביב הרהיט.",
    ],
  },
  painting: {
    title: "להתכונן לביקור",
    items: [
      "רכזו את הרהיטים במרכז החדר, או הוציאו את מה שאפשר.",
      "הורידו תמונות, מדפים וווילונות מהקירות שנצבעים.",
      "החליטו על הגוון מראש. שאלו בצ׳אט אם הצבע כלול במחיר.",
    ],
  },
  locksmith: {
    title: "להתכונן לביקור",
    items: [
      "הכינו מסמך שמקשר אתכם לכתובת — המנעולן עשוי לבקש לראות.",
      "יש מפתח קיים או צילינדר ישן? השאירו אותם בהישג יד.",
    ],
  },
  gardening: {
    title: "להתכונן לביקור",
    items: [
      "ודאו גישה לגינה ולברז מים.",
      "פנו רהיטי גן, צעצועים וחפצים מהשטח.",
      "שאלו בצ׳אט אם פינוי הגזם כלול במחיר.",
    ],
  },
  cleaning: {
    title: "להתכונן לביקור",
    items: [
      "אספו חפצים שבירים או יקרים מהמשטחים.",
      "אלרגיה לחומר מסוים, או חיית מחמד בבית? כתבו בצ׳אט מראש.",
      "ודאו שיש מים וחשמל זמינים.",
    ],
  },
  "furniture-assembly": {
    title: "להתכונן לביקור",
    items: [
      "השאירו את הקרטונים סגורים, ליד המקום שבו הרהיט יעמוד.",
      "פנו מקום עבודה פנוי על הרצפה.",
      "אם הרהיט מתקבע לקיר ואתם יודעים איפה עוברים צנרת או חשמל — ספרו לבעל המקצוע.",
    ],
  },
  waterproofing: {
    title: "להתכונן לביקור",
    items: [
      "פנו גישה לגג, למרפסת או לקיר הרטוב.",
      "הזיזו רהיטים מהקיר.",
      "צלמו את הרטיבות לפני הביקור, כדי שאפשר יהיה להשוות אחרי העבודה.",
    ],
  },
};

/** The safety card for an urgent call in this trade, or null where there is none. */
export function untilTheyArrive(categorySlug: string | null): PrepList | null {
  return (categorySlug && UNTIL_THEY_ARRIVE[categorySlug]) || null;
}

/** The visit checklist for this trade, falling back to the general one. */
export function visitPrep(categorySlug: string | null): PrepList {
  return (categorySlug && VISIT_PREP[categorySlug]) || GENERAL_PREP;
}
