import { ImageResponse } from "next/og";
import { BRAND_HEX } from "@/components/ui/BrandMark";
import { MarkImage } from "./icon";

/**
 * The home-screen icon on iOS, which is the one platform where installing the
 * site is not optional decoration: from 16.4 onwards Safari delivers web push
 * only to a site that has been added to the home screen.
 *
 * The mark on the paper canvas, flat — iOS applies its own mask, so a rounded
 * corner drawn here would be rounded twice.
 */

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(<MarkImage ground={BRAND_HEX.canvas} />, size);
}
