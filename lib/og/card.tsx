import { readFile } from "node:fs/promises";
import path from "node:path";
import { toVisualOrder } from "./bidi";
import { OG_COPY } from "./copy";

/**
 * The shared half of every Open Graph card.
 *
 * `lib/seo.tsx` set `openGraph` with no `images` on every public page, and the
 * root layout set none at all — so a link pasted into WhatsApp, which is how
 * this product will actually spread in Israel, rendered as a bare grey rect
 * with a URL under it. That is the cheapest distribution surface the product
 * has and it was blank.
 *
 * **Hebrew is why this needs a font.** `ImageResponse` ships no Hebrew glyphs,
 * so a card built without one renders every letter as a tofu box — and it does
 * it silently, which is exactly the failure mode CLAUDE.md warns about for the
 * PDF: "verify by rendering it and looking, never by reading the source". The
 * two Heebo faces vendored in `assets/fonts/` for the receipt are the same
 * family the app loads from next/font, so the card and the site agree.
 *
 * Unlike the PDF, this is a *layout* problem and not a bidi one: each card is
 * a handful of separate lines, each one a single Hebrew run, so there is no
 * sentence mixing scripts for the algorithm to reorder.
 */

/** The @theme block in app/globals.css is the source of these. */
export const OG_COLORS = {
  ink: "#0f172a",
  brand: "#1e40af",
  cta: "#34d399",
  canvas: "#f7f9fc",
  muted: "#94a3b8",
} as const;

/** What Open Graph consumers expect; anything else gets cropped. */
export const OG_SIZE = { width: 1200, height: 630 };
export const OG_CONTENT_TYPE = "image/png";

async function face(file: string): Promise<ArrayBuffer> {
  const buffer = await readFile(path.join(process.cwd(), "assets/fonts", file));
  return new Uint8Array(buffer).buffer as ArrayBuffer;
}

/**
 * Both Heebo weights, in the shape `ImageResponse` wants.
 *
 * Read with `fs` at request time, which the tracer cannot infer — every route
 * that calls this needs an `outputFileTracingIncludes` entry in
 * `next.config.ts`, exactly as `/api/receipts/[jobId]` does.
 */
export async function ogFonts() {
  const [regular, bold] = await Promise.all([
    face("Heebo-Regular.ttf"),
    face("Heebo-Bold.ttf"),
  ]);

  // `style` is the CSS font-style — normal or italic. Heebo has no italic, and
  // the bold face is selected by `weight`, not by calling the style "bold".
  return [
    {
      name: "Heebo",
      data: regular,
      weight: 400 as const,
      style: "normal" as const,
    },
    {
      name: "Heebo",
      data: bold,
      weight: 700 as const,
      style: "normal" as const,
    },
  ];
}

/**
 * One card: a dark panel, the wordmark, a headline and a supporting line.
 *
 * `dir="rtl"` and `textAlign: "right"` are set explicitly rather than
 * inherited. There is no document around this element and no `<html dir>` to
 * read, so the RTL rule in CLAUDE.md section 3 — logical properties only —
 * has nothing to resolve against; this is the same exception `lib/pdf/`
 * takes, and for the same reason.
 */
export function OgCard({
  title,
  subtitle,
  eyebrow,
}: {
  title: string;
  subtitle: string;
  eyebrow?: string;
}) {
  return (
    <div
      dir="rtl"
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        background: OG_COLORS.ink,
        color: "white",
        fontFamily: "Heebo",
        padding: 72,
        textAlign: "right",
        direction: "rtl",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 999,
            background: OG_COLORS.brand,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 30,
            fontWeight: 700,
          }}
        >
          H
        </div>
        <div style={{ fontSize: 34, fontWeight: 700 }}>Handy</div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        {eyebrow && (
          <div style={{ fontSize: 30, color: OG_COLORS.cta, fontWeight: 700 }}>
            {toVisualOrder(eyebrow)}
          </div>
        )}
        <div style={{ fontSize: 66, fontWeight: 700, lineHeight: 1.15 }}>
          {toVisualOrder(title)}
        </div>
        <div style={{ fontSize: 32, color: OG_COLORS.muted, lineHeight: 1.35 }}>
          {toVisualOrder(subtitle)}
        </div>
      </div>

      <div style={{ fontSize: 26, color: OG_COLORS.muted }}>
        {toVisualOrder(OG_COPY.transparency)}
      </div>
    </div>
  );
}
