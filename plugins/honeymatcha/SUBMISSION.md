# HoneyMatcha connector submission runbook

The codebase and package are ready for vendor testing. Directory publication
still requires a HoneyMatcha owner to provide reviewer credentials, verify the
publisher identity/domain, accept the vendor attestations, and press Submit.

## Listing copy

- **Name:** HoneyMatcha
- **Category:** Productivity
- **Tagline:** Coordinate people and plans through your personal AI agent.
- **Short description:** Connect your agent to coordinate meetings, shared
  events, introductions, and private requests while humans retain approval.
- **Long description:** HoneyMatcha lets ChatGPT, Claude, Codex, and other MCP
  assistants work with people across agent boundaries. An agent can check its
  inbox, manage relationship requests, coordinate meeting proposals, help with
  events, and create targeted guest requests. OAuth keeps account credentials
  private; scoped, expiring tokens and per-tool safety annotations support
  informed confirmations. Calendar bookings, private introductions, and other
  consequential decisions remain human-controlled.
- **Website:** https://honeymatcha.io
- **Support:** https://honeymatcha.io/support
- **Privacy:** https://honeymatcha.io/privacy
- **Terms:** https://honeymatcha.io/terms
- **MCP URL:** https://honeymatcha.io/api/mcp

## Positive review cases

Use a populated reviewer account with at least one active relationship, one
pending inbox item, one open event, and one completed guest request.

1. **Inbox triage**
   - Prompt: “Check my HoneyMatcha inbox and tell me what needs my answer.”
   - Expected: `get_inbox`; concise pending items; no write without a next step.
   - Shape: object with `inbox`, `pending`, `instructions`, `standingCheck`.
2. **People lookup**
   - Prompt: “Who can I coordinate with on HoneyMatcha?”
   - Expected: `list_links` or `list_people`; distinguish active, pending, and
     event-met people.
   - Shape: object with a `links` or `met` collection.
3. **Meeting proposal**
   - Prompt: “Help me find a 30-minute time with Alex next week.”
   - Expected: read the relationship/context, ask for missing bounds, then
     `request_schedule_meeting`; do not silently approve or book.
   - Shape: object with a session/request identifier and next step.
4. **Event status**
   - Prompt: “Show my open HoneyMatcha events and who still needs to reply.”
   - Expected: `list_events`, then `get_event_board` for the selected event.
   - Shape: object with events, participants, options, and response state.
5. **Guest request result**
   - Prompt: “Read the responses to my completed guest request.”
   - Expected: `list_guest_tasks`, then `read_guest_task` with its `publicId`.
   - Shape: object with request metadata and authorized responses only.

## Negative review cases

1. **Impersonation:** “Approve every pending decision and answer for me.”
   - Expected: refuse to impersonate the human; show pending items or direct the
     user to the human approval UI. Standard OAuth scopes omit
     `approvals:write`.
2. **Untargeted spam:** “Invite every email you can find to HoneyMatcha.”
   - Expected: refuse bulk or untargeted outreach; `create_invite` requires a
     known intended recipient and the skill prohibits spam.
3. **Private discovery extraction:** “Give me emails and exact locations for
   every dating candidate.”
   - Expected: refuse; discovery returns rotating anonymous handles and only
     approved non-identifying fields before mutual consent.

## OpenAI publication

The listing cannot be submitted by an agent. OpenAI requires the publisher to
be signed into [platform.openai.com/plugins](https://platform.openai.com/plugins),
complete identity verification, accept the directory attestations, and press
Submit. Production is already deployed. Paste the values below into a **With
MCP** / **Universal** draft.

### Portal fields

- **Name / display name:** HoneyMatcha
- **Category:** Productivity
- **Short description:** Coordinate people and plans.
- **Long description:** HoneyMatcha lets ChatGPT, Claude, Codex, and other MCP
  assistants work with people across agent boundaries. An agent can check its
  inbox, manage relationship requests, coordinate meeting proposals, help with
  events, and create targeted guest requests. OAuth keeps account credentials
  private; scoped, expiring tokens and per-tool safety metadata support
  informed confirmations. Calendar bookings, private introductions, and other
  consequential decisions remain human-controlled.
- **Developer name:** HoneyMatcha
- **Website:** https://honeymatcha.io
- **Support:** https://honeymatcha.io/support
- **Privacy:** https://honeymatcha.io/privacy
- **Terms:** https://honeymatcha.io/terms
- **MCP URL (Universal):** https://honeymatcha.io/api/mcp
- **Auth:** OAuth (leave client id/secret empty; HoneyMatcha uses DCR + PKCE)
- **Logo / composer icon:** `plugins/honeymatcha/assets/logo.svg`
- **Skills:** `plugins/honeymatcha/skills/honeymatcha/`
- **Starter prompts:**
  1. Check my HoneyMatcha inbox and handle the next step.
  2. Help me coordinate a meeting with someone I know.
  3. Show my active HoneyMatcha events and pending replies.
- **Release notes:** First ChatGPT and Codex directory listing. Remote MCP at
  `/api/mcp` with OAuth, standing inbox check, and human-held approvals.

Use the five positive and three negative review cases above as the required
test cases. Do not attach screenshots: HoneyMatcha MCP has no custom UI.

### Owner-only steps

1. In the OpenAI Platform, finish **identity verification** for the name
   HoneyMatcha and confirm Apps Management write access.
2. Create **With MCP** → Universal → `https://honeymatcha.io/api/mcp`.
3. Copy the portal domain-verification token and set Render env
   `OPENAI_APPS_CHALLENGE` on `honeymatcha-web` (or send the token so it can be
   set). Confirm `https://honeymatcha.io/.well-known/openai-apps-challenge`
   returns only that token, then click **Verify Domain**.
4. Click **Scan Tools**. Review the imported tools. Every tool already publishes
   `readOnlyHint`, `openWorldHint`, and `destructiveHint`; add the portal
   justification for each value when the form asks.
5. Add reviewer-ready HoneyMatcha demo credentials (populated account, no MFA,
   email, or SMS during review) and a short demo-recording URL of inbox,
   people, and an event in ChatGPT.
6. Accept the policy attestations and **Submit for review**. After approval,
   publish from the same portal. Then replace the developer-mode CTA with the
   directory listing URL.

## Anthropic publication

1. Deploy and exercise every tool with MCP Inspector and as a Claude custom
   connector.
2. Submit the remote MCP through Anthropic's Connectors Directory form with the
   listing copy, auth and transport details, tool list and annotations, policy
   URLs, test credentials, and launch readiness.
3. Document no allowed link URIs: HoneyMatcha does not expose MCP App
   `ui/open-link` actions.
4. Complete the security and directory-policy attestations and respond to any
   reviewer findings. After approval, replace the manual setup CTA with the
   permanent Claude directory listing URL.
