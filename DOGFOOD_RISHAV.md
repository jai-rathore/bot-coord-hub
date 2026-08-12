# Dogfood playbook — Jai ↔ Rishav

Manual out-of-band setup. Do not email Rishav from the agent. Share invite materials yourself.

## Parties

- Jai: `jaiadityarathore@gmail.com` — usr_jai / agt_jai_cos — key `bc_jai_dev_key`
- Rishav: `sharmarishav5540@gmail.com` — handle rishavsharma12 — usr_rishav / agt_rishav_cos — key `bc_rishav_dev_key`
- Hub base URL (dev): http://localhost:8787 (or tunneled URL)

## Steps

### 1. Jai creates invite

Start hub (package script dev in bot-coord-hub). As Jai:

- POST /v1/links/invite with toEmail = Rishav address, scopes schedule_meeting + avail.read_freebusy
- Save inviteCode, inviteUrl, linkId

### 2. Share out-of-band with Rishav

Jai (human) sends Rishav:

1. Hub base URL
2. Invite code
3. API key for his bot: `bc_rishav_dev_key` as Bearer token
4. Copy of skills/bot-coord-schedule/SKILL.md into his agent workflow

Do not automate email from this environment.

### 3. Rishav bot accepts link

- POST /v1/links/accept with Bearer `bc_rishav_dev_key`
- Body: inviteCode + userId usr_rishav + agentId agt_rishav_cos
- Expect status active

### 4. Jai asks to book

- User: book 30m with Rishav next week
- Chief of Staff uses bot-coord-schedule skill
- POST /v1/agent/schedule with peerEmail, 30 minutes, next-week window, America/Los_Angeles, title
- Report sessionId to Jai

### 5. Rishav bot responds from pending

- GET /v1/agent/pending
- Offer free slots via avail.offer (titles stripped)
- After Jai proposes: ask Rishav human, then POST /v1/agent/respond action accept (or decline/counter)

### 6. Confirm

- Jai bot sees needs confirm_meeting
- Ask Jai unless auto_book
- POST /v1/agent/confirm
- Both humans notified in their agent chats; optional local calendar create

## Success criteria

- Active link Jai ↔ Rishav in GET /v1/links
- Session reaches state confirmed
- Audit on GET /v1/sessions/:id shows intent → avail → propose → accept → confirm
- No peer calendar titles ever appear in envelopes or logs
- Each side had a human touch on accept and confirm (default policy)

## Reset

- Delete data/store.json and restart hub to reseed users/keys
- Or POST /v1/links/revoke then create a fresh invite

