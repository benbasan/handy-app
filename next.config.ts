import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /*
   * The PDF receipt renderer (Phase 6). Two settings, both about
   * `lib/pdf/receipt.tsx`:
   *
   *  - `serverExternalPackages` keeps @react-pdf/renderer out of the bundler
   *    and lets Node require it at runtime. It ships a WASM layout engine and
   *    its own font machinery, neither of which survives being traced through
   *    a bundle.
   *  - `outputFileTracingIncludes` packs the two Heebo TTF faces into the
   *    deployment. They are read with `fs` at request time, which the tracer
   *    cannot infer from a path built with `path.join`.
   *
   * Phase 12 added a second reader of those same faces: the Open Graph cards
   * (`lib/og.tsx`). `ImageResponse` ships no Hebrew glyphs, so a card built
   * without a font renders every letter as a box — silently. Each route that
   * draws one needs its own entry here for the same reason the receipt does.
   */
  serverExternalPackages: ["@react-pdf/renderer"],
  outputFileTracingIncludes: {
    "/api/receipts/[jobId]": ["./assets/fonts/**"],
    "/opengraph-image": ["./assets/fonts/**"],
  },

  /*
   * The service worker must never come from a cache.
   *
   * A stale one is uniquely bad: it keeps handling `push` with whatever code
   * it was built with, so a fixed bug stays fixed for everybody except the
   * people who already have the broken version — and there is no page load
   * that would replace it, because the worker is what the browser consults
   * before it asks the network. `updateViaCache: "none"` at registration is
   * the other half of the same instruction.
   */
  async headers() {
    return [
      {
        source: "/_next/static/service-worker/:path*",
        headers: [{ key: "Cache-Control", value: "no-store, must-revalidate" }],
      },
    ];
  },
};

export default nextConfig;
