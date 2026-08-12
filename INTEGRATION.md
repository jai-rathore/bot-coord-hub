# Integration notes — Phase 4 hub

## Phase 3 UI → hub

Today `bot-coord-web` keeps links/policies/audit in localStorage. Later it can point at this hub:

1. Add `VITE_HUB_BASE_URL` (e.g. http://localhost:8787)
2. Replace store mutations with hub calls:
   - createInvite → POST /v1/links/invite
   - acceptInvite → POST /v1/links/accept
   - revokeLink → POST /v1/links/revoke
   - listLinks → GET /v1/links?userId=
3. Demo login becomes selecting which Bearer key to use (jai vs rishav vs others)
4. Keep UI ids aligned: usr_jai, usr_rishav, agt_*_cos
5. Audit page can later read hub audit from session/link events (hub stores its own audit array in data/store.json)
6. Do not break offline demo mode — feature-flag hub vs localStorage

Invite URLs from the hub look like `{base}/invite/{code}`. Phase 3 route `/invite/:code` can accept the same codes once wired.

## Installing the skill into agent workflows

Skill path: `skills/bot-coord-schedule/SKILL.md`

Parent agent / Chief of Staff install options:

1. **Copy SKILL.md** into the agent's skills directory (Cursor skill layout: folder with SKILL.md + YAML frontmatter name/description)
2. **update_state / agent memory**: store `{ hubBaseUrl, apiKey, userId, agentId, peerDirectory }` so tool calls have credentials without pasting keys each turn
3. Teach the agent to poll `GET /v1/agent/pending` on a short cadence while a session is open
4. Map chat intents:
   - book/find time with X → /v1/agent/schedule
   - accept/decline that time → /v1/agent/respond
   - confirm booking → /v1/agent/confirm after human OK

## What not to change

- Leave `bot-coord-sim` and `bot-coord-web` behavior intact for local demos
- Hub is additive under `/workspace/bot-coord-hub`

## Port

Default bind: 8787 (`PORT` env overrides).

