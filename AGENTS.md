# AGENTS.md

## Cursor Cloud specific instructions

Monorepo with two independently-runnable products. The startup update script runs
`npm install` at the repo root and in `web/`; everything below is durable, non-obvious
context for running/testing them (standard commands live in `README.md`, `web/README.md`,
and the `scripts` blocks of each `package.json`).

### 1. bot-coord-hub (`src/`)
- Self-contained Node HTTP API on port `8787`. No database and no secrets required.
- Run `npm run dev` (tsx watch) / test with `npm test`. Health: `GET /health`.
  Legacy local Bearer keys are generated per process unless explicit
  `LEGACY_*_KEY` variables are set. State persists to `data/store.json`
  (gitignored) — delete it and restart to reseed. Production serves only a
  retirement tombstone unless `ENABLE_LEGACY_HUB=true`.
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
  keys every browser HTML navigation 307-redirects to Clerk's `dev-browser-missing` handshake.
- **Human sign-in on localhost needs Clerk _development_ keys (`pk_test_`/`sk_test_`).** With real
  keys the public pages render in the browser and `/app/**` correctly redirects to `/sign-in`.
  However, **production keys (`pk_live_`/`sk_live_`) are rejected on `localhost`** — ClerkJS throws
  "Production Keys are only allowed for domain 'honeymatcha.io'" and the sign-in widget renders
  blank. Use a Clerk _development_ instance's keys (which allow localhost) to test human sign-in
  and the signed-in dashboard locally.
- `npm run db:migrate` uses the drizzle-orm runtime migrator (not the unreliable
  `drizzle-kit migrate` path). Follow it with `npm run db:seed`, then run
  `PREFLIGHT_PRODUCTION=true npm run db:preflight` before production deploys.
- **Test gotcha:** `npm run test:e2e-lib` and `npm run test:e2e-api` load `.env` only (not
  `.env.local`), so pass the DB URL inline, e.g.
  `DATABASE_URL='postgres://honeymatcha:honeymatcha@localhost:5432/honeymatcha' npm run test:e2e-lib`.
  `test:e2e-api` also needs `npm run dev` already running on port 3000.
- `npm run build` (Turbopack) needs outbound network access to Google Fonts (`Sora`, `Fraunces`).
- `npm run lint` is expected to pass cleanly.
- Pairing, guest capability, A2A, invite, session, scheduling, and approval
  boundaries are exercised without Clerk by the integration scripts.

### Concurrent work (informational)
- Branch `cursor/honeymatcha-branding-mobile-ui-7552` (PR #13) is doing HoneyMatcha logo/favicon
  and mobile UI contrast/nav bugfixes under `web/` only. It makes no dependency, env, schema, or
  build-config changes, so it does not affect environment setup.
