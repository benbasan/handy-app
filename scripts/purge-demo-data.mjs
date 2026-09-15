#!/usr/bin/env node
/**
 * Clear the demo out of a deployment before real people see it (Phase 19).
 *
 * The hosted project was seeded from supabase/seed.sql and then used for demos,
 * so its public pages showed "156 עבודות שנסגרו" beside "עדיין ללא ביקורות",
 * a cost guide computed from three jobs, and a customer's street printed as a
 * city. Marketing to real customers starts from an empty marketplace instead,
 * and the pages were given launch-day states for exactly that (step 5).
 *
 *   npm run demo:purge                                   # show what would go
 *   npm run demo:purge -- --promote 0521234567            # …and who becomes admin
 *   npm run demo:purge -- --promote 0521234567 --yes      # actually do it
 *
 * What goes: the seven seeded accounts (`a0000000-0000-4000-8000-…`) and, with
 * `--include-bypass`, every account the OTP bypass created. Deleting from
 * `auth.users` is enough — `profiles` cascades from it, and jobs, bids, fees,
 * reviews, messages and notifications cascade from there. `categories` stays.
 *
 * What it refuses: to leave the deployment without an admin. The seeded admin
 * is one of the accounts that goes (its number answers to a public test code),
 * so `--promote` names an account that already exists — sign in once with your
 * own number first — and it becomes the admin in the same transaction. Without
 * one, `--yes` stops before touching anything.
 *
 * Storage: the rows for files under a deleted account's folder are removed with
 * `storage.allow_delete_query`, which Supabase guards because the bytes stay
 * behind as orphans. For the seed's placeholder images that is acceptable;
 * empty the buckets from the dashboard afterwards if you want the space back.
 *
 * Like scripts/purge-bypass-users.mjs, a script and not a migration: removing
 * accounts is an operational act, done once, against one deployment. Talks to
 * the local stack through `docker exec`; set DATABASE_URL for the hosted one.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
const APPLY = args.includes("--yes");
const INCLUDE_BYPASS = args.includes("--include-bypass");
const promoteAt = args.indexOf("--promote");
const PROMOTE_RAW = promoteAt === -1 ? null : (args[promoteAt + 1] ?? "");
const DATABASE_URL = process.env.DATABASE_URL ?? null;

/** 05X-XXXXXXX → 9725XXXXXXXX, the shape auth.users.phone stores. */
function toE164Digits(raw) {
  const digits = raw.replace(/\D/g, "");
  if (/^05\d{8}$/.test(digits)) return `972${digits.slice(1)}`;
  if (/^9725\d{8}$/.test(digits)) return digits;
  return null;
}

const PROMOTE = PROMOTE_RAW === null ? null : toE164Digits(PROMOTE_RAW);
if (PROMOTE_RAW !== null && !PROMOTE) {
  console.error(
    `--promote needs an Israeli mobile number, got "${PROMOTE_RAW}".`,
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

/** The seven accounts supabase/seed.sql creates, and nothing else. */
const SEEDED = `u.id::text like 'a0000000-0000-4000-8000-%'`;
const BYPASS = `u.raw_user_meta_data ->> 'created_via' = 'otp_bypass'`;
const DOOMED = INCLUDE_BYPASS ? `(${SEEDED} or ${BYPASS})` : SEEDED;
/* The account being promoted is never deleted, even if the bypass made it. */
const SPARED = PROMOTE ? `and coalesce(u.phone, '') <> '${PROMOTE}'` : "";

const COUNTS = `
  select 'accounts (all)',        count(*) from auth.users
  union all select '  of which admin', count(*) from public.profiles where role = 'admin'
  union all select '  of which pro',   count(*) from public.profiles where role = 'pro'
  union all select 'jobs',             count(*) from public.jobs
  union all select 'bids',             count(*) from public.bids
  union all select 'job_fees',         count(*) from public.job_fees
  union all select 'reviews',          count(*) from public.reviews
  union all select 'messages',         count(*) from public.messages
  union all select 'storage objects',  count(*) from storage.objects;
`;

function printCounts(title) {
  console.log(title);
  for (const line of psql(COUNTS).split("\n").filter(Boolean)) {
    const [label, count] = line.split("|");
    console.log(`  ${label.padEnd(20)} ${count}`);
  }
}

function main() {
  console.log(`Demo cleanup — ${DATABASE_URL ? "DATABASE_URL" : CONTAINER}\n`);

  // Ids, roles and dates only: a phone number identifies a person.
  const doomed = psql(
    `select u.id || '  ' || coalesce(p.role::text, '—') || '  ' ||
            case when ${SEEDED} then 'seed' else 'bypass' end
       from auth.users u left join public.profiles p on p.id = u.id
      where ${DOOMED} ${SPARED}
      order by 1;`,
  )
    .split("\n")
    .filter(Boolean);

  console.log(`${doomed.length} account(s) to delete:`);
  for (const row of doomed) console.log(`  ${row}`);
  console.log(
    INCLUDE_BYPASS
      ? ""
      : "\n(Accounts the OTP bypass created are kept. Add --include-bypass to delete them too.)\n",
  );

  let promoteId = null;
  if (PROMOTE) {
    promoteId =
      psql(`select id from auth.users where phone = '${PROMOTE}';`).trim() ||
      null;
    console.log(
      promoteId
        ? `Will make ${promoteId} the admin.\n`
        : `No account has that number yet. Sign in once with it on the site, then re-run.\n`,
    );
  }

  printCounts("Now:");

  const adminsLeft = Number(
    psql(
      `select count(*) from public.profiles p join auth.users u on u.id = p.id
        where p.role = 'admin' and not (${DOOMED} ${SPARED});`,
    ).trim(),
  );

  if (!APPLY) {
    console.log("\nDry run. Nothing was changed. Re-run with --yes to apply.");
    if (adminsLeft === 0 && !promoteId) {
      console.log(
        "Note: --yes will refuse — no admin would remain. Pass --promote <your number>.",
      );
    }
    return;
  }

  if (adminsLeft === 0 && !promoteId) {
    console.error(
      "\nRefusing: this would leave no admin, and nobody could approve a pro.\n" +
        "Sign in once with your own number, then pass --promote <that number>.",
    );
    process.exit(1);
  }

  psql(`
    begin;
    ${promoteId ? `update public.profiles set role = 'admin' where id = '${promoteId}';` : ""}

    create temp table doomed on commit drop as
      select u.id from auth.users u where ${DOOMED} ${SPARED};

    set local storage.allow_delete_query = 'true';
    delete from storage.objects o
     using doomed d
     where split_part(o.name, '/', 1) = d.id::text;

    -- A notification a deleted account caused, addressed to somebody who
    -- stays. The foreign key would set actor_id to null, and
    -- notifications_guard_update() rightly refuses any update but read_at —
    -- so the row goes, rather than the guard being switched off.
    delete from public.notifications n using doomed d where n.actor_id = d.id;

    delete from auth.users u using doomed d where u.id = d.id;
    commit;
  `);

  printCounts("\nAfter:");
}

main();
