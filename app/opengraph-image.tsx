import { ImageResponse } from "next/og";
import { OG_CONTENT_TYPE, OG_SIZE, OgCard, ogFonts } from "@/lib/og/card";
import { OG_COPY } from "@/lib/og/copy";

/**
 * The card every public page shares with, unless it draws its own.
 *
 * At the root of `app/` rather than inside `(marketing)`: a route group adds
 * no segment, and this has to cover the signed-in areas too — a customer who
 * pastes a link to a screen they cannot share should still get a Handy card
 * rather than a blank one.
 */

export const alt = "Handy — בעל מקצוע אמין ליד הבית, היום";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function OpengraphImage() {
  return new ImageResponse(
    <OgCard
      eyebrow={OG_COPY.home.eyebrow}
      title={OG_COPY.home.title}
      subtitle={OG_COPY.home.subtitle}
    />,
    { ...size, fonts: await ogFonts() },
  );
}
