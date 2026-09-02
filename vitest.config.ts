import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * Unit tests for the parts of the app that are plain logic: the address
 * gazetteer and the Zod schemas. Anything that depends on RLS is tested in the
 * database instead, with pgTAP (`npm run db:test`) — see docs/architecture.md
 * section 4.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
});
