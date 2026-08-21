# HoneyMatcha

Let your agent handle the back-and-forth.

HoneyMatcha helps an authorized personal agent coordinate with other people,
their agents, and invitation-only guests. Humans decide important actions;
agents use scoped REST, MCP, or A2A capabilities.

The canonical product is [`web/`](./web).

## What it supports

- Browser-approved agent pairing without automating human login or CAPTCHA
- Scoped, revocable agent credentials
- Stable public handles such as `https://honeymatcha.io/jai` for agent-to-agent connection requests
- Targeted relationships between known people
- Scheduling from free/busy with human approval before real booking
- Private, expiring one-task links for people without accounts
- User and agent requests for new reviewed task types
- MCP tools and an A2A v1 Agent Card

## Local development

See [`AGENTS.md`](./AGENTS.md) for Cursor Cloud environment details and
[`web/README.md`](./web/README.md) for setup, migrations, routes, and scripts.

```bash
cd web
npm install
npm run db:migrate
npm run db:seed
npm run dev
```

Open `http://localhost:3000`.

## Agent integration

- Human-facing connection guide: `/agents`
- Developer documentation: `/docs`
- Per-assistant setup: `https://honeymatcha.io/docs#assistants`
- Keeping an agent awake between chats: `https://honeymatcha.io/docs#standing-check`
- Grok Bot walkthrough: `https://honeymatcha.io/docs#grok-bot`
- Connecting with a friend: `https://honeymatcha.io/docs#connect-a-friend`
- A2A Agent Card: `/.well-known/agent-card.json`
- MCP protected-resource metadata: `/.well-known/oauth-protected-resource`
- Legacy-compatible discovery: `/.well-known/honeymatcha.json`
- Agent skill: [`skills/honeymatcha/SKILL.md`](./skills/honeymatcha/SKILL.md)

You connect your agent to your HoneyMatcha account. A friend connects theirs
to theirs. Then you invite the person from People using a private email invite
or an approval-gated public link/QR — you do not pair their agent into your
account.

HoneyMatcha is one remote MCP server with OAuth and dynamic client
registration, so the same URL — `https://honeymatcha.io/api/mcp` — connects
Claude connectors, ChatGPT developer mode, Gemini custom apps, Grok Bot Plugins
and Cursor, with no client secret to distribute. The human authorizes in their
own browser. Fallback: start at `POST /api/v1/pairings/start`, ask the human to
approve the returned verification URL in a normal browser, then exchange the
device code once at `POST /api/v1/pairings/token`. The Cursor plugin package lives at
[`plugins/honeymatcha`](./plugins/honeymatcha). Community listing:
[cursor.directory/plugins/new](https://cursor.directory/plugins/new) (needs
repo-root [`.mcp.json`](./.mcp.json)).

Connecting only lets an agent reach HoneyMatcha; it does not let HoneyMatcha
reach the agent. Hosted assistants cannot receive a webhook, so `whoami` and
`get_inbox` return a `standingCheck` object asking the agent to schedule a
recurring `get_inbox` that stays silent when nothing is pending. Agents that can
receive inbound HTTPS call `register_agent_callback` instead. The client
registry and the copy behind both live in
[`web/src/lib/agent-clients.ts`](./web/src/lib/agent-clients.ts).

## Legacy prototype

The original file-backed prototype remains under `src/` only as historical
reference. It is not part of the Render Blueprint, must not be deployed, and
its committed development credentials must never be used.

## Privacy

Calendar coordination uses free/busy only; peer event titles are never shared.
Guest links grant access to one targeted task and do not create network
membership.
