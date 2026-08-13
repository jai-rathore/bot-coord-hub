# schedule_meeting — agent flow (HoneyMatcha web)

Production path for booking with linked people using **free/busy only**,
principal-owned preferences, and a **human approval** before Google Calendar
booking. MockCalendar is development-only.

## Prerequisites

1. Humans sign in with Clerk; agents pair through `/api/v1/pairings/start`
2. Active mutual links (`/invite/{code}` accept) with `schedule_meeting` + `avail.read_freebusy`
3. `npm run db:migrate` (through `0004_organic_kylun`)

## Env

See [`../.env.example`](../.env.example).

| Variable | Role |
|----------|------|
| `GOOGLE_CALENDAR_ENABLED` | `true` to allow Google CalendarPort |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | OAuth web client |
| `GOOGLE_REDIRECT_URI` | Default `https://honeymatcha-web.onrender.com/api/google/callback` (also `https://honeymatcha.io/api/google/callback`) |
| `AGENT_RATE_LIMIT_PER_MIN` | Optional in-memory limit (default 60) |
| `TOKEN_ENCRYPTION_KEY` | Encrypt Google access and refresh tokens |
| `OAUTH_STATE_SECRET` | Expiring, browser-bound OAuth state HMAC |

Humans connect Google at **`/app/settings`**. Tokens are encrypted in
`calendar_connections`. Production refuses to simulate free/busy or booking
when a participant has no connected calendar.

## End-to-end (Google, 3 participants)

### 1–2) Invite + accept

```bash
curl -s -X POST "$BASE/api/v1/links/invite" \
  -H "Authorization: Bearer $ORG_KEY" \
  -H "Idempotency-Key: 550e8400-e29b-41d4-a716-446655440000" \
  -H "Content-Type: application/json" \
  -d '{"toEmail":"peer1@example.com","confirmRequired":true,"timezone":"America/Los_Angeles","allowedHours":{"start":"09:00","end":"17:00","days":[1,2,3,4,5]}}'

curl -s -X POST "$BASE/api/v1/links/accept" \
  -H "Authorization: Bearer $PEER1_KEY" \
  -H "Content-Type: application/json" \
  -d '{"inviteCode":"CODE"}'
```

### 3) Schedule (group)

```bash
curl -s -X POST "$BASE/api/v1/schedule" \
  -H "Authorization: Bearer $ORG_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "peerEmails":["peer1@example.com","peer2@example.com"],
    "durationMinutes":30,
    "windowStart":"2026-08-18T16:00:00.000Z",
    "windowEnd":"2026-08-18T22:00:00.000Z",
    "timezone":"UTC",
    "title":"HoneyMatcha sync"
  }'
```

### 4) Human approval

Each participant approves or declines at `/app/attention`. Default agent
connections can read what is waiting but cannot approve in the human’s place.

When **all** approve → organizer’s CalendarPort books (Google event + Meet if connected).

## Privacy

Free/busy only to peers. Never peer calendar event titles.
