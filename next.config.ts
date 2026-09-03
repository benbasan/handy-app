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
   */
  serverExternalPackages: ["@react-pdf/renderer"],
  outputFileTracingIncludes: {
    "/api/receipts/[jobId]": ["./assets/fonts/**"],
  },
};

export default nextConfig;
