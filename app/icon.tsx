import { ImageResponse } from "next/og";

/**
 * The browser-tab and home-screen icon, drawn from the design tokens rather
 * than shipped as a binary.
 *
 * `public/` held nothing but the five SVGs `create-next-app` leaves behind, so
 * every tab in the product wore the Next.js default and a link pinned to a
 * phone had no mark at all. There is no artwork to ship — the wordmark in
 * components/ui/Logo.tsx is a filled brand circle carrying an H, and that is
 * exactly what this is. Generated, so the day `--color-brand` changes there is
 * one value to change here and no asset to re-export.
 */

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

/** `--color-brand` from the @theme block in app/globals.css. */
const BRAND = "#1e40af";

export default function Icon() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: BRAND,
        color: "white",
        fontSize: 22,
        fontWeight: 700,
        borderRadius: 8,
      }}
    >
      H
    </div>,
    size,
  );
}
