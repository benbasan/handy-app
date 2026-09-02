# CLAUDE.md — Handy Project Guide

This file is the single source of truth Claude Code reads at the start of every session in this repo. It exists so decisions get made **once** (here) instead of re-litigated in every conversation. Keep it accurate: whenever a real architectural decision is made in a session, update this file in the same session, before moving on.

Read alongside this file, in this order, at the start of any new phase of work:

1. `docs/product-spec.md` — what we're building and why (business rules, roles, flows)
2. `docs/architecture.md` — how it's built (stack, folder layout, data model)
3. `docs/roadmap.md` — what to build **right now** (current phase only — do not jump ahead)

---

## 1. What this project is

**Handy** — an on-demand, location-based marketplace connecting customers with verified local service professionals ("handymen": plumbers, electricians, etc.) in Israel. Customers post a job for free, get real price quotes from nearby verified pros within minutes, and pay the pro directly. Handy takes a 12% commission from the pro on closed jobs. Full spec: `docs/product-spec.md`.

Target market: Israel. UI language: Hebrew, RTL. Currency: ILS (₪).

## 2. Locked technology decisions

Do not introduce an alternative to any of these without discussing it with the user first and then updating this section.

| Layer | Choice | Notes |
|---|---|---|
| Framework | **Next.js** (App Router, TypeScript) | Single repo, server + client in one codebase |
| Backend/DB | **Supabase** (Postgres, Auth, Storage, Realtime, Edge Functions) | Managed — do not stand up a separate custom backend |
| Auth | Supabase Auth, **phone number + SMS OTP** (no passwords) | SMS provider: Twilio (configured inside Supabase Auth) |
| ORM/DB access | Supabase JS client + generated types (`supabase gen types typescript`) | Avoid adding Prisma/Drizzle on top — one data-access layer only |
| Supabase CLI | Installed as a **devDependency**, run via `npx supabase` | Version is locked in the repo and identical for everyone — not dependent on what happens to be installed globally |
| Styling | **Tailwind CSS v4** | v4 is CSS-first: there is **no `tailwind.config.ts`**. Design tokens from Claude Design go in the `@theme` block in `app/globals.css` |
| Maps / geocoding / distance | Google Maps Platform (Maps JS API, Geocoding, Places, Distance Matrix) | Needed for: address autocomplete, radius search, live "pro en route" tracking. **Two keys**: `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` (browser, referrer-restricted) and `GOOGLE_MAPS_SERVER_API_KEY` (server, IP-restricted — a referrer-restricted key cannot geocode). With no key the app falls back to manual address entry + a local gazetteer, opt-in via `ALLOW_NO_MAPS_KEY` |
| File/media uploads | Supabase Storage | Job photos/videos/voice notes, pro verification documents, profile photos |
| Realtime (bids arriving, chat, live location) | Supabase Realtime (Postgres changes + broadcast channels) | Do not add a separate WebSocket server |
| PDF generation (receipts) | `@react-pdf/renderer` or a Supabase Edge Function calling a PDF service | Decide inside the phase that needs it, record the decision here |
| Hosting | Vercel (frontend/Next.js) + Supabase Cloud (DB/backend) | |
| Package manager | npm (unless the user says otherwise) | |
| Validation | **Zod** | Every server-side write path. Schemas in `lib/validation`, one file per entity |
| Testing (DB) | **pgTAP** via `supabase test db` (`npm run db:test`) | RLS policies are tested in the database, where they run — not mocked in JS. Added in Phase 1 |
| Testing (app) | Vitest (unit, `npm run test`) + Playwright (critical E2E flows only, Phase 9) | Vitest arrived in Phase 2, the first phase with logic that needed it: the no-key geocoding fallback and the Zod schemas. Playwright still does not exist. Anything that depends on RLS is tested in pgTAP, not mocked in JS |
| Language | TypeScript everywhere, `strict: true` | No `any` without a comment explaining why |

**Mobile strategy:** web-only, fully responsive (mobile-web + desktop breakpoints), matching the two viewport variants already designed in Claude Design. No native app in this phase of the roadmap.

## 3. Non-negotiable architecture rules

- **One phase at a time.** Build exactly what the current phase in `docs/roadmap.md` asks for — no extra features, no future-proofing for a phase that hasn't started. If something in the current task clearly needs a piece from a later phase, stop and flag it instead of quietly building it.
- **Database is the contract.** Every entity in `docs/architecture.md`'s data model must exist as a real Postgres table with Row Level Security (RLS) policies before any UI is built against it. No mock data left behind after a phase is marked done.
- **RLS on everything.** Every table gets explicit RLS policies (customer sees own jobs, pro sees open jobs + own bids, admin sees all). Never disable RLS to "make it work" — fix the policy instead.
- **Server-side validation always.** Every write path (server action or route handler) validates input with Zod, even if the client also validates. Never trust client input for price, commission, or status transitions.
- **Money is server-authoritative.** Prices, the 12% commission calculation, and price-update deltas are computed and enforced server-side, never trusted from the client.
- **A status a user must not set themselves is a `security definer` function, never a column grant.** `pro_profiles.verification_status` has no UPDATE grant for any client role: a pro submits through `submit_pro_for_approval()` (which re-checks completeness) and an admin decides through `set_pro_verification()` (which checks `is_admin()`). A grant wide enough for the admin would also have let a pro verify themselves.
- **A job reaches a pro only inside BOTH radii** — `least(pro_profiles.radius_km, jobs.search_radius_km)` — and that is enforced in the RLS policy on `jobs`, not in the feed query, so it holds for anything that ever reads the table.
- **Price-change rule is enforced in the DB layer, not just the UI:** a job's price can only change through a `price_updates` record that carries a photo URL and moves through `pending → approved/rejected` — there is no direct `UPDATE jobs SET price = ...` path from client code.
- **RTL: logical properties only.** The UI is Hebrew and the app renders `dir="rtl"`. Always use Tailwind's logical utilities — `ms-`/`me-`, `ps-`/`pe-`, `start-`/`end-`, `text-start`/`text-end`, `border-s`/`border-e` — and **never** the physical `ml-`/`mr-`, `pl-`/`pr-`, `left-`/`right-`, `text-left`/`text-right`. A physical utility looks correct in a Latin-language preview and silently breaks the layout in Hebrew.
- **No secrets in code.** All API keys (Google Maps, Twilio, Supabase service role) go in environment variables, never committed. Maintain `.env.example` with every required key, kept in sync.
- **Small, reviewable commits.** See Git Workflow below — do not batch an entire phase into one commit.

## 4. Domain glossary (Hebrew UI term → English code identifier)

The product is Hebrew-facing, but all code (tables, variables, routes, types) is in English. Use this table so naming stays consistent across the whole codebase — do not invent parallel names for the same concept.

| Hebrew (UI) | English (code) | Notes |
|---|---|---|
| קריאה | `job` | The customer's service request |
| הצעת מחיר | `bid` | A pro's offer on a job |
| עדכון מחיר בשטח | `price_update` | Requires `photo_url`, requires customer approval |
| בעל מקצוע | `pro` | User with role `pro` |
| לקוח | `customer` | User with role `customer` |
| תחום | `category` | Service category (plumbing, electrical, ...) |
| אזור פעילות / רדיוס | `service_area` / `radius_km` | |
| מאומת | `verified` | Pro verification status |
| עמלה | `commission` | 12% of closed job value, charged to the pro |
| קבלה | `receipt` | Generated PDF at job completion |
| מחלוקת | `dispute` | Admin-mediated conflict on a job |
| פרופיל ציבורי | `public_profile` | Pro's customer-facing profile page |
| רדיוס חיפוש | `search_radius_km` | On a job: how far the customer wants it broadcast. Distinct from `radius_km`, which is the pro's own service radius |
| מתי נוח / מועד | `preferred_time` | Closed vocabulary: `asap` / `today` / `tomorrow` / `this_week` / `flexible`. Hebrew labels live in `lib/validation/jobs.ts` |
| מדיה של קריאה | `job-media` | Private Storage bucket, laid out as `<customer_id>/<upload_group>/<filename>` |
| מסמכי אימות | `verification-docs` | Private Storage bucket, laid out as `<pro_id>/<filename>`. No update and no delete policy — a document is replaced by uploading a new one |
| תחומי התמחות | `pro_categories` | Which trades a pro works in. A feed filter, not a security boundary |
| לא מתאים לי | `job_dismissals` | A pro hiding one job from their own feed. Visible to nobody else |
| ימי ושעות עבודה | `work_days` / `work_start_time` / `work_end_time` | `work_days` is 0 = Sunday … 6 = Saturday |
| שלב בהרשמה | `onboarding_step` | 0–5, highest step completed. `draft` → `pending` happens through `submit_pro_for_approval()` |
| חשבון לגביית עמלה | `payout_bank_name` / `payout_bank_branch` / `payout_account_last4` | Last four digits only — see section 9 |

Add new rows here whenever a new domain concept appears — do not let this glossary drift out of date.

## 5. Folder structure convention

```
/proxy.ts               → session refresh + anonymous gate (Next 16's name for middleware.ts)
/app                    → Next.js App Router routes
  /(customer)            → customer-facing routes — AT THE ROOT: /login, /account, /new-request
  /(pro)                 → pro-facing routes, prefixed. /pro is the PUBLIC
                            landing page and /pro/login the door; the signed-in
                            home is /pro/dashboard (see docs/architecture.md)
  /(admin)               → admin dashboard routes, prefixed: /admin/login, /admin
  /(marketing)            → public pages: the landing page at /, plus the SEO/content pages (Phase 8)
  /api                    → route handlers only where a server action doesn't fit (webhooks, etc.)
/components
  /ui                     → generic design-system components (buttons, inputs, cards)
  /customer, /pro, /admin → role-specific components
/lib
  /routes.ts              → role → home/login path maps (importable from proxy.ts)
  /supabase               → client factory, generated DB types, session DAL
  /validation              → Zod schemas, one file per entity
  /actions                 → server actions, grouped by entity
/supabase
  /migrations              → SQL migrations (source of truth for schema — see below)
  /tests                   → pgTAP tests (`npm run db:test`) — RLS policy assertions
  /seed.sql
/docs                      → this project's planning docs (this folder)
```

**Route groups add no path segment**, so each role's area carries an explicit
prefix — otherwise `(customer)/login` and `(pro)/login` both resolve to
`/login` and collide. Inside each group, a nested `(authed)` group holds the
`requireRole()` layout, and the login page sits *outside* it so the gate can't
lock people out of the door they came in through.

**Auth enforcement has three layers, and only the last one is security:**
`proxy.ts` bounces anonymous visitors (optimistic, no DB — Next runs proxy on
prefetches), `requireRole()` in each `(authed)` layout checks the role against
`profiles`, and **RLS in the database is what actually protects the data**. A
redirect is a courtesy. Never treat one as a control.

**RLS is column-aware only through grants.** RLS picks rows, never columns, so
every table's client grants are column-scoped (`grant update (full_name) on
profiles to authenticated`). This is what stops a customer setting their own
`role = 'admin'` or a pro setting their own `verification_status = 'verified'`
through a policy that legitimately allows them to update their own row. When
adding a column, decide explicitly whether a client may write it.

**Schema changes always go through a Supabase migration file** (`supabase/migrations/<timestamp>_<name>.sql`), never a manual change in the Supabase dashboard that isn't captured in a migration. This is what keeps the database reproducible and what lets Claude Code "remember" the schema across sessions instead of re-deriving it.

## 6. Git workflow

- **Branch per phase (or per meaningful sub-feature inside a large phase):** `phase-1-db-auth`, `phase-2-customer-job-flow`, etc. Never work directly on `main`.
- **Commit early and often within a branch** — one commit per logical unit of work (e.g., "add jobs table + RLS", "add job posting form", "add job posting server action + validation"), not one giant commit per phase.
- **Conventional Commits** format: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`. Example: `feat(jobs): add price_updates table with RLS policies`.
- **Open a PR from the phase branch into `main`** when the phase's Definition of Done (in `docs/roadmap.md`) is met. Merge only after the user has reviewed it (see `docs/working-with-claude-code.md` for the review workflow).
- **Never force-push `main`, never skip hooks, never rewrite history that's already pushed** unless explicitly asked.
- Update `docs/roadmap.md`'s checklist for the phase (tick off completed items) as part of the same PR — the roadmap file should always reflect real project status.

## 7. Definition of Done (applies to every phase, in addition to the phase-specific checklist in the roadmap)

- [ ] Migration files exist for any schema change, and `npm run db:reset` applies cleanly
- [ ] RLS policies exist for every new table, **and an assertion was added to `supabase/tests/rls_test.sql`** — `npm run db:test` passes (at least: can a customer see another customer's data? Can a pro see another pro's earnings? No.)
- [ ] `npm run db:types` re-run and the regenerated types committed, if the schema changed
- [ ] All new forms/inputs validate with Zod on the server, not just the client
- [ ] No hardcoded secrets; `.env.example` updated if new env vars were added
- [ ] Build passes (`npm run build`) and lint passes (`npm run lint`)
- [ ] Manually walked through the user flow the phase covers, in the browser, RTL rendering checked
- [ ] `docs/roadmap.md` checklist updated
- [ ] Commits follow the convention in section 6

## 8. What Claude Code should ask about vs. decide alone

**Decide alone (already decided in this file — just follow it):** framework, DB, auth method, hosting, folder structure, naming conventions.

**Ask the user before deciding:** anything involving real money movement (payment provider integration details beyond what's specified), legal/compliance text (terms, privacy policy content), pricing of the platform itself, and any deviation from the locked stack in section 2.

## 9. Open decisions (fill in as they're made)

- [ ] PDF library for receipts (decide in the payments/receipts phase)
- [ ] Exact Twilio account setup / SMS sender ID for Israel
- [ ] A real Google Maps Platform key. Everything that needs one — Places Autocomplete, the map on the published-job screen, server-side geocoding — is built behind a key check and degrades to manual address entry, so this blocks verification against Google, not development
- [ ] Push notification approach for "pro is arriving" (browser push vs. none for MVP)
- [ ] **How a pro's full bank account number is stored**, if it is stored at all. Phase 3 collects bank, branch and the last four digits only (`payout_account_last4`) — enough for the pro to recognise the account on screen. Collecting the rest is real money movement, which section 8 says to decide with the user, in the payments phase
- [ ] A public bucket for pro profile photos. Phase 3 files the profile photo in the private `verification-docs` bucket as `doc_type = 'profile_photo'`; the customer-facing public profile (Phase 8) is what will need a photo customers can actually load

*(Keep this list current — remove items once decided and folded into section 2, add new ones as they come up.)*

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
