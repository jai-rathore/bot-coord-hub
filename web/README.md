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
| `npm run mcp` | Stdio MCP server (`mcp/server.mjs`) |
| `npm run test:e2e-lib` | DB/lib smoke for invite → activity → confirm |
| `npm run test:e2e-api` | Bearer API smoke against a running server |

## Product surface

| Path | Access | Notes |
|------|--------|-------|
| `/` | Public | Marketing homepage (JSON if `Accept: application/json`) |
| `/docs` | Public | Agent connect docs (curl + MCP) |
| `/.well-known/honeymatcha.json` | Public | Machine-readable discovery |
| `/sign-in`, `/sign-up` | Public | Clerk |
| `/intents` | Public | Registry browse + propose (propose requires sign-in) |
| `/invite/[code]` | Public / signed-in accept | Handshake URL for a friend’s bot/human |
| `/app/**` | Clerk protected | Dashboard shell |
| `/app/keys` | Auth | Create / list / revoke hashed API keys |
| `/app/links` | Auth | Create invite URLs, accept codes, revoke mutual links |
| `/app/activity` | Auth | Session list + plain-English messages (raw JSON toggle) |
| `/app/confirm` | Auth | Approve / deny pending confirms |
| `/api/v1/*` | Bearer API key | Agent API (me, links, sessions, intents, schedule, confirms) |
| `/api/v1/openapi` | Public | OpenAPI-ish map |
| `/api/mcp` | Bearer API key | MCP JSON-RPC (`tools/list`, `tools/call`) |

Human helpers also exist under `/api/links`, `/api/sessions`, and `/api/confirms` (Clerk session).

## Agent auth

```bash
curl -s http://localhost:3000/api/v1/me \
  -H "Authorization: Bearer hm_..."

curl -s http://localhost:3000/api/v1/intents \
  -H "Authorization: Bearer hm_..."
```

Raw keys are shown once on create; only SHA-256 hashes are stored.

## MCP

- **HTTP**: `POST /api/mcp` with Bearer `hm_...` (see `/docs`)
- **Stdio**: `node mcp/server.mjs` with `HONEYMATCHA_BASE_URL` + `HONEYMATCHA_API_KEY` (see [`mcp/README.md`](./mcp/README.md))
- **Skill**: [`../skills/honeymatcha/SKILL.md`](../skills/honeymatcha/SKILL.md)

`request_schedule_meeting` (`POST /api/v1/schedule`) creates a session + human confirm gate. Calendar auto-book is stubbed until a calendar port is connected.

## Render deploy notes

1. Create a **Web Service** from this repo (or use the `honeymatcha-web` entry in root `render.yaml`).
2. **Root Directory**: `web`
3. **Build**: `npm install && npm run build`  
   Do **not** migrate/seed during build — the internal `DATABASE_URL` is not reachable from Render’s build environment.
4. **Start**: `npm run start` (Next binds to `0.0.0.0:$PORT`)
5. Set `DATABASE_URL` to the **External** Database URL (or Internal at runtime only).  
   The Drizzle/`postgres.js` client enables SSL (`sslmode=require`) for non-local hosts so the External URL works.
6. After the first deploy (or when schema changes), run migrate + seed from a shell that can reach Postgres, e.g. Render Shell / one-off job:
   ```bash
   npm run db:migrate && npm run db:seed
   ```
7. Add Clerk env vars (`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`).
8. In Clerk Dashboard, add the Render URL to allowed origins / redirect URLs.
9. Filesystem is ephemeral — use Postgres, not local files.

Optional: keep the existing hub (`src/`) as a separate Render service until the product API fully replaces it.

## Schema overview

- `users` — Clerk user sync
- `api_keys` — hashed agent secrets
- `links` — mutual peer links (`pair_link_id`, open invites allowed)
- `sessions` / `session_messages` — coordination boards
- `intent_types` / `intent_proposals` — registry (`pending` \| `live` \| `rejected`)
- `confirms` — human confirmation queue (`pending` \| `approved` \| `denied`)
