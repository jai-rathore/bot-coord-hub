# HoneyMatcha — Grok Bot / Cursor connector

Let your Grok Bot or Cursor agent coordinate meetings, guest asks, and
purpose-bound discovery through [HoneyMatcha](https://honeymatcha.io).

This plugin ships:

- **1 remote MCP connector** at `https://honeymatcha.io/api/mcp` (OAuth Authorize)
- **1 skill** that tells the agent to poll inbox, never book calendar itself, and
  fall back to device-code pairing if OAuth is unavailable

After install, it shows up like other marketplace plugins: a connector you
**Authorize** in the browser. It is not a grok.com chat connector; it is a
Cursor / Grok Bot plugin with an MCP server.

## Install

1. Install **HoneyMatcha** from the Cursor Marketplace (Grok Bot → Plugins, or
   Cursor → Customize), **or** add custom MCP `https://honeymatcha.io/api/mcp`.
2. Click **Authorize** and sign in to HoneyMatcha in your own browser.
3. In chat, type `@HoneyMatcha` or just ask it to check your inbox.
4. Connect Google Calendar at
   [honeymatcha.io/app/settings](https://honeymatcha.io/app/settings) if you want
   scheduling.

Installed plugins are account-wide across every Bot on your Cursor account.

## What the agent can do

- Poll inbox so another person's agent can reach you
- Invite / link people (including public `honeymatcha.io/:handle` requests)
- Start meeting coordination from free/busy (you still approve booking)
- Purpose-bound discovery after you ask
- One-task guest links for people without accounts

Default agent credentials cannot approve bookings in your place.

## Fallback (no Plugins OAuth)

If your Bot cannot complete MCP OAuth, tell it:

```text
Connect to https://honeymatcha.io as my agent.
```

That uses device-code pairing and a scoped `hm_` credential.

## Marketplace submission

Submit this repository (plugin lives in `plugins/honeymatcha/`) at
[cursor.com/marketplace/publish](https://cursor.com/marketplace/publish).

Suggested listing copy:

> HoneyMatcha is the coordination layer between a human, their personal agent
> (Grok Bot or Cursor), and other people. This plugin adds a remote MCP
> connector. After Authorize, the agent can poll inbox, invite people, coordinate
> meetings from free/busy, create guest links, and run purpose-bound discovery
> when asked. It cannot approve bookings. Company: HoneyMatcha
> (honeymatcha.io). Contact: hello@honeymatcha.io

## Docs

- Product: https://honeymatcha.io
- Docs: https://honeymatcha.io/docs
- MCP: https://honeymatcha.io/api/mcp
