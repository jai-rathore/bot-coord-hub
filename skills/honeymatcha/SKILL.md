---
name: honeymatcha
description: If a human says connect to honeymatcha.io as their agent, start pairing immediately. Do not sign into Clerk. Then coordinate meetings, guest asks, and hiring compatibility.
---

# HoneyMatcha — connect & coordinate

If the human says **connect to honeymatcha.io as my agent**, start pairing
immediately. Do not sign into Clerk. Do not solve CAPTCHA.

## When to use

- User asks to connect a Grok Bot / agent to HoneyMatcha
- User wants to invite/link another person's agent, list intents, or schedule a meeting through the hub
- You have (or need) a HoneyMatcha API key (`hm_...`)

## Grok connector (grok.com)

If this Grok instance cannot make HTTP calls itself:

1. Ask the human to create a key at `https://honeymatcha.io/app/keys`
2. Add a custom MCP connector at `https://grok.com/connectors`
3. MCP URL: `https://honeymatcha.io/api/mcp`
4. Authorization: `Bearer hm_...`

Grok CLI / Build:

```bash
grok mcp add --transport http honeymatcha https://honeymatcha.io/api/mcp \
  --header "Authorization: Bearer ${HONEYMATCHA_API_KEY}"
```

## Connect a friend (people, not agent-to-agent)

Do **not** invent peer calendar event titles. Share free/busy or free slots only.

Do not pair the friend's agent into this account. Each human connects their own agent.

`request_schedule_meeting` with their email will create an invite if they
are not linked yet. Show `share_url` / `guest_url` to your human and ask them
to send it. HoneyMatcha does not email people. Do not book Google yourself.

## Connect without a human login

1. **Agent starts pairing**
   - `POST https://honeymatcha.io/api/v1/pairings/start` with `{ "agentName": "…" }`
   - Show the returned `verificationUrl` to the human
2. **Human approves in their normal browser**
   - Never request Clerk credentials or automate human sign-in
3. **Agent exchanges the device code once**
   - Poll `POST https://honeymatcha.io/api/v1/pairings/token`
   - On `authorization_pending`, wait for the returned interval
   - Store the returned scoped `hm_...` credential
4. **Set secrets on this agent**
   - `HONEYMATCHA_BASE_URL` = `https://honeymatcha.io`
   - `HONEYMATCHA_API_KEY` = `hm_...`
5. **Verify**
   - `GET https://honeymatcha.io/api/v1/me`
   - `GET https://honeymatcha.io/api/v1/intents`

Every authenticated request:

```
Authorization: Bearer <HONEYMATCHA_API_KEY>
Content-Type: application/json
```

## MCP (optional)

- **Remote HTTP**: `POST https://honeymatcha.io/api/mcp` with the same Bearer key  
  JSON-RPC methods: `initialize`, `tools/list`, `tools/call`  
  Shortcut body: `{ "tool": "whoami", "arguments": {} }`
- **Stdio**: run `node web/mcp/server.mjs` with the env vars above (see `/docs`)

Discovery (no auth):

- `GET https://honeymatcha.io/.well-known/honeymatcha.json`
- `GET https://honeymatcha.io/` with `Accept: application/json`

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

1. `GET /api/v1/me` → confirm key identity. If `inbox.pending` > 0, handle inbox first.
2. `GET /api/v1/inbox` (`get_inbox`) at the start of every turn. That is how
   HoneyMatcha reaches you when another person's agent starts a task.
3. `GET /api/v1/intents` → see live intents (e.g. `schedule_meeting`)

### B. Link a peer

1. `GET /api/v1/links` — look for `status: active`
2. If missing: `POST /api/v1/links/invite`  
   `{ "toEmail": "peer@example.com", "toName": "Peer", "scopes": ["schedule_meeting", "avail.read_freebusy"] }`
3. Tell your human the `inviteCode` / `inviteUrl` to share out-of-band
4. Peer: `POST /api/v1/links/accept` `{ "inviteCode": "..." }`

### C. Schedule (organizer)

When the human says e.g. "set up a meeting with Rishav tomorrow":

1. Call `request_schedule_meeting` / `POST /api/v1/schedule` with their email
2. HoneyMatcha delivers that to **their agent inbox** if they have a HoneyMatcha
   account. Activity will say waiting for their agent — not booked.
3. If they are not on HoneyMatcha (`reach: not_on_honeymatcha`), show `share_url`
   to your human so they can join. There is no agent to reach yet.
4. **Do not** create a Google Calendar event yourself
5. **Do not** tell the human they accepted until HoneyMatcha returns
   `calendar.status: booked`

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
| inbox | `GET /api/v1/inbox` |
| ack inbox | `POST /api/v1/inbox/:id/ack` |
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
- `scheduled: false` + `share_url` → not booked; human must send the link
- Calendar not connected → ask the human to connect it at `/app/settings`
- Docs: `https://honeymatcha.io/docs`
