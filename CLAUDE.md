# CLAUDE.md — Handy Project Guide

This file is the single source of truth Claude Code reads at the start of every session in this repo. It exists so decisions get made **once** (here) instead of re-litigated in every conversation. Keep it accurate: whenever a real architectural decision is made in a session, update this file in the same session, before moving on.

Read alongside this file, in this order, at the start of any new phase of work:

1. `docs/product-spec.md` — what we're building and why (business rules, roles, flows)
2. `docs/architecture.md` — how it's built (stack, folder layout, data model)
3. `docs/roadmap.md` — what to build **right now** (current phase only — do not jump ahead)

---

## 1. What this project is

**Handy** — an on-demand, location-based marketplace connecting customers with verified local service professionals ("handymen": plumbers, electricians, etc.) in Israel. Customers post a job for free, get real price quotes from nearby verified pros within minutes, and pay the pro directly. A pro who is chosen has two hours to accept the job; accepting charges them a flat 35 ₪, once, and is what assigns the work. Full spec: `docs/product-spec.md`.

Target market: Israel. UI language: Hebrew, RTL. Currency: ILS (₪).

## 2. Locked technology decisions

Do not introduce an alternative to any of these without discussing it with the user first and then updating this section.

| Layer | Choice | Notes |
|---|---|---|
| Framework | **Next.js** (App Router, TypeScript) | Single repo, server + client in one codebase |
| Backend/DB | **Supabase** (Postgres, Auth, Storage, Realtime, Edge Functions) | Managed — do not stand up a separate custom backend |
| Auth | Supabase Auth, **phone number + SMS OTP** (no passwords) | SMS provider: Twilio (configured inside Supabase Auth). **Real delivery is currently stood down** behind `AUTH_BYPASS_OTP` (`lib/auth/bypass.ts`, decided 9.9.2026): nothing is sent and a fixed code signs in any number, because Twilio charges $0.2575 per SMS to Israel. The channel is still SMS when it comes back — see section 9 |
| ORM/DB access | Supabase JS client + generated types (`supabase gen types typescript`) | Avoid adding Prisma/Drizzle on top — one data-access layer only |
| Supabase CLI | Installed as a **devDependency**, run via `npx supabase` | Version is locked in the repo and identical for everyone — not dependent on what happens to be installed globally |
| Styling | **Tailwind CSS v4** | v4 is CSS-first: there is **no `tailwind.config.ts`**. Design tokens from Claude Design go in the `@theme` block in `app/globals.css` |
| Maps / geocoding / distance | Google Maps Platform (Maps JS API, Geocoding, Places, Distance Matrix) | Needed for: address autocomplete, radius search, live "pro en route" tracking. **Two keys**: `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` (browser, referrer-restricted) and `GOOGLE_MAPS_SERVER_API_KEY` (server, IP-restricted — a referrer-restricted key cannot geocode). With no key the app falls back to manual address entry + a local gazetteer, opt-in via `ALLOW_NO_MAPS_KEY` |
| File/media uploads | Supabase Storage | Job photos/videos/voice notes, pro verification documents, profile photos |
| Realtime (bids arriving, chat, live location) | Supabase Realtime (Postgres changes + broadcast channels) | Do not add a separate WebSocket server. In the browser the socket must be handed the session token **before** it joins (`setAuth()` then `subscribe()`) — this app restores its session from a cookie, so no auth event pushes the token in on its own, and an unauthenticated socket is refused the subscription outright |
| Scheduled database work (bid expiry) | **pg_cron**, installed by migration | Chosen in Phase 4 over a scheduled Edge Function: cron inside the database needs no deploy target and is available both locally and on Supabase Cloud. It is only ever housekeeping — nothing in the product may depend on a sweep having run |
| PDF generation (receipts) | **`@react-pdf/renderer`**, with the Heebo TTF faces vendored in `assets/fonts/` | Decided in Phase 6. A Hebrew receipt is a **bidi** problem, not a font problem: a PDF has no bidirectional-text engine, so a lighter writer (pdf-lib, pdfkit) would have meant reordering Hebrew runs by hand. This one lays text out through textkit, which does it. `next.config.ts` lists it in `serverExternalPackages` and traces `assets/fonts/**` into the deployment. Verify a receipt by **rendering it and looking**, never by reading the source |
| Hosting | Vercel (frontend/Next.js) + Supabase Cloud (DB/backend) | |
| Package manager | npm (unless the user says otherwise) | |
| Validation | **Zod** | Every server-side write path. Schemas in `lib/validation`, one file per entity |
| Testing (DB) | **pgTAP** via `supabase test db` (`npm run db:test`) | RLS policies are tested in the database, where they run — not mocked in JS. Added in Phase 1 |
| Testing (app) | Vitest (unit, `npm run test`) + Playwright (critical E2E flows only, `npm run test:e2e`) | Vitest arrived in Phase 2, the first phase with logic that needed it: the no-key geocoding fallback and the Zod schemas. Playwright arrived in Phase 9 and drives a **production build** against the real local stack — no mocks, because RLS, the `security definer` functions and Storage are the whole point of a browser test. Anything that depends on RLS is tested in pgTAP, not mocked in JS |
| Language | TypeScript everywhere, `strict: true` | No `any` without a comment explaining why |

**Mobile strategy:** web-only, fully responsive (mobile-web + desktop breakpoints), matching the two viewport variants already designed in Claude Design. No native app in this phase of the roadmap.

## 3. Non-negotiable architecture rules

- **One phase at a time.** Build exactly what the current phase in `docs/roadmap.md` asks for — no extra features, no future-proofing for a phase that hasn't started. If something in the current task clearly needs a piece from a later phase, stop and flag it instead of quietly building it.
- **Database is the contract.** Every entity in `docs/architecture.md`'s data model must exist as a real Postgres table with Row Level Security (RLS) policies before any UI is built against it. No mock data left behind after a phase is marked done.
- **RLS on everything.** Every table gets explicit RLS policies (customer sees own jobs, pro sees open jobs + own bids, admin sees all). Never disable RLS to "make it work" — fix the policy instead.
- **Server-side validation always.** Every write path (server action or route handler) validates input with Zod, even if the client also validates. Never trust client input for price, fees, or status transitions.
- **Money is server-authoritative.** Prices, the acceptance fee, and price-update deltas are computed and enforced server-side, never trusted from the client.
- **A status a user must not set themselves is a `security definer` function, never a column grant.** `pro_profiles.verification_status` has no UPDATE grant for any client role: a pro submits through `submit_pro_for_approval()` (which re-checks completeness) and an admin decides through `set_pro_verification()` (which checks `is_admin()`). A grant wide enough for the admin would also have let a pro verify themselves.
- **A job reaches a pro only inside BOTH radii** — `least(pro_profiles.radius_km, jobs.search_radius_km)` — and that is enforced in the RLS policy on `jobs`, not in the feed query, so it holds for anything that ever reads the table.
- **A bid's two clocks and its status are not the form's to set.** `bids` grants INSERT on five columns only (`job_id`, `pro_id`, `price`, `eta_minutes`, `note`) — `expires_at`, `accept_deadline` and `status` are left to the database — and `status` has no UPDATE grant at all. Every transition is a `security definer` function: `select_bid()`, `accept_job()`, `decline_job()`, `withdraw_bid_selection()`, `expire_stale_bids()`, `expire_stale_selections()`. **One clock replaces the other:** an offer lapses at `expires_at`, but once it is chosen the pro has two hours (`bid_accept_window()`) and the offer must not lapse underneath them — the sweeps only ever touch the status each one owns. Both deadlines are re-checked on read and inside the functions, so they hold whether or not a cron sweep has run.
- **Choosing a bid is an offer; taking the job is `accept_job()`.** `select_bid()` marks the bid `selected`, stamps the two-hour deadline and moves the job to `awaiting_pro`. It deliberately does **not** write `jobs.selected_bid_id` and does **not** reject the rivals: until the pro answers there is no agreement, the job stays in the feed and keeps taking bids, and the customer may hand it to somebody else (`select_bid()` again) or take it back (`withdraw_bid_selection()`). `accept_job()` does all three — assigns, closes every rival, charges the fee — in one statement, and re-checks `is_verified_pro()`, because a pro suspended since they bid must not be able to take work.
- **`jobs.selected_bid_id` is what "assigned" means, so it waits for the acceptance.** `is_assigned_pro()` is defined through that column, and the chat policies, the live location, `request_price_update()`, `complete_job()` and the receipt are defined through *it*. Writing it at selection time would hand every one of those to a pro who never answered.
- **A chat thread is (job, pro), never (job).** On a job with three offers the customer holds three separate conversations, and no pro may read another's — `messages.pro_id` is what makes that true in the policy rather than in a query.
- **Price-change rule is enforced in the DB layer, not just the UI:** a job's price can only change through a `price_updates` record that carries a photo URL and moves through `pending → approved/rejected` — there is no direct `UPDATE jobs SET price = ...` path from client code.
- **A job's live price is `job_effective_price()`, a function — there is no price column anywhere.** It is the selected bid's price, replaced by the newest *approved* `price_updates` row. A pending or refused request is nowhere in it, which is what makes "אם הלקוח לא מאשר, העבודה ממשיכה במחיר המקורי" true by construction: there is no place for an unapproved number to sit, so nothing has to remember to ignore one.
- **Neither side writes `price_updates` directly.** Phase 1's grants let the pro assert `original_price` (a money field) and let the customer flip `status` back and forth. Both are revoked. `request_price_update()` reads the original price itself and pins the photo to `<pro_id>/<job_id>/…`; `decide_price_update()` is one-way, once, and a `before update` trigger holds that line even for a caller that bypasses RLS entirely.
- **The fee is charged by `accept_job()`, is a flat `job_acceptance_fee()`, and is never refunded.** `job_fees` has never had an INSERT grant for any client role, and the amount is read from the function rather than accepted from the caller. Accepting is idempotent — a retried tap on a phone must not charge twice. Not refunding is a decision the user made on 8.9.2026 and it is why `resolve_dispute()` does not touch the ledger: a credit to the customer and the fee the pro paid to take the job are two different questions.
- **Closing a job is `complete_job()`, and it charges nothing.** The money entered when the pro accepted. Closing *completes* the row that already exists — `total_price` from `job_effective_price()`, the payment method the pro declares, and `completed_at` — then moves `jobs.status` to `completed` and bumps the completed count, in one statement. `job_fees.total_price`, `payment_method` and `completed_at` are therefore null on a job that was taken and is still under way, and every reader that means "a finished job" has to say so.
- **The pro declares how they were paid; nobody chooses it afterwards.** Handy is not a party to the payment (business rule 4) — it records the collection so it can print a receipt. The four chips on the customer's summary screen show what was recorded, they are not a form. A recorded method the customer disputes is a dispute, which is Phase 7.
- **Completing a job settles a price request the customer never answered, as `rejected`.** It changes no number — `job_effective_price()` has never counted a pending row — but a finished job must not still be asking a question nobody can act on, and a pro must not be stuck waiting for an answer that may never come.
- **A review is `submit_job_review()`, on a finished job only.** Phase 1's grants let a customer rate a pro before the pro had done anything and rewrite the score afterwards as leverage; both are revoked. `pro_profiles.rating_avg` is recomputed by trigger from `reviews` — it has never been writable by any client.
- **A receipt tells each side a different truth.** `job_receipt()` returns `fee_amount` and `net_amount` as NULL to the customer: what Handy charges the pro is between Handy and the pro. It also carries two dates that are no longer the same day — `charged_at` (when the job was taken) and `completed_at` (when it ended). `/api/receipts/[jobId]` renders the matching document per role rather than one document with a hidden field.
- **Live location is a table (`job_locations`), not a broadcast channel.** One row per job, written only through `report_job_location()`, readable by the job's customer, that pro and an admin. Chosen over the broadcast `docs/architecture.md` originally sketched because "who may watch where this pro is" then becomes a policy pgTAP can prove, and because a customer opening the page mid-journey sees a last known position rather than a blank map. Reporting is opt-in, from the pro's own switch, every 15 seconds while the tab is open.
- **An admin's *aggregate* is a function; an admin's *record* is RLS.** These are the same decision seen twice. A policy picks rows, so "who may read this job" is expressible as one and "how many jobs were posted today" is not. Every function behind the console (`admin_overview()`, `admin_jobs()`, `admin_disputes()`, `admin_trust_metrics()`, …) therefore asks `is_admin()` at its own front door. The dossier at `/admin/jobs/[jobId]` adds no function at all: `jobs`, `bids`, `price_updates`, `messages`, `job_fees` and `reviews` have each carried an "admin reads all" policy since the phase that created them, and it reads them through the very modules the customer and the pro use. **There is no admin-only projection of a job in this repo**, which is what makes "the admin sees what happened" and "the two sides see what happened" one sentence rather than two.
- **Neither side of a job may close their own complaint.** `disputes` has never had an UPDATE grant, and since Phase 7 its INSERT grant covers three columns — `job_id`, `opened_by`, `reason`. Phase 1's table-wide grant would have let a complainant open a case already marked `resolved` with a `credit_amount` of their own choosing. Deciding one is `resolve_dispute()`, which checks `is_admin()`, refuses a second decision, and writes the customer's credit in the same statement that closes the case. One live case per job, enforced by a partial unique index.
- **Enforcement is checked where the thing happens, never by hiding a button.** `pro_profiles.price_updates_blocked` is read inside `request_price_update()` — the only function that can write the table — and `documents_required_at` accompanies a move back to `pending`, which `is_verified_pro()` answers false to, so demanding fresh papers actually stops the pro taking new work. Neither column has a client grant, for the same reason `verification_status` never did: a pro who could clear their own block is not being enforced against.
- **A public page is a `security definer` function, never a widened policy.** RLS picks rows and cannot hide a column, and `pro_profiles` carries a payout account, a phone and a service point beside the bio. So `pro_public_profile()`, `pro_public_reviews()`, `category_pros()`, `category_stats()` and `pricing_guide()` each name the columns they return, one by one, and are granted to `anon`. `pro_profiles` kept exactly the grants it had in Phase 1 — Phase 8 added no `select` policy for anybody.
- **A pro's `/pro/<slug>` is a column grant, because it is their own description of themselves** — the same family as `bio`, not the family as `verification_status`. What has to hold is the *shape* of the value, so the rules are a check constraint (never one of the app's own `/pro/…` segments, never a doubled hyphen) and a partial unique index. `lib/validation/publicProfile.ts` keeps the same reserved list for the message under the field, and a Vitest assertion reads the migration to keep the two copies identical.
- **`pro-media` is the one public bucket, and it holds only what a pro chose to publish.** A customer comparing pros before they have an account cannot be handed a signed URL — signing runs under a reader's RLS and there is no reader. Portrait and work gallery live there; identity documents stay in the private `verification-docs` bucket, and the two are never the same file.
- **No invented figure on a public page.** Every number on the category+city pages, the cost guide and a pro profile is counted from rows by one of the functions above; where there is nothing to count, the page says so. The design's "97% אחריות" and its per-task duration column are absent because nothing in this product measures either — these are the pages whose whole job is to be trusted.
- **`support_tickets` is the only table an anonymous visitor may write to, and nobody may update it.** The INSERT policy pins `created_by` to whoever the caller actually is (`auth.uid()`, or null for `anon`); a ticket's `status` is the support team's answer to it, so no client role holds an UPDATE grant.
- **A review has two halves and two owners.** The customer wrote the row (`submit_job_review()`); the pro answers it (`reply_to_review()`, which checks `is_assigned_pro()`). Neither holds a column grant on the other's half — and since Phase 8 the whole row is served to anonymous visitors, with the reviewer shortened to a given name and an initial.
- **RTL: logical properties only.** The UI is Hebrew and the app renders `dir="rtl"`. Always use Tailwind's logical utilities — `ms-`/`me-`, `ps-`/`pe-`, `start-`/`end-`, `text-start`/`text-end`, `border-s`/`border-e` — and **never** the physical `ml-`/`mr-`, `pl-`/`pr-`, `left-`/`right-`, `text-left`/`text-right`. A physical utility looks correct in a Latin-language preview and silently breaks the layout in Hebrew. The one exception is `lib/pdf/`: react-pdf's stylesheet has no logical properties and a PDF page has no `dir`, so it uses symmetric physical values and an explicit `textAlign: "right"` — the document is always Hebrew.
- **Bidi is a layout problem, not a font problem, and it is only ever verified by looking.** In a Hebrew line, a Latin word, a reference like `H-00004` and a date are separate bidi runs; the Unicode algorithm reorders them correctly and the result can still read in the wrong order to a person. Keep such a line to **one fact** — a label/value row, one sentence per line, an all-digit date — rather than a sentence that mixes three runs. In the browser this is usually forgiving; in a PDF it is not.
- **A failed write says why, to a log, in every single branch.** Every rule that matters is enforced in the database, so a refused write arrives carrying a Postgres code and a constraint name that name the cause exactly — and for nine phases every server action turned that into one sentence of Hebrew and discarded the rest, which left a pro reporting "לא הצלחתי לסגור עבודה" with nothing behind it to read. `lib/observability.ts` has two entry points because the failures are two kinds: `logServerError` for a write that was supposed to work, `logExpectedRefusal` for one the product has a sentence for (a second offer on the same call, a slug already taken). Keeping them apart is what stops the first kind being buried under the second. **Identifiers only** — never a phone, a name, an address, a message body or a payout detail: a log sits outside every RLS policy that protects those. `tests/errorBoundaries.test.ts` fails on any branch that goes back to returning Hebrew alone.
- **An uncaught error reaches a person and a log, and the `digest` is what ties the two together.** `app/error.tsx` is at the root of `app/` rather than inside each area, because an `error.tsx` does not wrap the `layout.tsx` beside it — and the layouts most likely to throw are the four `(authed)` ones where `requireRole()` runs, so a boundary inside an area would miss its own gate. In production Next replaces a server error's message before it reaches the browser, so the digest is the only string both sides share: it is printed on the screen and written by `onRequestError` in `instrumentation.ts`. That hook is also the one seam a monitoring vendor plugs into (section 9) — not thirty call sites. The prop is **`retry`**; Next 16 renamed it from `reset`, and the old name still typechecks while the button silently does nothing.
- **A value that has a name in `primitives.tsx` is used by that name.** The module opens by promising that a re-skin is one edit there rather than a sweep through every component; for `BUTTON_CTA` and `INPUT_CLASS` that was true, and for the card it was not — `CARD_CLASS` was imported by nobody while the three utilities that make a card look like a card were written out inline fifty-five times across thirty-five files. `CARD_BASE` is the card without its padding, because the app draws it at four different insets and which inset a card takes is a judgement against `design/screens/`, not something to unify from outside. `tests/designTokens.test.ts` fails on any of the named literals reappearing outside that module.
- **Coverage is measured over the plain logic, not over `lib/**`.** Pointed at everything the number is 27%, because `lib/supabase/**` and most of `lib/actions/**` are deliberately not unit-tested — what they carry lives in RLS and in `security definer` functions and is proved in pgTAP, where it runs. Over the Zod schemas, the gazetteer, the OTP mapping and the form helpers it is 91%, and the thresholds in `vitest.config.ts` sit just under that so they fail for a real reason. A gate at 27% would say nothing and would be met by testing whatever was cheapest.
- **A screen that can answer "no such record" does not get a streaming skeleton.** A `loading.tsx` is a Suspense boundary, so the response begins streaming before the page's query resolves — and once the headers are out, `notFound()` cannot set the status. The refusal still renders and RLS still returns no row, but a 404 becomes a 200, and on `/requests/[jobId]/…` that status is how this repo says out loud, in a test, that one customer cannot reach another's job. The boundary covers the **whole subtree**, not the folder it sits in: `admin/loading.tsx` was streaming the job dossier three levels down. `tests/streamingStatus.test.ts` fails on the pairing; Next's own `loading.md` ("Status Codes") is where the trade-off is documented.
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
| דמי קבלת עבודה | `acceptance_fee` | A flat 35 ₪, charged to the pro at the moment they accept a job. Never refunded |
| קבלה | `receipt` | Generated PDF at job completion |
| מחלוקת | `dispute` | Admin-mediated conflict on a job |
| פרופיל ציבורי | `public_profile` | Pro's customer-facing profile page |
| רדיוס חיפוש | `search_radius_km` | On a job: how far the customer wants it broadcast. Distinct from `radius_km`, which is the pro's own service radius |
| מתי נוח / מועד | `preferred_time` | Closed vocabulary: `asap` / `today` / `tomorrow` / `this_week` / `flexible`. Hebrew labels live in `lib/validation/jobs.ts` |
| מדיה של קריאה | `job-media` | Private Storage bucket, laid out as `<customer_id>/<upload_group>/<filename>` |
| מסמכי אימות | `verification-docs` | Private Storage bucket, laid out as `<pro_id>/<filename>`. No update and no delete policy — a document is replaced by uploading a new one |
| תמונת התקלה | `price-update-photos` | Private Storage bucket, laid out as `<pro_id>/<job_id>/<filename>`. No update and no delete policy: this is the evidence a customer approved a higher price on |
| מחיר בפועל | `job_effective_price()` | The live price of a job. Derived, never stored — see section 3 |
| מיקום חי | `job_locations` | One row per job: where the assigned pro is now. No history, no client write grant |
| הגעתי ללקוח | `mark_job_in_progress()` | `assigned → in_progress`, by the assigned pro. Completion is Phase 6 |
| תחומי התמחות | `pro_categories` | Which trades a pro works in. A feed filter, not a security boundary |
| לא מתאים לי | `job_dismissals` | A pro hiding one job from their own feed. Visible to nobody else |
| ימי ושעות עבודה | `work_days` / `work_start_time` / `work_end_time` | `work_days` is 0 = Sunday … 6 = Saturday |
| שלב בהרשמה | `onboarding_step` | 0–5, highest step completed. `draft` → `pending` happens through `submit_pro_for_approval()` |
| חשבון לגבייה | `payout_bank_name` / `payout_bank_branch` / `payout_account_last4` | Last four digits only — see section 9 |
| תוקף הצעה | `expires_at` | 45 minutes from when the offer was made. A column default plus a trigger, never a form field |
| ההצעות שלי | `my_bids` | A pro's own offers. `winning_price` on a lost one is the price that won, never who offered it |
| שיחה | `thread` | One conversation, keyed `(job_id, pro_id)`. Not a table — the key is on `messages` |
| נקרא | `read_at` | On `messages`. Writable only by the side that did **not** send it |
| סיימתי — עדכן גבייה | `complete_job()` | `assigned`/`in_progress` → `completed`, by the assigned pro. Completes the fee row that `accept_job()` opened; charges nothing |
| אמצעי תשלום | `payment_method` | Closed vocabulary: `cash` / `bit` / `paybox` / `bank_transfer`. Phase 6 unified it — Phase 3 had spelled the last one `transfer` on `pro_profiles.payment_methods` |
| דמים שנגבו | `job_fees` | One row per **accepted** job: `fee_amount` (35 ₪) and `charged_at` at acceptance; `total_price`, `payment_method` and `completed_at` filled at closing, null until then. Read-only to every client role |
| גובה הדמים | `job_acceptance_fee()` | 35 ₪, as a function, so the receipt, the wallet and the bid form cannot drift apart |
| חלון האישור | `bid_accept_window()` · `bids.accept_deadline` | Two hours. Long because nothing notifies a pro whose tab is closed — see section 9 |
| ממתין לאישור | `jobs.status = 'awaiting_pro'` | Chosen, unanswered. Not committed to anybody: still in the feed, still taking bids |
| אשר וקח את העבודה | `accept_job()` | The pro takes the job: assigns it, closes every rival offer, and charges the fee — one statement, idempotent |
| ויתור | `decline_job()` | The pro passes. No charge, and the job returns to `bidding` with every rival offer untouched |
| בטלו את הבחירה | `withdraw_bid_selection()` | The customer takes back an unanswered offer. The pro's bid returns to `pending` if its own 45 minutes are still running |
| פקיעת בחירה | `expire_stale_selections()` | Housekeeping for the two-hour clock, beside `expire_stale_bids()` for the 45-minute one |
| נבחרת | `my_pending_acceptances()` | The offers waiting for the calling pro, with the deadline and the fee accepting will charge |
| קבלה | `job_receipt()` | The billing summary of a closed job, to its two sides. The fee is NULL for the customer. The PDF is `/api/receipts/[jobId]` |
| דירוג | `submit_job_review()` | The only write path into `reviews`. Completed jobs only; a trigger recomputes `pro_profiles.rating_avg` |
| ארנק / הכנסות | `my_earnings_stats()` / `my_completed_jobs()` | `/pro/wallet`. Range totals plus the lifetime rating; scoped to `auth.uid()` inside the function |
| שמור לפעם הבאה | `saved_pros` / `my_saved_pros()` | The customer's own list. A pro can never see who saved them |
| מחלוקת | `disputes` | One live case per job (partial unique index). A participant asserts `reason` and nothing else |
| הכרעה וזיכוי | `resolve_dispute()` | `in_review` / `resolved` / `rejected`, by an admin. The credit rides with the decision that grants it |
| כלי אכיפה | `set_pro_enforcement()` | Block/unblock field price updates, demand fresh documents. Suspension is `set_pro_verification()` |
| חסימת עדכוני מחיר | `pro_profiles.price_updates_blocked` | Checked inside `request_price_update()`. No client grant |
| דרישת מסמכים מחודשת | `pro_profiles.documents_required_at` | Set alongside a move back to `pending`. No client grant |
| תיעוד הקריאה | `/admin/jobs/[jobId]` | The whole record one dispute is judged against — product-spec.md 5.4. Plain rows under the admin's RLS |
| כל השיחות על קריאה | `job_threads()` | Every conversation on one job, in one call rather than one per bid. Not an admin reader: the owner and an admin get all of them, a pro who bid gets their own |
| סקירה כללית | `admin_overview()` | Every figure on the console's front page, in one row and one instant |
| מדדי אמון | `admin_trust_metrics()` | Disputes per 1,000 jobs, the share of field price updates approved, average time to decide |
| עיר | `job_city()` | Derived from the last comma-separated part of `address_text`. Never a column |
| דף תחום + עיר | `/services/[category]/[city]` | The SEO pages. Cities are a curated list in `lib/content/cities.ts` — a marketing decision, not an entity |
| פרופיל ציבורי | `pro_public_profile()` · `/pro/[slug]` | One verified pro, as a stranger sees them. A definer function naming every column; `pro_profiles` gained no read policy |
| כתובת הפרופיל | `pro_profiles.public_slug` | Self-chosen, format-checked, unique, and never one of the app's own `/pro/…` paths |
| תמונת פרופיל וגלריה | `pro-media` | The **public** Storage bucket, `<pro_id>/<filename>`. Only what a pro publishes on purpose |
| מענה לביקורת | `reply_to_review()` | The pro's half of a review. No client role holds a grant on `reviews.pro_reply` |
| מדריך עלויות | `pricing_guide()` | Per-category price statistics from `job_fees`, counting **completed** rows only. A category with no closed job says so |
| פנייה לתמיכה | `support_tickets` | The contact form. The one table `anon` may INSERT into; no client role may UPDATE one |
| מדריכי תחזוקה | `lib/content/guides.ts` | Articles in code, not a table: a guide restates rules that live in migrations |

Add new rows here whenever a new domain concept appears — do not let this glossary drift out of date.

## 5. Folder structure convention

```
/proxy.ts               → session refresh + anonymous gate (Next 16's name for middleware.ts)
/instrumentation.ts     → onRequestError: every uncaught server error, with its
                          `digest`. The seam a monitoring vendor plugs into
/app                    → Next.js App Router routes
  error.tsx · global-error.tsx · not-found.tsx
                        → the three boundaries, all at the root: an error.tsx
                          does not wrap the layout beside it, so only the root
                          covers the `(authed)` gates (see section 3)
  /(customer)            → customer-facing routes — AT THE ROOT: /login, /account,
                            /new-request, /requests/[jobId]/offers|chat
  /(pro)                 → pro-facing routes, prefixed. /pro is the PUBLIC
                            landing page and /pro/login the door; the signed-in
                            home is /pro/dashboard (see docs/architecture.md)
  /(admin)               → admin dashboard routes, prefixed: /admin/login, /admin
  /(marketing)            → public pages, no session on any of them: the landing
                            page at /, plus (Phase 8) /how-it-works, /pricing,
                            /help, /contact, /terms, /privacy, /cancellation,
                            /guides[/slug], /services[/category[/city]] and
                            /pro/[slug] — the public profile. `robots.ts` and
                            `sitemap.ts` sit at the app root, where Next looks
  /api                    → route handlers only where a server action doesn't fit.
                            Two exist, both because what comes back is a file:
                            /api/receipts/[jobId] (Phase 6) and
                            /api/admin/report (Phase 7, the console's יצוא דוח).
                            A route handler sits OUTSIDE the (authed) layout, so
                            it does its own role check
/components
  /ui                     → generic design-system components (buttons, inputs, cards).
                            primitives.tsx is the single source of the card, the
                            page title and the field label; Skeleton.tsx is what
                            every loading.tsx is built from
  /customer, /pro, /admin → role-specific components
/lib
  /routes.ts              → role → home/login path maps (importable from proxy.ts,
                            and from app/error.tsx: `loginPathFor()` is what
                            tells `/pro/dashboard` from a public `/pro/<slug>`)
  /observability.ts       → logServerError / logExpectedRefusal. Server-only.
                            Identifiers in the context argument, never a person
  /demo.ts                → the four seeded users the landing page's demo panel
                            can sign in as, and the flag that decides whether
                            that panel exists. Demo tooling, not a feature —
                            its numbers are audited against config.toml and
                            seed.sql by tests/demoUsers.test.ts
  /actions/formData.ts    → optional() and fieldErrorsOf(), the two things every
                            form action does before Zod sees a FormData. Its own
                            module because a "use server" file may export only
                            async functions
  /actions/proOnboarding.ts → the five-step wizard, split out of actions/pros.ts
                            along with the five helpers that serve only it
  /supabase               → client factory, generated DB types, session DAL
  /content                 → editorial copy in code (Phase 8): cities, category
                             copy, FAQ, guides, legal text. Not a table — an
                             answer here restates a rule that lives in a
                             migration, and the two are reviewed in one diff
  /seo.tsx                 → canonical URLs, page metadata, JSON-LD helpers
  /validation              → Zod schemas, one file per entity
  /actions                 → server actions, grouped by entity
  /pdf                     → the receipt document (Phase 6). Server-only: it
                             imports `server-only` and is reachable from the
                             route handler alone
/assets/fonts              → the Heebo TTF faces the PDF embeds. Not `public/`:
                             they are never served to a browser (the app gets
                             Heebo from next/font/google), they are read with
                             `fs` at request time
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

- [ ] Exact Twilio account setup / SMS sender ID for Israel
- [ ] A real Google Maps Platform key. Everything that needs one — Places Autocomplete, the map on the published-job screen, server-side geocoding — is built behind a key check and degrades to manual address entry, so this blocks verification against Google, not development
- [ ] Push notification approach for "pro is arriving" (browser push vs. none for MVP). Phase 4 needed none, and Phase 5 still does not: the tracking screen, the price-update card and both chats update through Supabase Realtime while the tab is open. That remains a different thing from reaching someone who has closed it — Phase 5 made the gap visible, and **Phase 10 made the product depend on it**: a customer's choice now expires in two hours unless the pro answers, and nothing outside an open tab tells them they were chosen. The two-hour window was chosen to survive that, not to excuse it. SMS through Twilio is the short path and is money, so section 8 keeps it with the user; until then a pro who works with the tab closed loses work they were given
- [ ] **How a pro's full bank account number is stored**, if it is stored at all. Phase 3 collects bank, branch and the last four digits only (`payout_account_last4`) — enough for the pro to recognise the account on screen. Phase 6 did **not** change this, and neither did Phase 10: a `job_fees` row *records* what is owed, and recording a debt is not collecting it. Collecting the rest is real money movement, which section 8 says to decide with the user
- [ ] **What actually debits the fee.** `job_fees` is a ledger with no settlement behind it — nothing sweeps it, nothing marks a charge paid, and the onboarding copy's "סליקה כל שני וחמישי" has no code. That is money movement and is deliberately the user's call (section 8). When it arrives it wants a status on the row and, probably, a payout run. Phase 10 made the timing sharper rather than easier: the debt is now incurred **before** the work, so a pro can owe Handy for a job that never happened
- [ ] **Who a customer's dispute credit is actually paid by, and how.** Phase 7 records it: `disputes.credit_amount` is written by `resolve_dispute()` in the same statement that upholds the complaint. Nothing pays it out — like `job_fees`, it is a ledger with no settlement behind it, and settlement is real money movement (section 8). Phase 10 untangled it from the fee: the fee is not refunded on an upheld dispute (decided 8.9.2026), so the credit is now one question and not two.
- [ ] **Cancelling an assigned job.** The design's "העבודות שלי" summary counts ביטולים and nothing in the product can produce one: `jobs.status` has a `cancelled` value with no transition into it. Phase 6 left the counter off the screen rather than draw a permanent zero. Who may cancel, until when, and what it does to a bid that was already accepted are product questions — and **Phase 10 raised the stakes on them**: a pro who accepted has already paid 35 ₪, non-refundable, so a customer who cancels or vanishes now costs them money rather than time. Before this is a real marketplace, this entry and the two above it are one decision
- [ ] **Legal review of the three public documents.** `/terms`, `/privacy` and `/cancellation` (Phase 8) are a plain-language description of what the code actually does, clause by clause, so a lawyer has something concrete to correct. Every page says so on itself, through `DRAFT_NOTICE` in `lib/content/legal.ts` — that line comes off in the same commit the review lands. Section 8 keeps legal text with the user
- [ ] **Real OTP delivery is switched off, and anyone can sign in as anyone.** Decided with the user on 9.9.2026, after pricing the alternatives: Twilio charges **$0.2575 per SMS to Israel** — among the most expensive destinations on the platform — and WhatsApp is not the way out it appears to be, because Meta charges per authentication template too and its Business verification needs a registered company, which does not exist yet. (The one free WhatsApp route, Meta's Cloud API test number, caps at five recipients. Recorded here so nobody prices it twice.) So `AUTH_BYPASS_OTP=1` stands the delivery down: `lib/auth/bypass.ts` signs in **any** phone number with a fixed `123456`, prefilled on the screen, and the screen says it is a demo rather than claiming an SMS was sent. **The six digits are not a check.** Anybody who reaches the login screen can create a customer or a pro and post real rows, and the user chose deliberately to leave the deployed site otherwise open — no Vercel password, no change to `app/robots.ts`. Two things it cannot do, and both are load-bearing: it cannot mint an admin (`handle_new_user` whitelists the role, and the action refuses one before Supabase is called), and it cannot reach the seven seeded users, because it signs in with a password it set itself and they have none — they still answer to `[auth.sms.test_otp]`, which is what keeps `972500000005` out of its reach. It is **not** a session-forging primitive and does not use the service-role key: `lib/actions/demo.ts` rejected that in Phase 8 on the grounds that "a forging primitive works for every user id there will ever be", and that reasoning is untouched. Unlike `NEXT_PUBLIC_DEMO_LOGINS`, `AUTH_BYPASS_OTP` is read on the server at request time, so clearing it in the Vercel dashboard takes effect immediately. **Retiring it is two steps, not one:** clear the flag, then `npm run auth:purge-bypass` — every account it created is tagged `created_via: "otp_bypass"` at sign-up, and they all share one password, so leaving them behind is the residual risk. What closes this entry is a decision to pay for a channel: a local Israeli SMS gateway (roughly a tenth of Twilio's price for Israel, and no Meta verification) is the likely answer, and Supabase's Send SMS Hook — available on the Free plan — is where it would be wired in

- [ ] **The demo codes are live, and the site is not locked.** Accepted on 2026-09-03 to get a demo in front of investors, and **reaffirmed by the user on 2026-09-05** after the technical-debt audit raised it as the single critical item: they stay as they are for now. **Widened on 2026-09-06**, deliberately and at the user's request: `lib/demo.ts` and the panel on the landing page turn "find the URL, then guess that the admin is `972500000005`" into a labelled button. The credentials did not change; the obscurity that was the only thing protecting them did. There is now a fourth lever beside the three below, and it is the cheapest — **leave `NEXT_PUBLIC_DEMO_LOGINS` unset**, or set it only on a Vercel *Preview* deployment and demo from that URL, so the indexed production alias never carries the button. Note it is `NEXT_PUBLIC_`, therefore inlined at build time: unsetting it in the dashboard changes nothing until the next deploy, and there is no runtime switch. That is a standing accepted risk, not a closed question — the entry stays open, and what reopens it is the first thing on this list that is not a private demo: a real user, a public link, or anything that puts the URL somewhere it can be found. The hosted project takes `[auth.sms.test_otp]` through `supabase config push` (the config.toml comment saying otherwise was wrong and has been corrected), so phone login works on the deployed site with no Twilio account — and `123456` against any of the seven seeded numbers is a real production credential. `972500000005` is the admin: anyone who finds the URL and tries the obvious number and the obvious code reaches the console Phase 7 built. Nothing about the deployment is otherwise gated — no Vercel password protection, and `app/robots.ts` invites indexing. Before this stops being a private demo, one of: rotate the codes on the hosted project only, drop the admin demo user from the cloud seed, or put the deployment behind Vercel's password protection. Rotating is a `config push`, which currently also pushes `site_url` — see the note below
- [ ] **`site_url` on the hosted project points at `http://127.0.0.1:3000`,** because `config push` sends the whole local config.toml and that file is written for local development. Phone OTP does not redirect, so nothing in the product is broken by it today; email links and OAuth would be. Whoever adds either needs config.toml to carry the deployed origin without breaking `supabase start` for everyone else — `env()` interpolation in config.toml is the intended lever
- [ ] **Backups, and specifically `Storage` backups.** Deferred by the user on 2026-09-03: there is no cloud project and no real user yet, so there is nothing to lose. Reopen before the first real user. The database side is a plan choice (Free: none, `supabase db dump` by hand; Pro: 7 daily; Team: 14; Enterprise: 30; PITR is a paid add-on, seconds of granularity, roughly $100–400/month) — money, so section 8 keeps it with the user. **The Storage side is not a plan choice and no tier covers it:** Supabase states plainly that database backups do not include objects stored via the Storage API, at any tier, PITR included. Four buckets are affected — `job-media`, `price-update-photos`, `verification-docs`, `pro-media` — and the second one is the sharp one. Section 3 makes a price move only through a `price_updates` row carrying a `photo_url`; that photo *is* the justification an admin weighs in a dispute. Restore the database without the bucket and the row survives while its evidence does not, which is worse than an obvious gap because the record still claims the photo exists. The same holds for `verification-docs` under a `verified` badge. Whatever the plan, this needs its own scheduled copy out of Supabase — and a restore is not a plan until one has been rehearsed: restore into a clean project, then run `npm run db:test` and `npm run test:e2e` against it
- [ ] **A monitoring vendor, or none.** Every server-side failure is now recorded — `lib/observability.ts` for a refused write, `onRequestError` in `instrumentation.ts` for an uncaught throw — as one line of JSON on stderr. Vercel captures that already, at no cost, which is why the fix did not wait for this decision. What stderr does not give you is alerting, grouping, a retention window longer than Vercel's, or a stack trace stitched back to source. Buying that is an ongoing cost, which section 8 keeps with the user. Whatever is chosen, it is wired into those two functions and nowhere else — that was the point of routing thirty call sites through them
- [ ] **Who reads `support_tickets`.** Phase 8 built the contact form and the table behind it; an admin holds a read policy and there is no screen for it, because the console's four screens are Phase 7's list and "one phase at a time" is section 3's first rule. Until there is one, the support inbox is read out of band

*(Keep this list current — remove items once decided and folded into section 2, add new ones as they come up.)*

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
