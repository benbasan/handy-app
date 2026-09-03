import fs from "node:fs";
import path from "node:path";
import { test as setup } from "@playwright/test";
import { DEMO_USERS, storageStatePath, type DemoUserKey } from "./demo-users";
import { signIn } from "./helpers";

/**
 * One real login per demo user, saved for the rest of the run.
 *
 * This is also, by itself, coverage of the phase-1 flow: if phone + OTP stops
 * working, every project that depends on this one fails before it starts.
 *
 * A saved sign-in is reused while it is fresh, because `[auth.sms]
 * max_frequency` in supabase/config.toml refuses a second code to the same
 * number inside a minute. That limit is a security-checklist item, not an
 * obstacle — the cheapest way to run up an SMS bill on someone else's account
 * is an unthrottled resend — so the suite lives within it rather than turning
 * it down for the tests. Two consecutive `npm run test:e2e` runs would
 * otherwise fail on the second one, which teaches everybody to disable it.
 */
const KEYS: DemoUserKey[] = ["customer", "customerB", "pro", "admin"];

/**
 * How long a saved sign-in is reused for. Comfortably inside `jwt_expiry`
 * (one hour), and the proxy refreshes the session on every request anyway.
 */
const REUSE_WINDOW_MS = 30 * 60 * 1000;

function stillFresh(file: string): boolean {
  try {
    return Date.now() - fs.statSync(file).mtimeMs < REUSE_WINDOW_MS;
  } catch {
    return false;
  }
}

for (const key of KEYS) {
  setup(`sign in as ${DEMO_USERS[key].name}`, async ({ page }) => {
    const file = storageStatePath(key);

    if (stillFresh(file)) {
      setup.skip(true, "a saved sign-in from the last half hour is reused");
      return;
    }

    await signIn(page, key);

    fs.mkdirSync(path.dirname(file), { recursive: true });
    await page.context().storageState({ path: file });
  });
}
