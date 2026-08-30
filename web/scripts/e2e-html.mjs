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

function visibleCopy(html) {
  const match = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  const body = match ? match[1] : html;
  return text(
    body
      .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[\s\S]*?<\/style>/gi, " "),
  );
}

function pageTitle(html) {
  const match = html.match(/<title>([^<]*)<\/title>/i);
  return decodeEntities(match?.[1] ?? "");
}

function decodeEntities(value) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&mdash;/g, "\u2014")
    .replace(/&#x2014;/g, "\u2014")
    .replace(/&#8212;/g, "\u2014");
}

/** Public pages must render real server HTML, not a redirect or an error shell. */
const PAGES = [
  { path: "/", heading: "meets their agent", title: "HoneyMatcha — Your agent, meets their agent" },
  { path: "/docs", heading: "Connect the assistant you already have", title: "HoneyMatcha docs — connect calendar and assistant" },
  { path: "/agents", heading: "Sage is ready.", title: "Connect your agent to HoneyMatcha" },
  { path: "/agents/tasks", heading: "What agents can coordinate", title: "What HoneyMatcha agents can coordinate" },
  { path: "/support", heading: "help you connect", title: "HoneyMatcha support" },
  { path: "/privacy", heading: "Privacy", title: "HoneyMatcha privacy — free/busy only" },
  { path: "/terms", heading: "Terms", title: "HoneyMatcha terms" },
  {
    path: "/how-to-connect-agents",
    heading: "How to connect your agents so they can plan together",
    title: "How to connect your agents so they can plan together",
  },
  {
    path: "/connect-chatgpt-and-claude",
    heading: "Connect ChatGPT and Claude so they can schedule together",
    title: "Connect ChatGPT and Claude to schedule",
  },
  { path: "/faq", heading: "HoneyMatcha FAQ", title: "HoneyMatcha FAQ" },
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
      assert.equal(
        pageTitle(body),
        page.title,
        `unexpected title for ${page.path}`,
      );
      const canonical =
        page.path === "/"
          ? "https://honeymatcha.io"
          : `https://honeymatcha.io${page.path}`;
      assert.match(body, /rel="canonical"/, `missing canonical rel on ${page.path}`);
      assert.ok(
        body.includes(canonical),
        `missing canonical href ${canonical}`,
      );
      assert.ok(
        body.includes("/how-to-connect-agents"),
        `${page.path} is missing an internal link to /how-to-connect-agents`,
      );
      assert.match(
        body,
        /og-agent-choice-v2\.png/,
        "page does not inherit the current shared URL card",
      );
      assert.doesNotMatch(
        body,
        /content="[^"]*\/og\.png"/,
        "page still advertises the retired URL card",
      );
      assert.ok(
        !visibleCopy(body).includes("\u2014"),
        "rendered copy contains an em dash",
      );
    });
  }

  await check("shared URL card uses the current Sage and agent-choice image", async () => {
    const image = await fetch(`${BASE_URL}/og-agent-choice-v2.png`);
    assert.equal(image.status, 200);
    assert.match(image.headers.get("content-type") ?? "", /image\/png/);
    const bytes = new Uint8Array(await image.arrayBuffer());
    assert.ok(bytes.length > 50_000, "shared URL card is unexpectedly small");
    assert.equal(bytes[16], 0, "unexpected PNG width prefix");
    assert.equal(bytes[17], 0, "unexpected PNG width prefix");
    assert.equal(bytes[18], 4, "expected a 1200px-wide PNG");
    assert.equal(bytes[19], 176, "expected a 1200px-wide PNG");
    assert.equal(bytes[22], 2, "expected a 630px-tall PNG");
    assert.equal(bytes[23], 118, "expected a 630px-tall PNG");
  });

  await check("event URLs keep their dedicated dynamic image card", async () => {
    const res = await fetch(
      `${BASE_URL}/api/events/definitely-not-a-real-event/og`,
    );
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type") ?? "", /image\/png/);
    assert.ok((await res.arrayBuffer()).byteLength > 10_000);
  });

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

  await check("GET /llms.txt leads with the human how-to", async () => {
    const res = await fetch(`${BASE_URL}/llms.txt`);
    assert.equal(res.status, 200);
    const text = await res.text();
    assert.match(text, /two people's agents plan together/i);
    assert.ok(
      text.indexOf("how-to-connect-agents") < text.indexOf("pairings/start"),
      "human how-to must appear before pairing curl",
    );
  });

  await check("GET /sitemap.xml lists the public AEO URLs", async () => {
    const res = await fetch(`${BASE_URL}/sitemap.xml`);
    assert.equal(res.status, 200);
    const xml = await res.text();
    assert.match(res.headers.get("content-type") ?? "", /xml/);
    for (const path of [
      "https://honeymatcha.io</loc>",
      "https://honeymatcha.io/how-to-connect-agents",
      "https://honeymatcha.io/connect-chatgpt-and-claude",
      "https://honeymatcha.io/faq",
      "https://honeymatcha.io/agents",
    ]) {
      assert.ok(xml.includes(path), `sitemap missing ${path}`);
    }
  });

  await check("GET /robots.txt points at the sitemap", async () => {
    const res = await fetch(`${BASE_URL}/robots.txt`);
    assert.equal(res.status, 200);
    assert.match(await res.text(), /Sitemap:\s*https:\/\/honeymatcha\.io\/sitemap\.xml/);
  });

  await check("how-to page quotes the answer first and ships HowTo + FAQ schema", async () => {
    const { res, body } = await getHtml("/how-to-connect-agents");
    assert.equal(res.status, 200);
    const lead =
      "Two people can keep the assistants they already use";
    const leadAt = body.indexOf(lead);
    const h1At = body.indexOf("<h1");
    assert.ok(leadAt >= 0, "missing how-to lead");
    assert.ok(leadAt < h1At, "lead must appear before the H1 / hero");
    assert.match(body, /"@type":"HowTo"/);
    assert.match(body, /"@type":"FAQPage"/);
    assert.match(body, /"@type":"Organization"/);
    assert.ok(body.includes("/sign-up"), "how-to page needs a Sage CTA");
    assert.ok(!body.includes("sign in to continue"), "how-to page must not be a sign-up wall");
  });

  await check("homepage and FAQ publish application schema", async () => {
    const home = await getHtml("/");
    assert.match(home.body, /"@type":"WebApplication"/);
    assert.match(home.body, /"price":"0"/);
    const faq = await getHtml("/faq");
    assert.match(faq.body, /"@type":"FAQPage"/);
    assert.match(faq.body, /privacy@honeymatcha\.io/);
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
