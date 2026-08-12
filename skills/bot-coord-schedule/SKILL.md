---
name: bot-coord-schedule
description: Coordinate meetings with another person's agent via the Bot Coord hub when the user asks to book time with someone whose bot is linked on Bot Coord. Use for cross-user scheduling (invite/accept links, poll pending, propose/accept slots, confirm). Prefer free/busy only; never share peer calendar event titles.
---

# Bot Coord — schedule with a linked peer agent

## When to use

- User asks to book/find time with someone whose personal agent is on Bot Coord
- You need to invite/accept a Bot Coord link before scheduling
- You need to respond to a peer agent's proposal (accept / decline / counter)

Do **not** use for same-account multi-agent chat. Cross-user agent DMs do not exist; the hub is the bridge.

## Config

- Hub base URL (dev): `http://localhost:8787`
- Your API key: stored in agent state / env (examples: `bc_jai_dev_key` for Jai, `bc_rishav_dev_key` for Rishav)
- Every request: header `Authorization: Bearer <your_key>`
- Content-Type: application/json for POST bodies

## Privacy rules (hard)

- Share **free slots** or opaque busy blocks only
- **Never** send peer calendar event titles, descriptions, attendees, or notes from their calendar
- Shared meeting `title` / `notes` are only what the organizer chose for the intent

## Human control

- Default: get explicit human confirm before `meeting.confirm` / calendar write
- Only skip if user policy `auto_book` is on and the slot fits auto_book windows/max duration
- Link accept/revoke are human-only

## Workflow

### A. Ensure link

1. `GET /v1/links?userId=<you>` — look for `status: active` with peer
2. If missing: `POST /v1/links/invite` with `{ fromUserId, fromAgentId, toEmail, toName?, scopes: ["schedule_meeting", "avail.read_freebusy"] }`
3. Tell your human the invite code / inviteUrl to share out-of-band
4. Peer accepts with `POST /v1/links/accept` `{ inviteCode, userId, agentId }`

### B. Start scheduling (organizer)

When user says e.g. "book 30m with Rishav next week":

1. Parse: peerEmail/name, durationMinutes, windowStart/windowEnd, timezone, title, notes?
2. Confirm lightly with user if policy requires
3. `POST /v1/agent/schedule` with those fields
4. Tell user negotiation started; poll `GET /v1/agent/pending`

### C. Invitee side

On each turn / timer:

1. `GET /v1/agent/pending`
2. If `needs: offer_availability`: compute free slots from calendar freebusy/suggest_time (titles stripped) → `POST /v1/sessions/:id/messages` with `action: "avail.offer"` and payload `{ format: "free_slots", timezone, durationMinutes, slots, opaqueBusy: null, expiresAt }`
3. If `needs: vote_on_proposal`: show slot(s) + title to **your** human → `POST /v1/agent/respond` `{ sessionId, action: "accept"|"decline"|"counter", slot? }`
4. Ack inbox items: `POST /v1/inbox/:messageId/ack`

### D. Organizer after avail

1. Intersect peer free slots with your user's free times
2. Soft-confirm chosen slot with organizer human if needed
3. `POST /v1/agent/propose` `{ sessionId, slots: [{ start, end, timezone, rank }] }`
4. When pending shows `needs: confirm_meeting` and human OK (or auto_book): `POST /v1/agent/confirm` `{ sessionId }` then create calendar event locally

### E. Notify

After confirmed: tell your human the time, shared title, and calendar link. Do not invent peer calendar private details.

## Endpoints cheat sheet

- Links: `/v1/links/invite`, `/v1/links/accept`, `/v1/links/revoke`, `/v1/links`
- Sessions: `/v1/sessions`, `/v1/sessions/:id`, `/v1/sessions/:id/messages`
- Inbox poll: `/v1/inbox`, `/v1/inbox/:messageId/ack`
- Agent shortcuts: `/v1/agent/schedule`, `/v1/agent/respond`, `/v1/agent/propose`, `/v1/agent/confirm`, `/v1/agent/pending`

## Failure / fallback

- No active link → invite flow, stop until accepted
- `no_overlap` / declined → tell human; offer to widen window or draft a manual message
- Timeout / expired session → start a new session or hand off to human

