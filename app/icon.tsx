import { ImageResponse } from "next/og";
import { BRAND_HEX, BRAND_MARK_PATHS } from "@/components/ui/BrandMark";

/**
 * The browser-tab icon, drawn from the same paths as the mark in the header
 * rather than shipped as a binary — so the day the mark changes there is one
 * file to change and no asset to re-export (Phase 19).
 */

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(<MarkImage />, size);
}

/** Exported for app/apple-icon.tsx, which draws it on a flat ground. */
export function MarkImage({ ground }: { ground?: string }) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: ground ?? "transparent",
      }}
    >
      <svg
        viewBox="0 0 32 32"
        width={ground ? "72%" : "100%"}
        height={ground ? "72%" : "100%"}
      >
        <path d={BRAND_MARK_PATHS.house} fill={BRAND_HEX.brand} />
        <path
          d={BRAND_MARK_PATHS.check}
          fill="none"
          stroke="#ffffff"
          strokeWidth={2.8}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle
          cx={BRAND_MARK_PATHS.dot.cx}
          cy={BRAND_MARK_PATHS.dot.cy}
          r={BRAND_MARK_PATHS.dot.r}
          fill={BRAND_HEX.accent}
        />
      </svg>
    </div>
  );
}
