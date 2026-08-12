# Bot Coord Hub — Phase 4

Real HTTP hub API that agents call to coordinate across users.
Cross-user agent DMs do not exist; this hub is the bridge.

Protocol adapted from bot-coord-sim. Dogfood: Jai and Rishav.

## Product web app (`web/`)

HoneyMatcha Next.js product (Clerk auth, Postgres/Drizzle, agent API keys, intents registry, `/api/v1/*` agent API, MCP at `/api/mcp`, docs at `/docs`) lives in [`web/`](./web/). See [`web/README.md`](./web/README.md) and [`web/mcp/README.md`](./web/mcp/README.md). Grok Bot skill: [`skills/honeymatcha/SKILL.md`](./skills/honeymatcha/SKILL.md). The Node hub under `src/` remains for now.

## Quick start

cd /workspace/bot-coord-hub
use package manager to install deps
run script named dev or start

Listens on port 8787. Health: GET /health
Persistence: data/store.json

## Seed keys

- `bc_jai_dev_key` maps to usr_jai / agt_jai_cos
- `bc_rishav_dev_key` maps to usr_rishav / agt_rishav_cos
- HTTP header: `Authorization: Bearer <key>`

## Hero flow: invite then accept

### 1) Create invite (Jai)

```bash
curl -s -X POST http://localhost:8787/v1/links/invite \
  -H "Authorization: Bearer bc_jai_dev_key" \
  -H "Content-Type: application/json" \
  -d '{"fromUserId":"usr_jai","fromAgentId":"agt_jai_cos","toEmail":"sharmarishav5540@gmail.com","toName":"Rishav","scopes":["schedule_meeting","avail.read_freebusy"]}'
```

### 2) Accept invite (Rishav)

Replace INVITE_CODE from step 1.

```bash
curl -s -X POST http://localhost:8787/v1/links/accept \
  -H "Authorization: Bearer bc_rishav_dev_key" \
  -H "Content-Type: application/json" \
  -d '{"inviteCode":"INVITE_CODE","userId":"usr_rishav","agentId":"agt_rishav_cos"}'
```

### 3) Schedule (Jai)

```bash
curl -s -X POST http://localhost:8787/v1/agent/schedule \
  -H "Authorization: Bearer bc_jai_dev_key" \
  -H "Content-Type: application/json" \
  -d '{"peerEmail":"sharmarishav5540@gmail.com","durationMinutes":30,"windowStart":"2026-08-17T07:00:00.000-07:00","windowEnd":"2026-08-21T18:00:00.000-07:00","timezone":"America/Los_Angeles","title":"Product sync","notes":"Dogfood Bot Coord"}'
```

### 4-6) Negotiate

1. Rishav: GET /v1/agent/pending then post avail.offer free slots (no titles)
2. Jai: POST /v1/agent/propose with chosen slots
3. Rishav: POST /v1/agent/respond with action accept
4. Jai: POST /v1/agent/confirm after human OK unless auto_book


## API surface

| Method | Path | Notes |
|--------|------|-------|
| GET | / | public HoneyMatcha homepage (HTML; same JSON if Accept: application/json or `#honeymatcha-about`) |
| GET | /health | public |
| POST | /v1/links/invite | pending link |
| POST | /v1/links/accept | activate |
| POST | /v1/links/revoke | revoke |
| GET | /v1/links?userId= | list |
| POST | /v1/sessions | start schedule_meeting |
| POST | /v1/sessions/:id/messages | envelope or action |
| GET | /v1/sessions/:id | state + audit |
| GET | /v1/inbox?agentId= | poll transport |
| POST | /v1/inbox/:messageId/ack | ack |
| POST | /v1/agent/schedule | shortcut |
| POST | /v1/agent/respond | accept/decline/counter |
| POST | /v1/agent/propose | propose slots |
| POST | /v1/agent/confirm | confirm meeting |
| GET | /v1/agent/pending | attention queue |
| GET | /v1/me | key identity |

## Scripts

- package script: dev
- package script: start
- package script: test

## Related docs

- skills/honeymatcha/SKILL.md — HoneyMatcha Grok Bot / agent skill (prefer this)
- skills/bot-coord-schedule/SKILL.md — legacy hub skill (+ pointer to HoneyMatcha)
- web/docs (site route `/docs`) — curl + MCP copy-paste
- DOGFOOD_RISHAV.md — Jai / Rishav playbook
- INTEGRATION.md — Phase 3 UI + skill install

## Privacy

Free/busy or free slots only. Never share peer calendar event titles.

