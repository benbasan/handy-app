#!/usr/bin/env node
/**
 * Remove the accounts the OTP bypass created — see lib/auth/bypass.ts.
 *
 * While `AUTH_BYPASS_OTP=1` anybody can sign in as any phone number, and every
 * account made that way carries a password this repo shares. That is tolerable
 * for a demo and intolerable afterwards, so retiring the bypass has two steps
 * and not one: clear the flag, then run this. It exists now rather than later
 * because the accounts are only identifiable through the `created_via` tag the
 * sign-in writes at creation — leave it until afterwards and there is nothing
 * left to select on.
 *
 *   npm run auth:purge-bypass            # show what would go
 *   npm run auth:purge-bypass -- --yes   # actually delete
 *
 * Deleting from `auth.users` is enough: `profiles` cascades from it, and
 * `pro_profiles`, `jobs`, `bids` and the rest cascade from there.
 *
 * A script rather than a migration, deliberately. A migration describes the
 * shape of the database and runs on every environment forever; removing
 * somebody's account is an operational act, done once, against one deployment,
 * by a person who has decided to do it.
 *
 * Talks to the local stack through `docker exec`, like
 * scripts/postgis-load-check.mjs. Set DATABASE_URL to point the same psql at
 * the hosted project instead.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

/** The tag lib/auth/bypass.ts writes into raw_user_meta_data at sign-up. */
const CREATED_VIA = "otp_bypass";

const APPLY = process.argv.includes("--yes");
const DATABASE_URL = process.env.DATABASE_URL ?? null;

/*
 * The flag and the purge are mutually exclusive by design. Running this while
 * people can still sign up deletes a tester's account out from under them and
 * leaves the next one to be created a second later — the cleanup has to follow
 * the switch being turned off, so this refuses to go first.
 */
if (process.env.AUTH_BYPASS_OTP === "1") {
  console.error(
    "AUTH_BYPASS_OTP=1 — the bypass is still on.\n" +
      "Clear it (and redeploy, if this is the hosted project) before purging,\n" +
      "or the accounts you delete will start coming back while this runs.",
  );
  process.exit(1);
}

function projectId() {
  const config = readFileSync("supabase/config.toml", "utf8");
  const match = /^project_id\s*=\s*"([^"]+)"/m.exec(config);
  if (!match) throw new Error("no project_id in supabase/config.toml");
  return match[1];
}

const CONTAINER = `supabase_db_${projectId()}`;

function psql(sql) {
  const target = DATABASE_URL
    ? ["-d", DATABASE_URL]
    : ["-U", "postgres", "-d", "postgres"];

  return execFileSync(
    "docker",
    [
      "exec",
      "-i",
      CONTAINER,
      "psql",
      ...target,
      "-v",
      "ON_ERROR_STOP=1",
      "-X",
      "-q",
      "-At",
      "-f",
      "-",
    ],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
  );
}

const WHERE = `raw_user_meta_data ->> 'created_via' = '${CREATED_VIA}'`;

function main() {
  console.log(
    `OTP bypass cleanup — ${DATABASE_URL ? "DATABASE_URL" : CONTAINER}\n`,
  );

  /*
   * Ids and dates only. A phone number identifies a person and this is the one
   * table full of them; the id is enough to find a row, which is the same rule
   * lib/observability.ts follows for logs.
   */
  const rows = psql(
    `select id || '  ' || created_at from auth.users where ${WHERE} order by created_at;`,
  )
    .split("\n")
    .filter(Boolean);

  if (rows.length === 0) {
    console.log("No accounts carry the bypass tag. Nothing to do.");
    return;
  }

  console.log(
    `${rows.length} account${rows.length === 1 ? "" : "s"} created by the bypass:\n`,
  );
  for (const row of rows) console.log(`  ${row}`);

  if (!APPLY) {
    console.log("\nDry run. Re-run with --yes to delete these and everything");
    console.log("that cascades from them (profiles, jobs, bids, messages).");
    return;
  }

  const deleted = psql(
    `with gone as (delete from auth.users where ${WHERE} returning 1)
     select count(*) from gone;`,
  ).trim();

  console.log(
    `\nDeleted ${deleted}. The seeded users in supabase/seed.sql are untouched:`,
  );
  console.log("they were never tagged, because the bypass cannot create them.");
}

main();
