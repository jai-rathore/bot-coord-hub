---
name: bot-coord-schedule
description: Coordinate meetings with another person's agent. Prefer the HoneyMatcha skill (skills/honeymatcha) for the Next.js product (hm_ keys, /api/v1/*). This skill still covers the legacy Node hub on port 8787 (bc_ keys, /v1/*) when that service is in use.
---

# Schedule with a linked peer agent

> **Prefer HoneyMatcha:** For the product web app, use [`skills/honeymatcha/SKILL.md`](../honeymatcha/SKILL.md) (`hm_` keys, `/api/v1/*`, MCP at `/api/mcp`). The sections below remain for the legacy Node hub (`src/`, port 8787).

## When to use (legacy hub)

- User asks to book/find time with someone whose personal agent is on the legacy Bot Coord hub
- Hub base URL (dev): `http://localhost:8787`
- API key examples: `bc_jai_dev_key` / `bc_rishav_dev_key`
- Header: `Authorization: Bearer <your_key>`

## Privacy rules (hard)

- Share **free slots** or opaque busy blocks only
- **Never** send peer calendar event titles, descriptions, attendees, or notes from their calendar
- Shared meeting `title` / `notes` are only what the organizer chose for the intent

## Human control

- Default: get explicit human confirm before `meeting.confirm` / calendar write
- Only skip if user policy `auto_book` is on and the slot fits auto_book windows/max duration
- Link accept/revoke are human-only

## Legacy hub workflow

### A. Ensure link

1. `GET /v1/links?userId=<you>` — look for `status: active` with peer
2. If missing: `POST /v1/links/invite` with `{ fromUserId, fromAgentId, toEmail, toName?, scopes: ["schedule_meeting", "avail.read_freebusy"] }`
3. Tell your human the invite code / inviteUrl to share out-of-band
4. Peer accepts with `POST /v1/links/accept` `{ inviteCode, userId, agentId }`

### B. Start scheduling (organizer)

1. Parse: peerEmail/name, durationMinutes, windowStart/windowEnd, timezone, title, notes?
2. `POST /v1/agent/schedule` with those fields
3. Poll `GET /v1/agent/pending`

### C–E. Negotiate / confirm

Use `/v1/agent/respond`, `/v1/agent/propose`, `/v1/agent/confirm` as in the hub README. Free/busy only.

## HoneyMatcha product mapping

| Legacy | HoneyMatcha |
|--------|-------------|
| `bc_...` key | `hm_...` key from `/app/keys` |
| `GET /v1/me` | `GET /api/v1/me` |
| `POST /v1/links/invite` | `POST /api/v1/links/invite` |
| `POST /v1/agent/schedule` | `POST /api/v1/schedule` (session + confirm gate; calendar stubbed) |
| skill | `skills/honeymatcha/SKILL.md` |
