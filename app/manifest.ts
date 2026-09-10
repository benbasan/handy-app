import type { MetadataRoute } from "next";
import { SITE_NAME } from "@/lib/seo";

/**
 * The web app manifest.
 *
 * It exists for one concrete reason beyond tidiness: **iOS delivers web push
 * only to a site installed on the home screen** (Safari 16.4+), and a site
 * with no manifest cannot be installed. Phase 13 depends on a pro noticing a
 * two-hour window, and a meaningful share of Israeli pros are on iPhone.
 *
 * `dir` and `lang` are set here as well as on `<html>`: the installed app's
 * name and description are rendered by the operating system, outside any
 * document that could carry a direction of its own.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${SITE_NAME} — בעל מקצוע אמין ליד הבית`,
    short_name: SITE_NAME,
    description:
      "פרסמו קריאה בחינם וקבלו הצעות מחיר מבעלי מקצוע מאומתים באזור שלכם.",
    start_url: "/",
    display: "standalone",
    dir: "rtl",
    lang: "he",
    background_color: "#f7f9fc",
    // `--color-brand` from the @theme block in app/globals.css.
    theme_color: "#1e40af",
    icons: [
      { src: "/icon", sizes: "32x32", type: "image/png" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
