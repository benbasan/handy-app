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
 */
const KEYS: DemoUserKey[] = ["customer", "customerB", "pro", "admin"];

for (const key of KEYS) {
  setup(`sign in as ${DEMO_USERS[key].name}`, async ({ page }) => {
    await signIn(page, key);

    const file = storageStatePath(key);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    await page.context().storageState({ path: file });
  });
}
