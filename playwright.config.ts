import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end coverage of the flows the product cannot ship without
 * (docs/roadmap.md, Phase 9): posting a call, bidding on it, choosing an
 * offer, a field price update, completion and the receipt.
 *
 * These tests drive the real app against the real local Supabase stack. There
 * are no mocks: RLS, the `security definer` functions and Storage are exactly
 * the things a browser test is worth running for, and mocking them would test
 * nothing that `npm run test` does not already cover.
 *
 * The server under test is a **production build**, not `next dev`. Server
 * actions, caching and `dynamic = "force-dynamic"` behave differently between
 * the two, and the built artefact is what actually ships.
 */

const PORT = Number(process.env.E2E_PORT ?? 3100);
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  // The critical flow walks one job from posting to receipt across two roles;
  // running its steps in parallel would be running them out of order.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "line" : "list",
  timeout: 60_000,
  expect: { timeout: 15_000 },

  use: {
    baseURL: BASE_URL,
    locale: "he-IL",
    timezoneId: "Asia/Jerusalem",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },

  projects: [
    // Signs each demo user in once, through the real OTP screens, and parks
    // the cookies in e2e/.auth. Repeating a phone login per test would trip
    // the SMS rate limit the security checklist deliberately tightened.
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      dependencies: ["setup"],
    },
  ],

  webServer: {
    command: `npm run build && npx next start --hostname 127.0.0.1 --port ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      // Canonical URLs and the sitemap are asserted against the origin the
      // tests actually run on, so a wrong value fails here rather than in
      // production. NEXT_PUBLIC_* is inlined at build time — hence setting it
      // on the command that builds.
      NEXT_PUBLIC_SITE_URL: BASE_URL,
    },
  },
});
