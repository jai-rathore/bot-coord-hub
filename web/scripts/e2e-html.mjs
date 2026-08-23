#!/usr/bin/env node
/**
 * HTML render + content-negotiation smoke suite.
 *
 * Every other suite exercises the agent API and the service layer; none of them
 * renders a page. That left the whole browser-facing surface — the marketing
 * pages, the app shell redirects, and the proxy's Accept negotiation — with no
 * coverage at all, which is exactly what rendering-strategy and caching work
 * puts at risk.
 *
 * Requires a running server (`npm run start` or `npm run dev`) on BASE_URL.
 *
 * Note on Accept: requests deliberately send `Accept: * / *` rather than
 * `text/html`. With placeholder Clerk keys an explicit `Accept: text/html`
 * triggers Clerk's dev-browser-missing handshake and every route 307s, so a
 * suite written the obvious way would assert nothing. `* / *` still renders
 * HTML for pages, and the JSON cases below pin the negotiation contract
 * explicitly.
 */
import assert from "node:assert/strict";

const BASE_URL = process.env.BASE_URL ?? "http://127.0.0.1:3000";

let failures = 0;
let checks = 0;

async function check(name, fn) {
  checks += 1;
  try {
    await fn();
    console.log(`  ok  ${name}`);
  } catch (error) {
    failures += 1;
    console.error(`FAIL  ${name}\n      ${error.message}`);
  }
}

async function getHtml(path) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { Accept: "*/*" },
    redirect: "manual",
  });
  return { res, body: await res.text() };
}

function text(html) {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
}

/** Public pages must render real server HTML, not a redirect or an error shell. */
const PAGES = [
  { path: "/", heading: "meets their agent" },
  { path: "/docs", heading: "Connect the assistant you already have" },
  { path: "/agents", heading: "Sage is ready." },
  { path: "/agents/tasks", heading: "What agents can coordinate" },
  { path: "/privacy", heading: "Privacy" },
  { path: "/terms", heading: "Terms" },
];

async function main() {
  console.log(`HTML smoke against ${BASE_URL}\n`);

  for (const page of PAGES) {
    await check(`GET ${page.path} renders HTML`, async () => {
      const { res, body } = await getHtml(page.path);
      assert.equal(res.status, 200, `expected 200, got ${res.status}`);
      assert.match(
        res.headers.get("content-type") ?? "",
        /text\/html/,
        "expected an HTML content-type",
      );
      assert.ok(body.includes("<h1"), "no <h1> in the response");
      assert.ok(
        text(body).includes(page.heading),
        `missing expected copy: ${page.heading}`,
      );
      assert.ok(
        !text(body).includes("\u2014"),
        "rendered copy contains an em dash",
      );
    });
  }

  await check("GET / with Accept: application/json returns the discovery document", async () => {
    const res = await fetch(`${BASE_URL}/`, {
      headers: { Accept: "application/json" },
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.service, "honeymatcha");
    assert.ok(body.endpoints, "discovery document missing endpoints");
  });

  for (const path of [
    "/.well-known/agent-card.json",
    "/.well-known/honeymatcha.json",
    "/.well-known/oauth-authorization-server",
    "/.well-known/oauth-protected-resource",
  ]) {
    await check(`GET ${path} returns JSON`, async () => {
      const res = await fetch(`${BASE_URL}${path}`);
      assert.equal(res.status, 200, `expected 200, got ${res.status}`);
      const body = await res.json();
      assert.ok(Object.keys(body).length > 0, "empty document");
    });
  }

  await check("GET /llms.txt returns text", async () => {
    const res = await fetch(`${BASE_URL}/llms.txt`);
    assert.equal(res.status, 200);
    assert.ok((await res.text()).length > 0, "empty llms.txt");
  });

  for (const path of ["/app/people", "/app/events", "/app/activity", "/app/settings"]) {
    await check(`GET ${path} signed out redirects to sign-in`, async () => {
      const { res } = await getHtml(path);
      assert.ok(
        res.status === 307 || res.status === 302,
        `expected a redirect, got ${res.status}`,
      );
      assert.match(
        res.headers.get("location") ?? "",
        /\/sign-in/,
        "did not redirect to sign-in",
      );
    });
  }

  await check("GET an unclaimed handle returns 404", async () => {
    const { res } = await getHtml("/definitely-not-a-real-handle-xyz");
    assert.equal(res.status, 404, `expected 404, got ${res.status}`);
  });

  console.log(`\n${checks - failures}/${checks} checks passed`);
  if (failures > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
