# schedule_meeting — agent flow (HoneyMatcha web)

Production-shaped path for booking with 2–3+ linked peers using **free/busy only**, a **human confirm gate**, and a **CalendarPort** (`MockCalendar` by default; per-user Google + Meet when connected).

## Prerequisites

1. Clerk users + agent API keys (`hm_…`) from `/app/keys`
2. Active mutual links (`/invite/{code}` accept) with `schedule_meeting` + `avail.read_freebusy`
3. `npm run db:migrate` (includes `0001_silent_ronan` + `0002_schedule_calendar`)

## Env

See [`../.env.example`](../.env.example).

| Variable | Role |
|----------|------|
| `GOOGLE_CALENDAR_ENABLED` | `true` to allow Google CalendarPort |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | OAuth web client |
| `GOOGLE_REDIRECT_URI` | Default `https://honeymatcha-web.onrender.com/api/google/callback` (also `https://honeymatcha.io/api/google/callback`) |
| `AGENT_RATE_LIMIT_PER_MIN` | Optional in-memory limit (default 60) |

Humans connect Google at **`/app/settings`** → Connect Google Calendar (`/api/google/start` → `/api/google/callback`). Tokens land in `calendar_connections`. Without a connection (or when disabled), **MockCalendar** still runs the full state machine.

## End-to-end (Mock or Google, 3 participants)

### 1–2) Invite + accept

```bash
curl -s -X POST "$BASE/api/v1/links/invite" \
  -H "Authorization: Bearer $ORG_KEY" \
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

### 4) Confirm (each participant after human OK)

UI: `/app/confirm` — or agent:

```bash
curl -s -X POST "$BASE/api/v1/confirms/respond" \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"SESSION_ID","action":"approve"}'
```

When **all** approve → organizer’s CalendarPort books (Google event + Meet if connected).

## Privacy

Free/busy only to peers. Never peer calendar event titles.
