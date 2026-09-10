/**
 * Hebrew, in the order satori will actually draw it.
 *
 * `ImageResponse` renders through satori, which has **no bidirectional-text
 * engine** — verified rather than assumed: `@vercel/og` as bundled by Next
 * mentions "bidi" exactly once, as the SVG attribute name `unicode-bidi`, and
 * neither `dir="rtl"` nor `direction: rtl` changes a thing. It lays glyphs out
 * in code-point order, left to right. A Hebrew line handed to it straight
 * comes out reversed, and it does that silently, which is why this was found
 * by rendering the card and looking at it — the discipline CLAUDE.md section 2
 * sets for the PDF, and the same reason it exists.
 *
 * This is the exact problem the PDF avoided by picking a renderer with textkit
 * behind it. There is no such choice here: an Open Graph card is satori or it
 * is nothing.
 *
 * **What this function is, precisely.** For a paragraph containing no
 * strong left-to-right characters, the Unicode Bidirectional Algorithm's
 * output is the code-point sequence reversed — every character sits in one
 * right-to-left run, and the neutrals between them (a comma, an em dash, a
 * space) resolve to the surrounding direction and travel with it. So on that
 * one class of input, reversing is not an approximation of the UBA; it is the
 * UBA's answer.
 *
 * **What it is not.** The moment a Latin word or a digit appears, that run
 * must stay internally left-to-right while the Hebrew around it flips, and
 * reversing produces "53 ₪" out of "35 ₪". That is genuine bidi and this
 * function will not attempt it: `isSingleDirection()` says so, and
 * `lib/og/__tests__/bidi.test.ts` fails the build if any string a card
 * actually uses would need it.
 *
 * So the rule for OG copy is: **one direction per text node.** A number or a
 * Latin word gets its own element, where it is a paragraph of its own and no
 * reordering is required.
 */

/** Latin, Greek, Cyrillic — anything the UBA classes as strong L. */
const STRONG_LTR = /[A-Za-zÀ-ʯͰ-ӿ]/;

/** European and Arabic-Indic digits, which form their own LTR runs. */
const DIGITS = /[0-9٠-٩۰-۹]/;

/**
 * Is every strongly-directional character in this string right-to-left?
 *
 * True for pure Hebrew with punctuation and spaces; false as soon as one
 * Latin letter or one digit appears.
 */
export function isSingleDirection(text: string): boolean {
  return !STRONG_LTR.test(text) && !DIGITS.test(text);
}

/**
 * The visual order satori should be handed.
 *
 * Reverses by code point, not by UTF-16 unit, so a character outside the BMP
 * is not torn into two halves. Hebrew is a simple script — no contextual
 * shaping and no reordering marks, unlike Arabic or the Indic scripts — so
 * there is nothing else to do to it.
 *
 * A string this cannot safely handle is returned untouched. That is a
 * deliberate choice over throwing: an OG card is decoration on a page that
 * must still render, and the test suite is the thing that stops such a string
 * ever reaching here.
 */
export function toVisualOrder(text: string): string {
  if (!isSingleDirection(text)) return text;
  return [...text].reverse().join("");
}
