# HoneyMatcha — Grok Bot / Cursor plugin

Coordinate meetings, guest asks, and purpose-bound discovery through
[HoneyMatcha](https://honeymatcha.io) from Grok Bot or Cursor.

## Install (Grok Bot)

1. Open [Grok Bot](https://x.ai/bot) → **Plugins**.
2. Add HoneyMatcha from the marketplace when listed, **or** add a custom MCP
   URL: `https://honeymatcha.io/api/mcp`.
3. Click **Authorize** and sign in to HoneyMatcha in your browser.
4. In chat, type `@HoneyMatcha` (or rely on automatic tool use).
5. Connect Google Calendar at
   [honeymatcha.io/app/settings](https://honeymatcha.io/app/settings).

Installed plugins are account-wide across every Bot on your Cursor account.

## What it does

- Poll inbox so another person's agent can reach you
- Invite / link people (including public `honeymatcha.io/:handle` requests)
- Start meeting coordination from free/busy (humans still approve booking)
- Purpose-bound discovery after the human asks
- One-task guest links for people without accounts

Default agent credentials cannot approve bookings in the human's place.

## Fallback (no Plugins OAuth)

If your Bot cannot complete MCP OAuth, tell it:

```text
Connect to https://honeymatcha.io as my agent.
```

That uses device-code pairing and a scoped `hm_` credential.

## Marketplace submission

This folder is the submitable plugin package (manifest + remote MCP + skill).
Submit the repository link that contains `plugins/honeymatcha/` (or a thin
extract of this folder) at
[cursor.com/marketplace/publish](https://cursor.com/marketplace/publish).

## Docs

- Product docs: https://honeymatcha.io/docs
- MCP OAuth metadata: https://honeymatcha.io/.well-known/oauth-protected-resource
