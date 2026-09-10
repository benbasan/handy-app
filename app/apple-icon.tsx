import { ImageResponse } from "next/og";

/**
 * The home-screen icon on iOS, which is the one platform where installing the
 * site is not optional decoration: from 16.4 onwards Safari delivers web push
 * only to a site that has been added to the home screen. Phase 13 depends on
 * a pro being willing to do that, and an install prompt for a page with no
 * icon is a hard sell.
 *
 * Same mark as app/icon.tsx at the size Apple asks for, with the flat
 * background iOS expects — it applies its own mask, so a rounded corner drawn
 * here would be rounded twice.
 */

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

const BRAND = "#1e40af";

export default function AppleIcon() {
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
        fontSize: 120,
        fontWeight: 700,
      }}
    >
      H
    </div>,
    size,
  );
}
