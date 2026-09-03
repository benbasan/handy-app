import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * Two kinds of suite run here.
 *
 * `lib/**` holds unit tests for the parts of the app that are plain logic: the
 * address gazetteer and the Zod schemas. Anything that depends on RLS is
 * tested in the database instead, with pgTAP (`npm run db:test`) — see
 * docs/architecture.md section 4.
 *
 * `tests/**` (Phase 9) holds audits that read the repository as text rather
 * than importing it: logical properties only, no secrets in code,
 * `.env.example` in step with what the code reads. They are rules stated once
 * in CLAUDE.md and otherwise checked by nobody.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts", "tests/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
});
