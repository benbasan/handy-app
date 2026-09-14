import { Card, PAGE_LEAD, SECTION_TITLE } from "@/components/ui/primitives";

/**
 * What the offers screen says when the honest count is none.
 *
 * This card used to end in a button — "הרחיבו את החיפוש ל-N ק״מ" — because the
 * customer chose the broadcast radius and widening it was the one lever they
 * held. On 11.9.2026 that lever was removed on purpose: a call now reaches every
 * verified pro whose *own* radius covers the address, so there is no number left
 * for the customer to raise.
 *
 * Which means this card has no action, and it does not pretend otherwise. It
 * states what is true, says what happens next without promising when, and stops.
 * A button that does nothing is worse on this screen than no button, because
 * this is the screen somebody reaches when the product has already disappointed
 * them once.
 */
export function NoProsNearby() {
  return (
    <Card className="p-8 text-center">
      <p className={SECTION_TITLE}>
        עוד אין בעל מקצוע מאומת שמכסה את הכתובת שלכם
      </p>
      <p className={PAGE_LEAD}>
        הקריאה פורסמה ונשמרה. אף בעל מקצוע מאומת לא הגדיר אזור פעילות שכולל את
        הכתובת הזו, ולכן היא עדיין לא נשלחה לאיש — היא תישלח מעצמה לראשון שיצטרף
        או שירחיב את האזור שלו.
      </p>
      {/* No "אין צורך לרענן". The offers screen is subscribed to `bids` and
          will update itself, but saying so here would be reassurance addressed
          to somebody who may be waiting for a pro who never arrives. */}
    </Card>
  );
}
