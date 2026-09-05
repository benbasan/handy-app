import { describe, expect, it } from "vitest";
import { DEMO_OTP, DEMO_USER_KEYS, DEMO_USERS } from "@/lib/demo";
import { normalizeIsraeliMobile } from "@/lib/validation/auth";
import { DEMO_USERS as E2E_DEMO_USERS } from "@/e2e/demo-users";
import { read } from "./repo";

/**
 * The demo panel's roster, pinned against the things that actually decide
 * whether it works.
 *
 * `lib/demo.ts` is a fifth copy of a list that already exists in
 * `supabase/config.toml`, `supabase/seed.sql`, `README.md` and
 * `e2e/demo-users.ts`. Nothing enforces agreement between them, and every
 * claim the panel makes on screen — this number signs in, this one is an
 * admin, this one is still awaiting verification — is a claim about a file
 * somewhere else. A button that quietly stops working is a bad demo; a button
 * labelled "ממתין לאימות" that is actually verified is a wrong one.
 *
 * These read the SQL and the TOML as text, the way everything in `tests/`
 * does. They cannot prove GoTrue accepts the code — that needs the stack — but
 * they can prove the app is asking for the number the stack was told about.
 */

/** `[auth.sms.test_otp]` → the fixed code each seeded number answers to. */
function testOtpMap(): Map<string, string> {
  const toml = read("supabase/config.toml");

  // Anchored to the start of a line. The section name also appears inside the
  // prose comment directly above it — "maps the demo phone numbers to fixed
  // OTP codes under [auth.sms.test_otp]" — and an unanchored search lands
  // there, then cuts the block at the real header and reads nothing at all.
  const header = /^\[auth\.sms\.test_otp\][^\n]*\n/m.exec(toml);
  expect(
    header,
    "[auth.sms.test_otp] is missing from config.toml",
  ).not.toBeNull();

  const found = header as RegExpExecArray;
  const rest = toml.slice(found.index + found[0].length);

  // To the next section header, also anchored.
  const end = rest.search(/^\[/m);
  const block = end === -1 ? rest : rest.slice(0, end);

  const map = new Map<string, string>();
  for (const line of block.split("\n")) {
    const match = /^(\d{6,15})\s*=\s*"(\d+)"/.exec(line.trim());
    if (match) map.set(match[1], match[2]);
  }
  return map;
}

/** The demo users' `values` tuples in seed.sql: uuid → phone, role, name. */
function seededUsers(): Map<
  string,
  { phone: string; signupRole: string; name: string }
> {
  const sql = read("supabase/seed.sql");
  const rows = new Map<
    string,
    { phone: string; signupRole: string; name: string }
  >();

  const pattern =
    /\('([0-9a-f-]{36})'::uuid,\s*'(\d{12})',\s*'(customer|pro)',\s*'([^']+)'\)/g;

  for (const match of sql.matchAll(pattern)) {
    rows.set(match[1], {
      phone: match[2],
      signupRole: match[3],
      name: match[4],
    });
  }
  return rows;
}

const otp = testOtpMap();
const seeded = seededUsers();

/** E.164 without the `+`, which is how auth.users and config.toml spell it. */
function bareE164(phone: string): string {
  const canonical = normalizeIsraeliMobile(phone);
  expect(canonical, `${phone} is not a valid Israeli mobile`).not.toBeNull();
  return (canonical as string).replace(/^\+/, "");
}

describe("the parsers found something to check", () => {
  // Guarding the guard: a regex that matches nothing would let every
  // assertion below pass by describing an empty set.
  it("reads all seven test_otp numbers", () => {
    expect(otp.size).toBe(7);
  });

  it("reads the five first-batch seeded users", () => {
    expect(seeded.size).toBeGreaterThanOrEqual(5);
  });

  it("has four demo users, with unique keys", () => {
    expect(DEMO_USER_KEYS).toHaveLength(4);
    expect(new Set(DEMO_USER_KEYS).size).toBe(4);
    expect(Object.keys(DEMO_USERS).sort()).toEqual([...DEMO_USER_KEYS].sort());
  });
});

describe.each(DEMO_USER_KEYS)("%s", (key) => {
  const demo = DEMO_USERS[key];

  it("is a number the auth stack was told to accept, with our code", () => {
    const bare = bareE164(demo.phone);
    expect(
      otp.get(bare),
      `${demo.phone} is not in [auth.sms.test_otp] — the button would ask for a code nothing issues`,
    ).toBe(DEMO_OTP);
  });

  it("carries the name the database actually holds", () => {
    const bare = bareE164(demo.phone);
    const row = [...seeded.values()].find((user) => user.phone === bare);

    expect(
      row,
      `${demo.phone} is not seeded in supabase/seed.sql`,
    ).toBeDefined();
    // Not "close enough": the Hebrew on the button is the Hebrew in profiles.
    expect(row?.name).toBe(demo.name);
  });
});

describe("the claims the panel makes on screen", () => {
  const sql = read("supabase/seed.sql");

  /** The uuid seeded with a given phone. */
  function uuidFor(key: (typeof DEMO_USER_KEYS)[number]): string {
    const bare = bareE164(DEMO_USERS[key].phone);
    const entry = [...seeded.entries()].find(([, row]) => row.phone === bare);
    expect(entry, `no seeded uuid for ${key}`).toBeDefined();
    return (entry as [string, unknown])[0];
  }

  /**
   * The user_ids of every `update public.pro_profiles … verification_status =
   * 'verified' …` statement.
   *
   * Statement by statement rather than one regex across the whole file: a
   * window wide enough to reach from a `set` to its own `where` is also wide
   * enough to reach the next statement's, which reports every pro as verified
   * and makes the assertion below vacuous.
   */
  function verifiedProIds(): Set<string> {
    const ids = new Set<string>();
    for (const statement of sql.split(";")) {
      if (!/update\s+public\.pro_profiles/i.test(statement)) continue;
      if (!/verification_status\s*=\s*'verified'/i.test(statement)) continue;
      const where = /where\s+user_id\s*=\s*'([0-9a-f-]{36})'/i.exec(statement);
      if (where) ids.add(where[1]);
    }
    return ids;
  }

  it("the admin is an admin because of an UPDATE, not because of its row", () => {
    // The subtle one, and the reason it gets its own test. The seed tuple for
    // this user says 'customer' — `handle_new_user` whitelists a requested
    // role down to customer/pro, so admin is not assignable at sign-up. The
    // `role: "admin"` in lib/demo.ts is justified by a statement twenty lines
    // further down the file, and nothing but this assertion connects them.
    const uuid = uuidFor("admin");

    expect(seeded.get(uuid)?.signupRole).toBe("customer");
    expect(DEMO_USERS.admin.role).toBe("admin");

    const promotion = new RegExp(
      String.raw`update\s+public\.profiles\s+set\s+role\s*=\s*'admin'\s+where\s+id\s*=\s*'${uuid}'`,
      "i",
    );
    expect(
      promotion.test(sql),
      "seed.sql no longer promotes this user to admin — the admin button would sign in as a customer",
    ).toBe(true);
  });

  it("the verified pro is verified and the pending one is not", () => {
    // The panel tells whoever is watching that one of these is still waiting
    // for approval, and that it is what makes the feed gate visible. That is a
    // claim about seed.sql, so it is checked against seed.sql.
    const verified = verifiedProIds();

    expect(
      verified.size,
      "no verified pros parsed out of the seed",
    ).toBeGreaterThan(0);
    expect(verified.has(uuidFor("proVerified"))).toBe(true);
    expect(
      verified.has(uuidFor("proPending")),
      "this user is now verified in the seed, so the button's 'ממתין לאימות' is a lie",
    ).toBe(false);
  });

  it("every role is somewhere the app can actually route to", () => {
    for (const key of DEMO_USER_KEYS) {
      expect(["customer", "pro", "admin"]).toContain(DEMO_USERS[key].role);
    }
  });
});

describe("the two rosters in this repo agree", () => {
  // e2e/demo-users.ts is not refactored to import from lib/demo.ts: nothing
  // under e2e/ uses the `@/` alias and playwright.config.ts configures none, so
  // the refactor's blast radius is a Playwright run that cannot be executed
  // here. An equality assertion buys the same guarantee at no risk.
  it.each([
    ["customer", "customer"],
    ["proVerified", "pro"],
    ["admin", "admin"],
  ] as const)("%s matches e2e's %s", (libKey, e2eKey) => {
    expect(DEMO_USERS[libKey].phone).toBe(E2E_DEMO_USERS[e2eKey].phone);
    expect(DEMO_USERS[libKey].name).toBe(E2E_DEMO_USERS[e2eKey].name);
  });
});
