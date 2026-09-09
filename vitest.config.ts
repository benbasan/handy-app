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

    /*
     * Coverage is measured over the modules that are *meant* to be unit-tested,
     * not over `lib/**`.
     *
     * That distinction is the whole reason there is a threshold at all. Point
     * this at everything and the number is 27%, because `lib/supabase/**` and
     * `lib/actions/**` are deliberately not unit-tested — the rules they carry
     * live in RLS and in `security definer` functions, and are proved in pgTAP
     * where they actually run (`npm run db:test`). A 27% gate would say nothing
     * about anything and would be met by testing whatever was cheapest.
     *
     * Over the plain logic — the Zod schemas, the address gazetteer, the OTP
     * error mapping, the form helpers — it is 91%, and a threshold there fails
     * for a real reason: a schema added without tests. Generated data is
     * excluded for the same reason it is included at all — see below.
     *
     * `lib/actions/formData.ts` is in the list and the rest of `lib/actions` is
     * not, which is the line exactly: it is the one module in there that is
     * pure logic rather than a server action against the database.
     */
    coverage: {
      provider: "v8",
      include: [
        "lib/validation/**",
        "lib/maps/**",
        "lib/auth/**",
        "lib/actions/formData.ts",
      ],
      /*
       * `localities.data.ts` is generated and is 313 object literals with no
       * branch in them. Counted, it adds ~2,500 statements that are "covered"
       * by importing the module at all, which would lift the percentage while
       * saying nothing — the opposite of what a threshold is for. What is worth
       * asserting about that file is asserted directly, in
       * lib/maps/__tests__/gazetteer.test.ts: every locality inside the country
       * box, every stored form already folded, no name twice.
       */
      exclude: ["**/__tests__/**", "lib/maps/localities.data.ts"],
      reporter: ["text-summary", "html"],
      thresholds: {
        statements: 85,
        branches: 90,
        functions: 85,
        lines: 85,
      },
    },
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
});
