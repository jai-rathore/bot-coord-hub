# HoneyMatcha Web

Next.js (App Router) product app for HoneyMatcha — a handshake URL for bots.

Humans sign in with Clerk, create agent API keys, and agents call Bearer-auth APIs. The existing Node hub under repo `src/` remains untouched for now.

## Stack

- Next.js + TypeScript + Tailwind
- Clerk (`@clerk/nextjs`) — Google + email
- Postgres via `DATABASE_URL` (Render Postgres)
- Drizzle ORM + `postgres.js`

## Local setup

```bash
cd web
cp .env.example .env.local
# Fill in Clerk keys + DATABASE_URL (never commit secrets)
npm install
npm run db:migrate
npm run db:seed
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Environment

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk publishable key |
| `CLERK_SECRET_KEY` | Clerk secret key |
| `DATABASE_URL` | Postgres connection string |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | Optional, default `/sign-in` |
| `NEXT_PUBLIC_CLERK_SIGN_UP_URL` | Optional, default `/sign-up` |

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Dev server |
| `npm run build` | Production build |
| `npm run start` | Start production server (`0.0.0.0:$PORT` via Next) |
| `npm run db:generate` | Generate Drizzle migrations from schema |
| `npm run db:migrate` | Apply migrations |
| `npm run db:seed` | Seed `intent_types` with `schedule_meeting` (live) |
| `npm run db:studio` | Drizzle Studio |

## Product surface

| Path | Access | Notes |
|------|--------|-------|
| `/` | Public | Marketing homepage |
| `/sign-in`, `/sign-up` | Public | Clerk |
| `/intents` | Public | Registry browse + propose (propose requires sign-in) |
| `/app/**` | Clerk protected | Dashboard shell |
| `/app/keys` | Auth | Create / list / revoke hashed API keys |
| `/api/v1/me` | Bearer API key | Agent key health |
| `/api/v1/links` | Bearer API key | List links (stub) |

Stub dashboard pages (Links, Activity, Confirm) have clear TODOs; schema already supports them.

## Agent auth

```bash
curl -s http://localhost:3000/api/v1/me \
  -H "Authorization: Bearer hm_..."
```

Raw keys are shown once on create; only SHA-256 hashes are stored.

## Render deploy notes

Do **not** require production deploy for this foundation PR. When ready:

1. Create a **Web Service** from this repo.
2. **Root Directory**: `web`
3. **Build**: `npm install && npm run db:migrate && npm run db:seed && npm run build`
4. **Start**: `npm run start` (Next binds to `PORT`; Render sets this)
5. Attach **Render Postgres** and set `DATABASE_URL` to the internal connection string.
6. Add Clerk env vars (`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`).
7. In Clerk Dashboard, add the Render URL to allowed origins / redirect URLs.
8. Remember: filesystem is ephemeral — use Postgres, not local files.

Optional: keep the existing hub (`src/`) as a separate Render service until the product API fully replaces it.

## Schema overview

- `users` — Clerk user sync
- `api_keys` — hashed agent secrets
- `links` — mutual peer links
- `sessions` / `session_messages` — coordination boards
- `intent_types` / `intent_proposals` — registry (`pending` \| `live` \| `rejected`)
- `confirms` — human confirmation audit
