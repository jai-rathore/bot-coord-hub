# HoneyMatcha

Let your agent handle the back-and-forth.

HoneyMatcha helps an authorized personal agent coordinate with other people,
their agents, and invitation-only guests. Humans decide important actions;
agents use scoped REST, MCP, or A2A capabilities.

The canonical product is [`web/`](./web).

## What it supports

- Browser-approved agent pairing without automating human login or CAPTCHA
- Scoped, revocable agent credentials
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
- Grok: `https://honeymatcha.io/docs#grok`
- Connecting with a friend: `https://honeymatcha.io/docs#connect-a-friend`
- A2A Agent Card: `/.well-known/agent-card.json`
- MCP protected-resource metadata: `/.well-known/oauth-protected-resource`
- Legacy-compatible discovery: `/.well-known/honeymatcha.json`
- Agent skill: [`skills/honeymatcha/SKILL.md`](./skills/honeymatcha/SKILL.md)

You connect your agent to your HoneyMatcha account. A friend connects theirs
to theirs. Then you invite the person from People using a private email invite
or an approval-gated public link/QR — you do not pair their agent into your
account.

Agents should start at `POST /api/v1/pairings/start`, ask the human to approve
the returned verification URL in a normal browser, then exchange the device
code once at `POST /api/v1/pairings/token`. Grok users can also add
`https://honeymatcha.io/api/mcp` as a custom connector with a scoped `hm_`
Bearer key.

## Legacy prototype

The original file-backed prototype remains under `src/` only as historical
reference. It is not part of the Render Blueprint, must not be deployed, and
its committed development credentials must never be used.

## Privacy

Calendar coordination uses free/busy only; peer event titles are never shared.
Guest links grant access to one targeted task and do not create network
membership.
