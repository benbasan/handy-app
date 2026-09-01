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
| Styling | Tailwind CSS | Matches the exported design tokens from Claude Design |
| Maps / geocoding / distance | Google Maps Platform (Maps JS API, Geocoding, Places, Distance Matrix) | Needed for: address autocomplete, radius search, live "pro en route" tracking |
| File/media uploads | Supabase Storage | Job photos/videos/voice notes, pro verification documents, profile photos |
| Realtime (bids arriving, chat, live location) | Supabase Realtime (Postgres changes + broadcast channels) | Do not add a separate WebSocket server |
| PDF generation (receipts) | `@react-pdf/renderer` or a Supabase Edge Function calling a PDF service | Decide inside the phase that needs it, record the decision here |
| Hosting | Vercel (frontend/Next.js) + Supabase Cloud (DB/backend) | |
| Package manager | npm (unless the user says otherwise) | |
| Testing | Vitest (unit) + Playwright (critical E2E flows only, added from Phase 4 onward) | |
| Language | TypeScript everywhere, `strict: true` | No `any` without a comment explaining why |

**Mobile strategy:** web-only, fully responsive (mobile-web + desktop breakpoints), matching the two viewport variants already designed in Claude Design. No native app in this phase of the roadmap.

## 3. Non-negotiable architecture rules

- **One phase at a time.** Build exactly what the current phase in `docs/roadmap.md` asks for — no extra features, no future-proofing for a phase that hasn't started. If something in the current task clearly needs a piece from a later phase, stop and flag it instead of quietly building it.
- **Database is the contract.** Every entity in `docs/architecture.md`'s data model must exist as a real Postgres table with Row Level Security (RLS) policies before any UI is built against it. No mock data left behind after a phase is marked done.
- **RLS on everything.** Every table gets explicit RLS policies (customer sees own jobs, pro sees open jobs + own bids, admin sees all). Never disable RLS to "make it work" — fix the policy instead.
- **Server-side validation always.** Every write path (server action or route handler) validates input with Zod, even if the client also validates. Never trust client input for price, commission, or status transitions.
- **Money is server-authoritative.** Prices, the 12% commission calculation, and price-update deltas are computed and enforced server-side, never trusted from the client.
- **Price-change rule is enforced in the DB layer, not just the UI:** a job's price can only change through a `price_updates` record that carries a photo URL and moves through `pending → approved/rejected` — there is no direct `UPDATE jobs SET price = ...` path from client code.
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

Add new rows here whenever a new domain concept appears — do not let this glossary drift out of date.

## 5. Folder structure convention

```
/app                    → Next.js App Router routes
  /(customer)            → customer-facing routes (job posting, tracking, account)
  /(pro)                 → pro-facing routes (job feed, bidding, earnings, profile)
  /(admin)               → admin dashboard routes
  /(marketing)            → public marketing/SEO pages (category pages, guides, about)
  /api                    → route handlers only where a server action doesn't fit (webhooks, etc.)
/components
  /ui                     → generic design-system components (buttons, inputs, cards)
  /customer, /pro, /admin → role-specific components
/lib
  /supabase               → client factory, generated DB types
  /validation              → Zod schemas, one file per entity
  /actions                 → server actions, grouped by entity
/supabase
  /migrations              → SQL migrations (source of truth for schema — see below)
  /seed.sql
/docs                      → this project's planning docs (this folder)
```

**Schema changes always go through a Supabase migration file** (`supabase/migrations/<timestamp>_<name>.sql`), never a manual change in the Supabase dashboard that isn't captured in a migration. This is what keeps the database reproducible and what lets Claude Code "remember" the schema across sessions instead of re-deriving it.

## 6. Git workflow

- **Branch per phase (or per meaningful sub-feature inside a large phase):** `phase-1-db-auth`, `phase-2-customer-job-flow`, etc. Never work directly on `main`.
- **Commit early and often within a branch** — one commit per logical unit of work (e.g., "add jobs table + RLS", "add job posting form", "add job posting server action + validation"), not one giant commit per phase.
- **Conventional Commits** format: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`. Example: `feat(jobs): add price_updates table with RLS policies`.
- **Open a PR from the phase branch into `main`** when the phase's Definition of Done (in `docs/roadmap.md`) is met. Merge only after the user has reviewed it (see `docs/working-with-claude-code.md` for the review workflow).
- **Never force-push `main`, never skip hooks, never rewrite history that's already pushed** unless explicitly asked.
- Update `docs/roadmap.md`'s checklist for the phase (tick off completed items) as part of the same PR — the roadmap file should always reflect real project status.

## 7. Definition of Done (applies to every phase, in addition to the phase-specific checklist in the roadmap)

- [ ] Migration files exist for any schema change, and `supabase db reset` (or equivalent) applies cleanly
- [ ] RLS policies exist and were tested for every new table (at least: can a customer see another customer's data? Can a pro see another pro's earnings? No.)
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
- [ ] Push notification approach for "pro is arriving" (browser push vs. none for MVP)

*(Keep this list current — remove items once decided and folded into section 2, add new ones as they come up.)*
