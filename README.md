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

Open http://localhost:3000 — the Phase 0 page reports whether the build, RTL
rendering, and the Supabase connection are all working.

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

| Command             | What it does                                  |
| ------------------- | --------------------------------------------- |
| `npm run dev`       | Dev server                                    |
| `npm run build`     | Production build                              |
| `npm run lint`      | ESLint                                        |
| `npm run typecheck` | `tsc --noEmit`                                |
| `npm run format`    | Prettier write                                |
| `npm run db:start`  | Start local Supabase                          |
| `npm run db:stop`   | Stop local Supabase                           |
| `npm run db:reset`  | Re-apply all migrations + `supabase/seed.sql` |

## Database changes

Schema changes go through a migration file — never a manual edit in the Supabase
dashboard:

```bash
npx supabase migration new <name>   # creates supabase/migrations/<ts>_<name>.sql
npm run db:reset                    # re-apply from scratch and verify
```

## Secrets

Never commit real keys. `.env.local` is git-ignored; `.env.example` lists every
required variable and must be updated whenever a new one is introduced.

## Connecting to the cloud Supabase project

```bash
npx supabase login
npx supabase link --project-ref <project-ref>
npx supabase db push
```
