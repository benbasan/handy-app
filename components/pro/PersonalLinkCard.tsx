import QRCode from "qrcode";
import {
  BUTTON_COMPACT,
  BUTTON_PRO,
  BUTTON_QUIET,
  CARD_CLASS,
} from "@/components/ui/primitives";
import { CopyLinkButton } from "@/components/pro/CopyLinkButton";
import { absoluteUrl } from "@/lib/seo";

/**
 * "הקישור האישי שלך" (Phase 13.8) — a pro brings the customers they already
 * have.
 *
 * On launch day there are no customers and every pro has some. The link opens
 * the posting form with this pro already chosen; the call goes to them alone
 * until they pass; and a customer who is new to Handy costs them nothing on
 * their first job (decided with the user, 14.9.2026). The card says that last
 * part plainly, because it is the whole reason to hand a customer to a
 * platform instead of taking the phone call.
 *
 * The QR is drawn on the server — `qrcode` runs in Node — so the page carries
 * a finished image and no client code to build one.
 */
export async function PersonalLinkCard({ slug }: { slug: string }) {
  const link = absoluteUrl(`/new-request?pro=${encodeURIComponent(slug)}`);
  const qr = await QRCode.toDataURL(link, {
    width: 480,
    margin: 1,
    errorCorrectionLevel: "M",
  });
  const whatsapp = `https://wa.me/?text=${encodeURIComponent(
    `אפשר לבקש ממני הצעת מחיר ב-Handy, ישירות אליי: ${link}`,
  )}`;

  return (
    <section className={CARD_CLASS}>
      <h2 className="text-base font-bold text-ink">הקישור האישי שלך</h2>
      <p className="mt-1 text-sm text-muted">
        לקוח שנכנס דרכו מבקש הצעה ישירות ממך — הקריאה נשלחת רק אליך. לקוח חדש
        ב-Handy: העבודה הראשונה איתו בלי דמי קבלת עבודה.
      </p>

      {/* eslint-disable-next-line @next/next/no-img-element -- a data URL built on this request */}
      <img
        src={qr}
        alt="ברקוד לקישור האישי שלך"
        className="mx-auto mt-4 size-44 rounded-xl border border-line bg-white p-2"
      />

      <p
        dir="ltr"
        className="mt-3 rounded-lg bg-canvas px-3 py-2 text-center font-mono text-xs break-all text-ink"
      >
        {link}
      </p>

      <div className="mt-3 space-y-2">
        <a
          href={whatsapp}
          target="_blank"
          rel="noopener noreferrer"
          className={`${BUTTON_PRO} ${BUTTON_COMPACT} w-full`}
        >
          שליחה בוואטסאפ
        </a>
        <CopyLinkButton link={link} />
        <a
          href={qr}
          download={`handy-${slug}-qr.png`}
          className={`${BUTTON_QUIET} ${BUTTON_COMPACT} w-full`}
        >
          הורדת הברקוד להדפסה
        </a>
      </div>
    </section>
  );
}
