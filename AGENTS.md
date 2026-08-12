# AGENTS.md

## Cursor Cloud specific instructions

Monorepo with two independently-runnable products. The startup update script runs
`npm install` at the repo root and in `web/`; everything below is durable, non-obvious
context for running/testing them (standard commands live in `README.md`, `web/README.md`,
and the `scripts` blocks of each `package.json`).

### 1. bot-coord-hub (`src/`)
- Self-contained Node HTTP API on port `8787`. No database and no secrets required.
- Run `npm run dev` (tsx watch) / test with `npm test`. Health: `GET /health`. Seeded Bearer
  keys `bc_jai_dev_key` and `bc_rishav_dev_key`. State persists to `data/store.json`
  (gitignored) — delete it and restart to reseed.
- Non-obvious: `npx tsc --noEmit` reports 2 pre-existing type errors and there is no `lint`
  script. This does not block anything — the app runs through `tsx`, which does not type-check.

### 2. HoneyMatcha web (`web/`) — Next.js 16 (Turbopack) + Clerk + Postgres/Drizzle
- **Start Postgres first** — it is installed (PostgreSQL 16) but is NOT auto-started on boot:
  `sudo pg_ctlcluster 16 main start`.
- Local dev DB is already provisioned in the snapshot: database `honeymatcha`, role
  `honeymatcha` / password `honeymatcha`. Connection string (localhost ⇒ no SSL):
  `postgres://honeymatcha:honeymatcha@localhost:5432/honeymatcha`.
- Config lives in `web/.env.local` (gitignored — recreate if missing, see `web/.env.example`).
- **Clerk keys are required just to boot.** Placeholder `pk_test_...`/`sk_test_...` keys let the
  server start and serve all public pages + the Bearer-auth `/api/v1/*` agent API. But with fake
  keys every browser HTML navigation 307-redirects to Clerk's `dev-browser-missing` handshake, so
  **real Clerk test keys are required for in-browser use and human sign-in** (`/app/**`).
- **Migration gotcha:** `drizzle-kit migrate` (`npm run db:migrate`) fails silently here (spinner,
  exit 1, no tables created). Apply migrations with the drizzle-orm migrator instead — a short node
  script calling `migrate(db, { migrationsFolder: './drizzle' })` from `drizzle-orm/postgres-js/migrator`
  — or use `npm run db:push`. Then `npm run db:seed`.
- **Test gotcha:** `npm run test:e2e-lib` and `npm run test:e2e-api` load `.env` only (not
  `.env.local`), so pass the DB URL inline, e.g.
  `DATABASE_URL='postgres://honeymatcha:honeymatcha@localhost:5432/honeymatcha' npm run test:e2e-lib`.
  `test:e2e-api` also needs `npm run dev` already running on port 3000.
- `npm run build` (Turbopack) needs outbound network access to Google Fonts (`Sora`, `Fraunces`).
- `npm run lint` works but reports pre-existing errors/warnings in committed code.
- The full agent coordination flow (invite → accept → sessions → confirms) is exercised
  entirely through the Bearer API and does not require Clerk.

### Concurrent work (informational)
- Branch `cursor/honeymatcha-branding-mobile-ui-7552` (PR #13) is doing HoneyMatcha logo/favicon
  and mobile UI contrast/nav bugfixes under `web/` only. It makes no dependency, env, schema, or
  build-config changes, so it does not affect environment setup.
