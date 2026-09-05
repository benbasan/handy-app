# Handy

מרקטפלייס On-Demand מבוסס מיקום שמחבר לקוחות לבעלי מקצוע מאומתים בישראל.

- **מה בונים ולמה** — [docs/product-spec.md](docs/product-spec.md)
- **איך זה בנוי** — [docs/architecture.md](docs/architecture.md)
- **מה בונים עכשיו** — [docs/roadmap.md](docs/roadmap.md)
- **הכללים לעבודה עם Claude Code** — [CLAUDE.md](CLAUDE.md)

## Prerequisites

- Node.js 22+
- Docker Desktop (running) — needed for the local Supabase stack

## Local setup

```bash
npm install

# Start the local Supabase stack (Postgres + Auth + Storage + Studio).
# Prints the URL and keys you need in the next step.
npm run db:start

cp .env.example .env.local
# Fill NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and
# SUPABASE_SERVICE_ROLE_KEY from the `npm run db:start` output.

npm run dev
```

Open http://localhost:3000 — the customer landing page, with the category strip
read from the `categories` table. `/pro` is the pro landing page and `/admin`
the console; each has its own login screen (see the demo numbers below).

## Signing in locally

Auth is phone + SMS OTP, with no passwords. Local development needs **no SMS
provider**: [supabase/config.toml](supabase/config.toml) maps the seeded demo
numbers to a fixed code under `[auth.sms.test_otp]`.

The code for every demo user is **`123456`**.

| Phone         | Who                    | Role       | Lands on       |
| ------------- | ---------------------- | ---------- | -------------- |
| `050-0000001` | דנה לוי                | `customer` | /account       |
| `050-0000002` | יוסי כהן               | `customer` | /account       |
| `050-0000003` | דוד מזרחי (מאומת)      | `pro`      | /pro/dashboard |
| `050-0000004` | אבי פרץ (ממתין לאישור) | `pro`      | /pro/dashboard |
| `050-0000005` | מנהלת Handy            | `admin`    | /admin         |
| `050-0000006` | מוסא חדד (מאומת)       | `pro`      | /pro/dashboard |
| `050-0000007` | אלכס פרידמן (מאומת)    | `pro`      | /pro/dashboard |

`/pro` itself is the **public** pro landing page, which is why a signed-in pro
lands one level down. The approvals queue an admin needs in order to move
`050-0000004` from ממתין לאישור to מאומת is at `/admin/pros`.

The last two pros exist so דנה לוי's seeded job carries three competing offers
on `/requests/<id>/offers` — the compare screen is unreadable with one. Their
fourth offer, on יוסי כהן's job, is seeded already lapsed, which is what gives
the "נדחו / פגו" tab on `/pro/offers` something real to show.

Any other number can sign up for real, but will not receive a code until Twilio
is configured. New sign-ups become `customer` or `pro` depending on which login
screen they used — `/login` or `/pro/login`.

**`admin` is not obtainable by signing up.** `handle_new_user` whitelists the
requested role down to customer/pro, because it arrives as untrusted user
metadata. To grant it on a real project:

```sql
update public.profiles set role = 'admin' where phone = '9725XXXXXXXX';
```

Two things about `supabase/config.toml` that cost time if you don't know them:

- **Config changes need a full restart.** `npm run db:reset` re-runs migrations
  but does not rebuild the auth container's environment. Use
  `npm run db:stop && npm run db:start`.
- **`[auth.sms.test_otp]` alone does not enable phone auth.** The CLI computes
  `GOTRUE_EXTERNAL_PHONE_ENABLED = enable_signup AND (some provider enabled)`,
  so `[auth.sms.twilio]` is enabled with placeholder credentials it never
  actually uses locally.

### Going live with Twilio

Still outstanding — needs a Twilio account and a linked Supabase Cloud project.

1. Create a Twilio account and a Messaging Service that can send to Israeli
   numbers (check the alphanumeric-sender-ID and pre-registration rules for IL).
2. Put the real `account_sid` and `message_service_sid` into
   `[auth.sms.twilio]` in `supabase/config.toml` — neither is a secret, and an
   explicit value there takes precedence over the environment.
3. Put the auth token in `SUPABASE_AUTH_SMS_TWILIO_AUTH_TOKEN` (see
   `.env.example`) — never in the repo.
4. Delete or comment out `[auth.sms.test_otp]` before shipping, so the demo
   numbers stop accepting `123456`.
5. On the hosted project, set the same values under Authentication → Providers →
   Phone.

### Local Supabase ports

This project uses **5442x** instead of the Supabase default **5432x**, so it can
run alongside other local Supabase projects on the same machine without a port
clash. Configured in [supabase/config.toml](supabase/config.toml).

| Service  | URL                                   |
| -------- | ------------------------------------- |
| API      | http://127.0.0.1:54421                |
| Postgres | postgres://…@127.0.0.1:54422/postgres |
| Studio   | http://127.0.0.1:54423                |
| Mailpit  | http://127.0.0.1:54424                |

## Scripts

| Command                 | What it does                                                                                             |
| ----------------------- | -------------------------------------------------------------------------------------------------------- |
| `npm run dev`           | Dev server                                                                                               |
| `npm run build`         | Production build                                                                                         |
| `npm run start`         | Serve the production build (what `test:e2e` runs against)                                                |
| `npm run lint`          | ESLint                                                                                                   |
| `npm run typecheck`     | `next typegen && tsc --noEmit`                                                                           |
| `npm run test`          | Vitest unit tests                                                                                        |
| `npm run test:watch`    | The same, in watch mode                                                                                  |
| `npm run test:coverage` | Unit tests with coverage thresholds (see below)                                                          |
| `npm run test:e2e`      | Playwright — the critical flow, axe and the RTL sweep. Builds the app and needs the local stack up       |
| `npm run test:e2e:ui`   | The same suite in Playwright's UI mode                                                                   |
| `npm run format`        | Prettier write                                                                                           |
| `npm run format:check`  | Prettier check — what CI runs                                                                            |
| `npm run db:start`      | Start local Supabase                                                                                     |
| `npm run db:stop`       | Stop local Supabase                                                                                      |
| `npm run db:reset`      | Re-apply all migrations + `supabase/seed.sql`                                                            |
| `npm run db:test`       | pgTAP suite — RLS policy assertions                                                                      |
| `npm run db:types`      | Regenerate `lib/supabase/database.types.ts`                                                              |
| `npm run perf:postgis`  | PostGIS load check — spatial indexes and the pro feed against generated load, held to wall-clock budgets |

`npm run test:e2e` and `npm run db:test` both need Docker running and the local
Supabase stack up. The rest run against nothing.

**Coverage** is measured over the modules that are meant to be unit tested —
`lib/validation`, `lib/maps`, `lib/auth` and `lib/actions/formData.ts` — and not
over `lib/**`. Everything under `lib/supabase` and the rest of `lib/actions`
carries rules that live in RLS and in `security definer` functions, and those
are proved in pgTAP where they actually run. A number spanning both would
describe neither.

## Google Maps

Two keys, and neither is required to run the app locally:

| Variable                          | Where it runs                                  | Restrict it by |
| --------------------------------- | ---------------------------------------------- | -------------- |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | Browser — Places Autocomplete, the map embed   | HTTP referrer  |
| `GOOGLE_MAPS_SERVER_API_KEY`      | Server — Geocoding (address → `jobs.location`) | IP address     |

With neither set, the address field is an ordinary text input and the server
places the address against the built-in city gazetteer in `lib/maps/geocode.ts`.
That is approximate on purpose, and the posted job says so. Development accepts
it silently; a production build needs `ALLOW_NO_MAPS_KEY=1` to accept it, so a
deploy that simply forgot the key fails loudly instead of filing every job in
the middle of Tel Aviv.

## Database changes

Schema changes go through a migration file — never a manual edit in the Supabase
dashboard:

```bash
npx supabase migration new <name>   # creates supabase/migrations/<ts>_<name>.sql
npm run db:reset                    # re-apply from scratch and verify
npm run db:types                    # regenerate the TypeScript types
npm run db:test                     # re-check the RLS policies still hold
```

Every new table needs RLS policies **and** an assertion in
[supabase/tests/rls_test.sql](supabase/tests/rls_test.sql). Two of the tests in
there fail automatically if a table appears with RLS disabled or with no policy
at all.

## Secrets

Never commit real keys. `.env.local` is git-ignored; `.env.example` lists every
required variable and must be updated whenever a new one is introduced.

## Deployment

Vercel (Next.js) + Supabase Cloud (database, auth, storage). Both are connected
to the repository; a push to `main` deploys.

[vercel.json](vercel.json) pins serverless functions to `fra1` (Frankfurt) —
the closest region to Israel, and the one the Supabase project should also be
in. A function in Washington talking to a database in Frankfurt pays the
round trip on every query, and the screens here run four to nine of them.

Environment variables that must be set on the Vercel project:

| Variable                          | Why it matters in production                                                                                                                                                                                                                                           |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`        | The cloud project, not the local stack                                                                                                                                                                                                                                 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`   | Same                                                                                                                                                                                                                                                                   |
| `SUPABASE_SERVICE_ROLE_KEY`       | Server only. Never prefix with `NEXT_PUBLIC_`                                                                                                                                                                                                                          |
| `NEXT_PUBLIC_SITE_URL`            | **Inlined at build time.** Every canonical URL, Open Graph tag and `sitemap.xml` entry is built from it — unset, they all point at `localhost:3000` and search engines index that                                                                                      |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | Optional. Without it the address field is a plain text input                                                                                                                                                                                                           |
| `GOOGLE_MAPS_SERVER_API_KEY`      | Optional. Falls back to the browser key                                                                                                                                                                                                                                |
| `ALLOW_NO_MAPS_KEY`               | Set to `1` **only** if you accept the built-in gazetteer in production. Without a Maps key and without this flag, a production build fails on purpose — so a deploy that merely forgot the key is loud rather than silently filing every job in the middle of Tel Aviv |

`NEXT_PUBLIC_*` values are baked into the bundle at build time, so changing one
needs a redeploy, not a restart.

Two things about the deployment that are known gaps rather than settings — both
are written up in [CLAUDE.md](CLAUDE.md) section 9, and neither has been closed:
the seeded demo phone numbers still accept `123456` on the deployed site, and
the hosted project's `site_url` still points at `http://127.0.0.1:3000`.

## Connecting to the cloud Supabase project

```bash
npx supabase login
npx supabase link --project-ref <project-ref>
npx supabase db push
```
