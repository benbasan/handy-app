import type { Metadata } from "next";
import { Heebo, Rubik } from "next/font/google";
import { SITE_URL } from "@/lib/seo";
import "./globals.css";

const heebo = Heebo({
  variable: "--font-heebo",
  subsets: ["hebrew", "latin"],
});

/**
 * The display face (Phase 19): headings, prices and the wordmark, through
 * `font-display`. Chosen by the user from the brand board over Fredoka and
 * Secular One. Running text stays Heebo.
 */
const rubik = Rubik({
  variable: "--font-rubik",
  subsets: ["hebrew", "latin"],
  weight: ["500", "700", "800"],
});

export const metadata: Metadata = {
  /*
   * Every relative URL in a metadata export resolves against this. Without it
   * Next warns at build time and falls back to localhost, which would have
   * published `http://localhost:3000/opengraph-image` as the card for the
   * whole site — a link that renders nothing anywhere but the machine that
   * built it. Same origin lib/seo.tsx builds its canonicals from, so the two
   * cannot disagree.
   */
  metadataBase: new URL(SITE_URL),
  title: "Handy — בעל מקצוע אמין ליד הבית",
  description:
    "פרסמו קריאה בחינם וקבלו הצעות מחיר מבעלי מקצוע מאומתים באזור שלכם, תוך דקות.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="he"
      dir="rtl"
      className={`${heebo.variable} ${rubik.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
