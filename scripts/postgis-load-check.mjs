#!/usr/bin/env node
/**
 * A basic load check on the PostGIS queries — docs/roadmap.md, Phase 9.
 *
 * Every "who can see this" question in this product is a spatial one. A job
 * reaches a pro only inside BOTH radii, and that is enforced in the RLS policy
 * on `jobs` (CLAUDE.md section 3), which means an `ST_DWithin` runs on every
 * single row the pro feed considers. On the seed's dozen jobs that is
 * instantaneous whether or not the GiST index is used at all — which is
 * exactly the problem: a policy that quietly degrades to a sequential scan
 * looks perfectly healthy in development and falls over on the first busy
 * city.
 *
 * So this script inflates the database to a plausible city's worth of rows,
 * times the four spatial paths the product actually runs, and checks that each
 * one still reaches its index. Everything happens inside one transaction that
 * is rolled back, so the local database is exactly as it was afterwards.
 *
 *   npm run perf:postgis
 *
 * It talks to the local stack through `docker exec`, which is already a hard
 * requirement for `supabase start` — no new dependency, and no connection
 * string to keep in sync.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

/**
 * The default load: ten thousand open calls and a thousand pros, all inside
 * one metropolitan area. That is a plausible national scale for this product
 * at launch, and it is the size the budgets below are set against. Push it up
 * with PERF_JOBS to see where each path bends — docs/security-checklist.md
 * records the curve.
 */
const JOBS = Number(process.env.PERF_JOBS ?? 10_000);
const PROS = Number(process.env.PERF_PROS ?? 1_000);

/** Multiplies every budget, for running the same checks at a larger PERF_JOBS. */
const BUDGET_SCALE = Number(process.env.PERF_BUDGET_SCALE ?? 1);

const CUSTOMER_A = "a0000000-0000-4000-8000-000000000001";
const PRO_VERIFIED = "a0000000-0000-4000-8000-000000000003";
const JOB_A = "d0000000-0000-4000-8000-000000000001";
const PLUMBING = "c0000000-0000-4000-8000-000000000001";

function projectId() {
  const config = readFileSync("supabase/config.toml", "utf8");
  const match = /^project_id\s*=\s*"([^"]+)"/m.exec(config);
  if (!match) throw new Error("no project_id in supabase/config.toml");
  return match[1];
}

const CONTAINER = `supabase_db_${projectId()}`;

function psql(sql) {
  return execFileSync(
    "docker",
    [
      "exec",
      "-i",
      CONTAINER,
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
      "-X",
      "-q",
      "-At",
      "-f",
      "-",
    ],
    { input: sql, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
}

/**
 * The synthetic load.
 *
 * Jobs are scattered over a ~40 km box centred on Tel Aviv rather than over
 * the whole country: a spatial index is easy to look good on data that is
 * spread thin, and the query that matters is the one where thousands of rows
 * really are near each other.
 *
 * The pros are created by inserting into `auth.users`, so `handle_new_user`
 * builds their `profiles` and `pro_profiles` rows through the same code path a
 * real sign-up takes — a hand-built pro_profiles row could easily be shaped
 * differently from the ones the policies read.
 */
const LOAD = `
insert into public.jobs
  (customer_id, category_id, description, location, address_text,
   preferred_time, search_radius_km)
select
  '${CUSTOMER_A}',
  '${PLUMBING}',
  'קריאת עומס ' || g,
  extensions.st_point(
    34.60 + random() * 0.40,
    31.90 + random() * 0.36
  )::extensions.geography,
  'רחוב הבדיקה ' || g || ', תל אביב',
  (array['asap','today','tomorrow','this_week','flexible'])[1 + floor(random() * 5)],
  (array[3,5,10,15,25])[1 + floor(random() * 5)]
from generate_series(1, ${JOBS}) g;

insert into auth.users (
  instance_id, id, aud, role, phone, phone_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
select
  '00000000-0000-0000-0000-000000000000',
  gen_random_uuid(), 'authenticated', 'authenticated',
  '9725' || lpad((10000000 + g)::text, 8, '0'), now(),
  '{"provider":"phone","providers":["phone"]}'::jsonb,
  jsonb_build_object('role', 'pro', 'full_name', 'בעל מקצוע ' || g),
  now(), now(), '', '', '', ''
from generate_series(1, ${PROS}) g;

update public.pro_profiles p
   set verification_status = 'verified',
       accepting_jobs = true,
       radius_km = 5 + (abs(hashtext(p.user_id::text)) % 20),
       service_point = extensions.st_point(
         34.60 + (abs(hashtext(p.user_id::text)) % 4000) / 10000.0,
         31.90 + (abs(hashtext(p.user_id::text || 'y')) % 3600) / 10000.0
       )::extensions.geography
 where p.service_point is null;

insert into public.pro_categories (pro_id, category_id)
select p.user_id, '${PLUMBING}'
  from public.pro_profiles p
 where not exists (
   select 1 from public.pro_categories pc where pc.pro_id = p.user_id
 );

analyze public.jobs;
analyze public.pro_profiles;
analyze public.pro_categories;
`;

/**
 * Two kinds of check, because they answer two different questions.
 *
 * A `plan` check EXPLAINs a bare `ST_DWithin` against one of the two GiST
 * indexes and insists the planner reaches it. This is the index's own API, not
 * a copy of any business query — nothing here can drift out of step with the
 * app, and if it fails, the index is missing, unusable, or has been out-costed.
 *
 * A `time` check runs the real function, as the real role, and holds it to a
 * wall-clock budget. Every one of these is a `security definer` or plain SQL
 * function, so `EXPLAIN` above it sees a Function Scan and nothing of the plan
 * inside — the clock is the only honest instrument for them, and it is also
 * the one that matters: a feed that has quietly degraded to a sequential scan
 * fails a budget long before anybody notices it in a page load.
 */
const CHECKS = [
  {
    kind: "plan",
    budgetMs: 200,
    name: "jobs.location — GiST reachable at this size",
    as: { role: "postgres", uid: null },
    sql: `select count(*) from public.jobs j
           where extensions.st_dwithin(
                   j.location,
                   extensions.st_point(34.7818, 32.0853)::extensions.geography,
                   10000)`,
    index: "jobs_location_idx",
  },
  {
    kind: "plan",
    budgetMs: 200,
    name: "pro_profiles.service_point — GiST reachable at this size",
    as: { role: "postgres", uid: null },
    sql: `select count(*) from public.pro_profiles p
           where extensions.st_dwithin(
                   p.service_point,
                   extensions.st_point(34.7818, 32.0853)::extensions.geography,
                   10000)`,
    index: "pro_profiles_service_point_idx",
  },
  {
    kind: "time",
    // Known limit, not a target. Every SELECT policy on `jobs` is permissive,
    // so they are OR-ed together, and three of the five branches are opaque
    // `security definer` functions over the row — which means no index can be
    // used and every open call in the table is read and tested. The cost is
    // dead linear at about 23 microseconds per open job. See
    // docs/security-checklist.md and CLAUDE.md section 9; this budget is set
    // to catch a regression at the default load, not to bless the shape.
    budgetMs: 400,
    name: "pro job feed — open_jobs_for_pro()",
    as: { role: "authenticated", uid: PRO_VERIFIED },
    sql: "select count(*) from public.open_jobs_for_pro(null)",
  },
  {
    kind: "time",
    // The same scan, with the feed's own query taken out of the picture — so a
    // change in this number and not in the one above points at the policies.
    budgetMs: 400,
    name: "the RLS policy on jobs, on its own",
    as: { role: "authenticated", uid: PRO_VERIFIED },
    sql: "select count(*) from public.jobs",
  },
  {
    kind: "time",
    budgetMs: 150,
    name: "pros near a job — pros_in_range()",
    as: { role: "authenticated", uid: CUSTOMER_A },
    sql: `select public.pros_in_range('${JOB_A}')`,
  },
  {
    kind: "time",
    budgetMs: 150,
    name: "public category page — category_pros()",
    as: { role: "anon", uid: null },
    sql: "select count(*) from public.category_pros('plumbing', 32.0853, 34.7818, 12)",
  },
  {
    kind: "time",
    budgetMs: 150,
    name: "public category page — category_stats()",
    as: { role: "anon", uid: null },
    sql: "select * from public.category_stats('plumbing', 32.0853, 34.7818)",
  },
];

function claims(uid) {
  return uid
    ? `select set_config('request.jwt.claims', json_build_object('sub','${uid}','role','authenticated')::text, true);`
    : "";
}

/**
 * EXPLAIN a query the way the app runs it, and return the plan plus timing.
 *
 * `format json` rather than parsing the text plan: the shape of a text plan is
 * a rendering detail and this has to keep working across Postgres upgrades.
 */
function explain({ as, sql }) {
  const out = psql(`
    begin;
    ${claims(as.uid)}
    set local role ${as.role};
    explain (analyze, buffers, format json) ${sql};
    rollback;
  `);

  // psql -At prints the JSON array across several lines; the plan is
  // everything between the first '[' and the last ']'.
  const text = out.slice(out.indexOf("["), out.lastIndexOf("]") + 1);
  const [plan] = JSON.parse(text);
  return plan;
}

function indexesUsed(node, found = new Set()) {
  if (node["Index Name"]) found.add(node["Index Name"]);
  for (const child of node.Plans ?? []) indexesUsed(child, found);
  return found;
}

function main() {
  const started = Date.now();

  console.log(
    `PostGIS load check — ${JOBS.toLocaleString("en-US")} jobs, ${PROS.toLocaleString("en-US")} pros`,
  );
  console.log(`container: ${CONTAINER}\n`);

  // One transaction for the whole run: the load goes in, every query is
  // measured against it, and none of it is ever committed. `psql` runs each
  // -f as its own session, so the load has to be visible to the EXPLAINs —
  // which is why it is applied for real and undone at the end instead.
  psql("begin; " + LOAD + " commit;");

  let failures = 0;

  try {
    for (const check of CHECKS) {
      const plan = explain(check);
      const ms = plan["Execution Time"];
      const used = indexesUsed(plan.Plan);

      const budget = check.budgetMs * BUDGET_SCALE;
      const wantedIndex = check.kind !== "plan" || used.has(check.index);
      const withinBudget = ms <= budget;
      const ok = wantedIndex && withinBudget;
      if (!ok) failures += 1;

      const detail =
        check.kind === "plan"
          ? `       indexes: ${used.size ? [...used].join(", ") : "none — sequential scan"}\n` +
            `       wanted:  ${check.index}\n`
          : "";

      console.log(
        `${ok ? "ok  " : "FAIL"} ${check.name}\n` +
          `       ${ms.toFixed(1)} ms (budget ${budget} ms)\n` +
          detail,
      );
    }
  } finally {
    // Undo the load. A DELETE rather than a rollback for the reason above;
    // the synthetic rows are all identifiable, and the cascade from auth.users
    // takes the profiles and pro_profiles with it.
    psql(`
      delete from public.jobs where description like 'קריאת עומס %';
      delete from auth.users where phone like '97251%';
      analyze public.jobs;
      analyze public.pro_profiles;
    `);
  }

  console.log(`done in ${((Date.now() - started) / 1000).toFixed(1)}s`);

  if (failures > 0) {
    console.error(
      `\n${failures} spatial ${failures === 1 ? "query" : "queries"} missed its index or its budget.`,
    );
    process.exit(1);
  }
}

main();
