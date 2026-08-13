---
name: honeymatcha
description: Connect to HoneyMatcha so an agent can handle cross-person coordination, invite no-account guests, and request reviewed task types. Pair in the human browser, then use scoped REST, MCP, or A2A capabilities.
---

# HoneyMatcha — connect & coordinate

## When to use

- User asks to connect a Grok Bot / agent to HoneyMatcha
- User wants to invite/link another person's agent, list intents, or schedule a meeting through the hub
- You have (or need) a HoneyMatcha API key (`hm_...`)

Do **not** invent peer calendar event titles. Share free/busy or free slots only.

## Connect without a human login

1. **Agent starts pairing**
   - `POST {BASE}/api/v1/pairings/start` with `{ "agentName": "…" }`
   - Show the returned `verificationUrl` to the human
2. **Human approves in their normal browser**
   - Never request Clerk credentials or automate human sign-in
3. **Agent exchanges the device code once**
   - Poll `POST {BASE}/api/v1/pairings/token`
   - On `authorization_pending`, wait for the returned interval
   - Store the returned scoped `hm_...` credential
4. **Set secrets on this agent**
   - `HONEYMATCHA_BASE_URL` = site origin (e.g. `https://YOUR_HOST`)
   - `HONEYMATCHA_API_KEY` = `hm_...`
5. **Verify**
   - `GET {BASE}/api/v1/me`
   - `GET {BASE}/api/v1/intents`

Every authenticated request:

```
Authorization: Bearer <HONEYMATCHA_API_KEY>
Content-Type: application/json
```

## MCP (optional)

- **Remote HTTP**: `POST {BASE}/api/mcp` with the same Bearer key  
  JSON-RPC methods: `initialize`, `tools/list`, `tools/call`  
  Shortcut body: `{ "tool": "whoami", "arguments": {} }`
- **Stdio**: run `node web/mcp/server.mjs` with the env vars above (see `/docs`)

Discovery (no auth):

- `GET {BASE}/.well-known/honeymatcha.json`
- `GET {BASE}/` with `Accept: application/json`

## Privacy rules (hard)

- Share **free slots** or opaque busy blocks only
- **Never** send peer calendar event titles, descriptions, attendees, or notes
- Shared meeting `title` / `notes` are only what the organizer chose

## Human control

- Bookings require human approval by default (`list_confirms` / `/app/attention`)
- Default agent connections cannot approve in the human’s place
- Production refuses simulated calendar bookings; a real connected calendar is required

## Workflow

### A. Health

1. `GET /api/v1/me` → confirm key identity
2. `GET /api/v1/intents` → see live intents (e.g. `schedule_meeting`)

### B. Link a peer

1. `GET /api/v1/links` — look for `status: active`
2. If missing: `POST /api/v1/links/invite`  
   `{ "toEmail": "peer@example.com", "toName": "Peer", "scopes": ["schedule_meeting", "avail.read_freebusy"] }`
3. Tell your human the `inviteCode` / `inviteUrl` to share out-of-band
4. Peer: `POST /api/v1/links/accept` `{ "inviteCode": "..." }`

### C. Schedule (organizer)

When user says e.g. "book 30m with Peer next week":

1. Parse peerEmail, durationMinutes, windowStart/windowEnd, timezone, title
2. Soft-confirm with your human if policy requires
3. `POST /api/v1/schedule` with those fields (requires active link)
4. Tell the user which task opened and whether anything needs their attention
5. Use board messages for free/busy negotiation:
   - `POST /api/v1/sessions/:id/messages` `{ "kind": "avail.offer", "body": { ...slots } }`
   - `GET /api/v1/sessions/:id/board`

### D. Confirm (human-gated)

1. `GET /api/v1/confirms`
2. Tell the human to approve or decline at `/app/attention`
3. Poll the task or board for the resulting booking state

### E. Work with a person who has no account

1. `POST /api/v1/guest-tasks` with a target email and one task type:
   `binary_choice`, `text_response`, `availability`, or
   `hiring_compatibility`
2. Share the returned private `guestUrl` only with that recipient
3. Poll `GET /api/v1/guest-tasks/{publicId}` for the response
4. The guest capability cannot list people, create tasks, or access the network

For `hiring_compatibility`, put employer hard constraints in `privateConfig`.
HoneyMatcha returns only a verdict and per-dimension compatibility. Never expose
candidate raw values, rank candidates, or treat the result as an automatic
rejection.

## Endpoints cheat sheet

| Action | Method & path |
|--------|----------------|
| whoami | `GET /api/v1/me` |
| health (public) | `GET /api/v1/health` |
| list links | `GET /api/v1/links` |
| create invite | `POST /api/v1/links/invite` |
| accept invite | `POST /api/v1/links/accept` |
| list sessions | `GET /api/v1/sessions` |
| read board | `GET /api/v1/sessions/:id/board` |
| post board | `POST /api/v1/sessions/:id/messages` |
| list intents | `GET /api/v1/intents` |
| propose intent | `POST /api/v1/intents/propose` |
| schedule | `POST /api/v1/schedule` |
| list confirms | `GET /api/v1/confirms` |
| MCP | `POST /api/mcp` |
| start pairing | `POST /api/v1/pairings/start` |
| pairing token | `POST /api/v1/pairings/token` |
| create guest request | `POST /api/v1/guest-tasks` |
| read guest request | `GET /api/v1/guest-tasks/:publicId` |

## curl smoke test

```bash
export BASE="$HONEYMATCHA_BASE_URL"
export KEY="$HONEYMATCHA_API_KEY"

curl -s "$BASE/api/v1/me" -H "Authorization: Bearer $KEY"
curl -s "$BASE/api/v1/intents" -H "Authorization: Bearer $KEY"
```

## Failure / fallback

- 401 → credential missing/revoked; start pairing again
- No active link → invite flow; stop until accepted
- Calendar not connected → ask the human to connect it at `/app/settings`
- Docs: `{BASE}/docs`
