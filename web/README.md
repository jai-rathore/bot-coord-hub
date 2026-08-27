# HoneyMatcha Web

Next.js product app for HoneyMatcha — let your agent handle the back-and-forth.

Humans sign in with Clerk and approve short-lived agent pairings. Scoped agents
coordinate through REST, MCP, or A2A; no-account guests receive one-task
capabilities. The old Node hub under `src/` is not deployed by the Blueprint.

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
| `ENABLE_SAGE_JOBS` | Production gate for durable hosted Sage tasks |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | Optional, default `/sign-in` |
| `NEXT_PUBLIC_CLERK_SIGN_UP_URL` | Optional, default `/sign-up` |
| `RESEND_API_KEY` | Event notification email. Without it, email outbox rows stay queued. |
| `EVENT_EMAIL_FROM` | Resend From address. Use `HoneyMatcha <onboarding@resend.dev>` until `honeymatcha.io` is verified. |
| `TWILIO_ACCOUNT_SID` | Twilio account SID for event texts. |
| `TWILIO_AUTH_TOKEN` | Twilio auth token. Without Twilio, SMS outbox rows stay queued. |
| `TWILIO_FROM_NUMBER` | Feature flag + Twilio From number (`+15551234567`). Unset hides Text and skips SMS. |
| `TWILIO_MESSAGING_SERVICE_SID` | Optional. Use instead of `TWILIO_FROM_NUMBER` after A2P 10DLC. |

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Dev server |
| `npm run build` | Production build |
| `npm run start` | Start production server (`0.0.0.0:$PORT` via Next) |
| `npm run db:generate` | Generate Drizzle migrations from schema |
| `npm run db:migrate` | Apply migrations |
| `npm run db:preflight` | Verify schema, secrets, calendar safety, and seed |
| `npm run db:seed` | Seed live scheduling and hiring-compatibility tasks |
| `npm run db:studio` | Drizzle Studio |
| `npm run mcp` | Stdio MCP server (`mcp/server.mjs`) |
| `npm run test:e2e-lib` | DB/lib smoke for invite → activity → confirm |
| `npm run test:e2e-api` | Bearer API smoke against a running server |
| `npm run test:e2e-platform` | Pairing + guest + A2A integration smoke |
| `npm run events:tick` | Lock/expire events and drain the outbox (needs Resend and/or Twilio to send) |
| `npm run sage:worker` | Run the durable hosted Sage queue consumer |
| `npm run email:test -- you@example.com` | Send one Resend test email |
| `npm run sms:test -- +15551234567` | Send one Twilio test text |

## Product surface

| Path | Access | Notes |
|------|--------|-------|
| `/` | Public | Marketing homepage (JSON if `Accept: application/json`) |
| `/docs` | Public | Agent connect docs (curl + MCP) |
| `/agents` | Public | Agent pairing, MCP, A2A, and task catalog |
| `/.well-known/agent-card.json` | Public | A2A v1 Agent Card |
| `/.well-known/honeymatcha.json` | Public | Machine-readable discovery |
| `/sign-in`, `/sign-up` | Public | Clerk |
| `/agents/tasks` | Public | Supported tasks + signed-in task requests |
| `/[handle]` | Public | Durable agent contact page; JSON if `Accept: application/json` |
| `/setup` | Auth | First-login handle claim |
| `/guest/[publicId]` | Public capability | One targeted, expiring guest request |
| `/invite/[code]` | Public / signed-in accept | Targeted relationship invitation |
| `/join/[token]` | Public / signed-in request | Signed, reusable public connection invitation |
| `/app/**` | Clerk protected | Dashboard shell |
| `/app/tasks` | Auth | Task history + request a new task type |
| `/app/recruiting` | Auth | Choose candidate or employer mode, activate structured private criteria, and create/revise targeted alignment memos |
| `/app/agent` | Auth | Ask Sage to schedule and choose the primary operator |
| `/app/discovery` | Auth | Approve discovery profiles and ask Sage to search anonymously |
| `/app/people` | Auth | Private invites, public links/QRs, approvals, and revocation |
| `/app/attention` | Auth | Human-only approvals |
| `/app/activity` | Auth | Session list + plain-English messages (raw JSON toggle) |
| `/app/settings` | Auth | Connect Google Calendar |
| `/api/google/start` | Auth | Begin Google OAuth |
| `/api/google/callback` | Public (OAuth) | OAuth redirect |
| `/api/v1/*` | Bearer API key | Agent API (me, links, public invites, sessions, intents, schedule, confirms) |
| `/api/v1/pairings/*` | Public, short-lived | Device-style agent connection |
| `/api/v1/guest-tasks/*` | Scoped agent | Create/read/revoke guest capabilities and notify/revise hiring requests |
| `/api/v1/hiring/requests/*` | Scoped candidate agent | Read and answer hiring requests addressed to its human |
| `/api/guest/tasks/*` | Guest capability | Read/respond to exactly one guest task |
| `/api/a2a` | Scoped agent | A2A v1 JSON-RPC (`SendMessage`, `GetTask`) |
| `/api/v1/openapi` | Public | OpenAPI-ish map |
| `/api/mcp` | Bearer API key | MCP JSON-RPC (`tools/list`, `tools/call`) |

Human helpers also exist under `/api/links`, `/api/sessions`, and `/api/confirms` (Clerk session).

## Agent pairing

Agents do not sign into Clerk. Start a pairing, ask the human to approve the
verification URL in their normal browser, then exchange the device code once:

```bash
curl -s http://localhost:3000/api/v1/pairings/start \
  -H "Content-Type: application/json" \
  -d '{"agentName":"My assistant"}'

curl -s http://localhost:3000/api/v1/pairings/token \
  -H "Content-Type: application/json" \
  -d '{"deviceCode":"hp_..."}'
```

Manual `hm_` credentials remain available as an advanced fallback.

```bash
curl -s http://localhost:3000/api/v1/me \
  -H "Authorization: Bearer hm_..."

curl -s http://localhost:3000/api/v1/intents \
  -H "Authorization: Bearer hm_..."
```

Raw keys are shown once on create; only SHA-256 hashes are stored. Revoke soft-sets `revoked_at`. Auth updates `last_used_at`. Agent routes are lightly rate-limited.

## schedule_meeting + Google Calendar

Documented flow: [`docs/SCHEDULE_MEETING.md`](./docs/SCHEDULE_MEETING.md).

`POST /api/v1/schedule` → free/busy propose → human approval → book on all approvals via per-user **Google** with Meet. MockCalendar is local-only; production fails closed. Supports `peerEmails` for groups. Each principal owns their own relationship policy.

Humans connect Google at `/app/settings` (`GOOGLE_CALENDAR_ENABLED`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`).

## Hosted Sage

Architecture and rollout plan: [`docs/SAGE_PARITY.md`](./docs/SAGE_PARITY.md).

The web process validates and enqueues Sage requests; `npm run sage:worker`
claims them from Postgres with leases and retries. Sage and connected agents use
the same capability definitions and domain services. Scheduling and discovery
remain human-gated at booking and introduction boundaries.

## hiring_compatibility

The recruiting UI first asks whether the human is looking for work or hiring.
It uses controlled role, level, employment, work-mode, and sponsorship choices,
currency-tagged annual compensation, and canonical city anchors with an explicit
vicinity radius. Agents can call `draft_hiring_role` with a job URL or pasted description to
extract a reviewable mandate, then create a targeted `hiring_compatibility`
guest task with the same company, role, compensation, equity, work, timing, and
scope terms in `privateConfig`. After
explicit recruiter approval, HoneyMatcha can notify a paired candidate agent;
people without an agent use the same no-account guest link. Candidates choose
gap-only or exact approved sharing and whether revised outreach is welcome.
Recruiters may update adjustable terms, re-run the encrypted comparison, and
inform the candidate agent. A `ready_for_intro` result still requires both
humans' final yes. The result never ranks or automatically rejects candidates.

## MCP

- **HTTP**: `POST /api/mcp` with Bearer `hm_...` (see `/docs`)
- **Stdio**: `node mcp/server.mjs` with `HONEYMATCHA_BASE_URL` + `HONEYMATCHA_API_KEY` (see [`mcp/README.md`](./mcp/README.md))
- **Skill**: [`../skills/honeymatcha/SKILL.md`](../skills/honeymatcha/SKILL.md)

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
   npm run db:migrate
   npm run db:seed
   PREFLIGHT_PRODUCTION=true npm run db:preflight
   ```
7. Add Clerk env vars (`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`).
   Production requires **`pk_live_` / `sk_live_`** and **Custom Google OAuth** in the Clerk Dashboard — see [`docs/CLERK_PRODUCTION.md`](./docs/CLERK_PRODUCTION.md).
8. In Clerk Dashboard, add the Render URL (and `https://honeymatcha.io`) to allowed origins / redirect URLs.
9. Filesystem is ephemeral — use Postgres, not local files.

Optional: keep the existing hub (`src/`) as a separate Render service until the product API fully replaces it.

## Schema overview

- `users` — Clerk user sync
- `api_keys` — hashed agent secrets (revoke sets `revoked_at`; auth rejects immediately)
- `links` — mutual peer links and approval-gated public connection requests
- `public_invites` — signed reusable share links with expiry, request caps, and revocation
- `sessions` / `session_messages` — coordination boards
- `session_participants` — multi-party (3+) membership
- `intent_types` / `intent_proposals` — registry (`pending` \| `live` \| `rejected`); proposals carry triage recommendation/reason
- `confirms` — human confirmation queue (`pending` \| `approved` \| `denied`)
- `audit_logs` — append-only (key create/revoke, invite accept, confirm decisions, intent publish/reject/triage)
- `calendar_connections` — per-user encrypted Google OAuth tokens
- `guest_tasks` / `guest_responses` — invitation-scoped no-account participation
- `agent_pairings` — expiring, browser-approved agent connections
- `agent_operator_preferences` — Sage/connected-agent arbitration per user
- `sage_jobs` / `sage_runs` / `sage_steps` — durable hosted-agent work and redacted execution audit

Agent and guest surfaces are rate-limited. Intent triage worker:
`POST /api/v1/intents/triage` with `TRIAGE_SECRET`. Only configured admins can
publish requested task types at `/app/admin/intents`.
