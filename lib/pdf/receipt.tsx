import "server-only";

import fs from "node:fs";
import path from "node:path";
import {
  Document,
  Font,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer";
import type { JobReceipt } from "@/lib/supabase/completion";
import {
  COMMISSION_RATE,
  formatReceiptDate,
  type ReceiptLine,
} from "@/lib/validation/completion";
import { PAYMENT_METHOD_LABEL } from "@/lib/validation/pros";
import { jobReference } from "@/lib/validation/jobs";

/**
 * "הורד קבלה PDF" — design/screens/customer-4.1-summary-receipt-rating.png,
 * and "הורד קבלה" beside every closed job on pro-3.2-my-jobs.png.
 *
 * **Why @react-pdf/renderer** (CLAUDE.md section 9 left this open until the
 * phase that needed it): a Hebrew receipt is not a font problem, it is a
 * bidirectional-text problem. A PDF has no bidi engine of its own — whatever
 * writes the file decides the visual order of every run — so a lighter writer
 * (pdf-lib, pdfkit) would have meant reversing Hebrew runs by hand and getting
 * "380 ₪" wrong in a way nobody who reads only Latin script would catch.
 * @react-pdf/renderer lays text out through textkit, which does the bidi
 * reordering, and it takes a TTF, which is what Hebrew needs. It is also the
 * option CLAUDE.md named first. The alternative on that line — an Edge Function
 * calling a PDF service — would have put a receipt behind a third-party
 * network call and a second set of credentials for no gain.
 *
 * **Why the font is vendored.** The app loads Heebo through `next/font/google`
 * for the browser, which produces WOFF2 the PDF renderer cannot read. The two
 * TTF faces in `assets/fonts/` are the same family under the same OFL licence,
 * read from disk here and handed over as data URLs — `Font.register` accepts a
 * path, a URL or a data URL, and a data URL is the one that does not depend on
 * the renderer's own idea of the working directory. `next.config.ts` traces the
 * folder into the deployment.
 */

const FONT_DIR = path.join(process.cwd(), "assets", "fonts");

function fontDataUrl(file: string): string {
  const bytes = fs.readFileSync(path.join(FONT_DIR, file));
  return `data:font/ttf;base64,${bytes.toString("base64")}`;
}

let registered = false;

function registerFonts(): void {
  if (registered) return;
  Font.register({
    family: "Heebo",
    fonts: [
      { src: fontDataUrl("Heebo-Regular.ttf"), fontWeight: 400 },
      { src: fontDataUrl("Heebo-Bold.ttf"), fontWeight: 700 },
    ],
  });
  registered = true;
}

// The palette of app/globals.css, so a printed receipt and the screen it was
// downloaded from are recognisably the same document.
const INK = "#0f172a";
const MUTED = "#64748b";
const LINE = "#e2e8f0";
const BRAND = "#1e40af";
const CTA = "#059669";

const styles = StyleSheet.create({
  page: {
    fontFamily: "Heebo",
    fontSize: 11,
    color: INK,
    paddingTop: 48,
    paddingBottom: 56,
    paddingHorizontal: 48,
  },
  // Every row on this page is RTL: the label leads on the right, the number
  // trails on the left. `row-reverse` rather than `direction: rtl`, which
  // react-pdf applies to text runs but not to flex ordering.
  row: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "baseline",
  },
  right: { textAlign: "right" },
  title: { fontSize: 24, fontWeight: 700, textAlign: "right" },
  wordmark: { fontSize: 20, fontWeight: 700, color: BRAND },
  meta: { fontSize: 10, color: MUTED, textAlign: "right", marginTop: 4 },
  section: {
    marginTop: 22,
    borderTopWidth: 1,
    borderTopColor: LINE,
    paddingTop: 14,
  },
  heading: {
    fontSize: 13,
    fontWeight: 700,
    textAlign: "right",
    marginBottom: 8,
  },
  line: { marginTop: 7 },
  total: {
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: LINE,
    paddingTop: 10,
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "baseline",
  },
  totalLabel: { fontSize: 14, fontWeight: 700 },
  totalValue: { fontSize: 18, fontWeight: 700, color: BRAND },
  note: { fontSize: 9, color: MUTED, textAlign: "right", marginTop: 6 },
  footer: {
    position: "absolute",
    bottom: 28,
    // Physical `left`/`right` rather than the logical utilities CLAUDE.md
    // section 3 requires of the app: this is react-pdf's stylesheet, which has
    // no logical properties, and a PDF page has no `dir`. Symmetric values, so
    // there is nothing for a direction to flip. Same for `textAlign: "right"`
    // throughout — the document is Hebrew, always.
    left: 48,
    right: 48,
    borderTopWidth: 1,
    borderTopColor: LINE,
    paddingTop: 10,
  },
});

function Money({
  amount,
  bold = false,
  tone,
}: {
  amount: number;
  bold?: boolean;
  tone?: string;
}) {
  return (
    <Text style={{ fontWeight: bold ? 700 : 400, color: tone ?? INK }}>
      {`${amount.toLocaleString("he-IL")} ₪`}
    </Text>
  );
}

/**
 * The receipt itself. `audience` decides one thing only: whether the commission
 * block appears. The customer's copy has no 12% on it, because the 12% is
 * between Handy and the pro — the same split `job_receipt()` makes in the
 * database, restated here rather than assumed from a NULL.
 */
export function ReceiptDocument({
  receipt,
  lines,
  audience,
}: {
  receipt: JobReceipt;
  lines: ReceiptLine[];
  audience: "customer" | "pro";
}) {
  const reference = jobReference(receipt.jobId);
  const showsCommission =
    audience === "pro" && receipt.commissionAmount !== null;

  return (
    <Document title={`קבלה ${reference} — Handy`} author="Handy" language="he">
      <Page size="A4" style={styles.page}>
        <View style={styles.row}>
          <View>
            <Text style={styles.title}>קבלה</Text>
            <Text style={styles.meta}>{`קריאה ${reference}`}</Text>
          </View>
          <Text style={styles.wordmark}>Handy</Text>
        </View>

        {/* Label/value rows rather than one "קריאה X · תחום · תאריך" line.
            A sentence that mixes Hebrew, a Latin reference and a date is three
            bidi runs, and the reordering that produces is correct by the
            Unicode algorithm and unreadable to a person. Short, single-fact
            rows have no ambiguity to resolve. */}
        <View style={styles.section}>
          <Text style={styles.heading}>פרטי העבודה</Text>

          <View style={styles.row}>
            <Text style={{ color: MUTED }}>לקוח</Text>
            <Text>{receipt.customerName ?? "—"}</Text>
          </View>
          <View style={[styles.row, styles.line]}>
            <Text style={{ color: MUTED }}>בעל מקצוע</Text>
            <Text>{receipt.proName ?? "—"}</Text>
          </View>
          <View style={[styles.row, styles.line]}>
            <Text style={{ color: MUTED }}>תחום</Text>
            <Text>{receipt.categoryName}</Text>
          </View>
          <View style={[styles.row, styles.line]}>
            <Text style={{ color: MUTED }}>כתובת</Text>
            <Text>{receipt.addressText}</Text>
          </View>
          <View style={[styles.row, styles.line]}>
            <Text style={{ color: MUTED }}>נסגר בתאריך</Text>
            <Text>{formatReceiptDate(receipt.chargedAt)}</Text>
          </View>
          <View style={[styles.row, styles.line]}>
            <Text style={{ color: MUTED }}>אמצעי תשלום</Text>
            <Text>{PAYMENT_METHOD_LABEL[receipt.paymentMethod]}</Text>
          </View>

          <Text style={[styles.note, { marginTop: 10 }]}>
            {receipt.description}
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.heading}>סיכום חיוב</Text>

          {lines.map((line, index) => (
            <View key={index} style={[styles.row, styles.line]}>
              <Text>{line.label}</Text>
              <Text>
                {line.delta ? "+ " : ""}
                {`${line.amount.toLocaleString("he-IL")} ₪`}
              </Text>
            </View>
          ))}

          <View style={styles.total}>
            <Text style={styles.totalLabel}>סה״כ</Text>
            <Text style={styles.totalValue}>
              {`${receipt.totalPrice.toLocaleString("he-IL")} ₪`}
            </Text>
          </View>

          {lines.length > 1 && (
            <Text style={styles.note}>
              כל תוספת ברשימה אושרה על ידי הלקוח באתר, לצד תמונה שצולמה בשטח.
              ללא אישור — העבודה נשארת במחיר המקורי.
            </Text>
          )}
        </View>

        {showsCommission && (
          <View style={styles.section}>
            <Text style={styles.heading}>עמלת Handy</Text>

            <View style={styles.row}>
              <Text style={{ color: MUTED }}>
                {`עמלה (${Math.round(COMMISSION_RATE * 100)}% מהעבודה שנסגרה)`}
              </Text>
              <Money amount={receipt.commissionAmount ?? 0} />
            </View>
            <View style={[styles.row, styles.line]}>
              <Text style={{ fontWeight: 700 }}>נטו לבעל המקצוע</Text>
              <Money amount={receipt.netAmount ?? 0} bold tone={CTA} />
            </View>

            <Text style={styles.note}>
              העמלה נגבית מבעל המקצוע בלבד, ואינה חלק מהסכום שהלקוח שילם.
            </Text>
          </View>
        )}

        {/* One sentence per line, for the reason the detail rows above give:
            a Latin word in the middle of a wrapped Hebrew paragraph reorders
            correctly and reads wrongly. */}
        <View style={styles.footer} fixed>
          <Text style={styles.note}>
            התשלום מתבצע ישירות בין הלקוח לבעל המקצוע.
          </Text>
          <Text style={styles.note}>
            Handy אינה מעבדת את התשלום ואינה צד לו — היא מתעדת אותו לצורך הקבלה
            והעמלה.
          </Text>
        </View>
      </Page>
    </Document>
  );
}

/** Renders the document to the bytes a route handler streams back. */
export async function renderReceiptPdf(props: {
  receipt: JobReceipt;
  lines: ReceiptLine[];
  audience: "customer" | "pro";
}): Promise<Uint8Array> {
  registerFonts();
  return renderToBuffer(<ReceiptDocument {...props} />);
}
