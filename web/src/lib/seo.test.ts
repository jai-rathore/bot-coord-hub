import assert from "node:assert/strict";
import { test } from "node:test";
import { agentLlmsText } from "./connect-copy";
import {
  CONNECT_FAQS,
  HOW_TO_H1,
  HOW_TO_LEAD,
  HOW_TO_STEPS,
  PUBLIC_PAGE_SEO,
  SITE_FAQS,
  SITE_URL,
  SITEMAP_URL,
  countWords,
  faqPageJsonLd,
  howToJsonLd,
  organizationJsonLd,
  publicPageMetadata,
  sitemapEntries,
  webApplicationJsonLd,
} from "./seo";

const TITLE_MAX = 60;
const DESCRIPTION_MAX = 155;

test("every public page has a unique title and description within limits", () => {
  const pages = Object.values(PUBLIC_PAGE_SEO);
  const titles = pages.map((page) => page.title);
  const descriptions = pages.map((page) => page.description);

  assert.equal(new Set(titles).size, titles.length, "titles must be unique");
  assert.equal(
    new Set(descriptions).size,
    descriptions.length,
    "descriptions must be unique",
  );

  for (const page of pages) {
    assert.ok(
      page.title.length <= TITLE_MAX,
      `${page.path} title is ${page.title.length} chars: ${page.title}`,
    );
    assert.ok(
      page.description.length <= DESCRIPTION_MAX,
      `${page.path} description is ${page.description.length} chars`,
    );
    assert.ok(page.title.length > 0);
    assert.ok(page.description.length > 0);
  }
});

test("how-to lead is the short answer engines quote", () => {
  const words = countWords(HOW_TO_LEAD);
  assert.ok(words >= 40 && words <= 80, `expected 40-80 words, got ${words}`);
  assert.match(HOW_TO_LEAD, /Two people can keep the assistants they already use/);
  assert.match(HOW_TO_LEAD, /https:\/\/honeymatcha\.io\/api\/mcp/);
  assert.match(HOW_TO_LEAD, /Nothing is booked until a person says yes/);
  assert.equal(HOW_TO_H1, "How to connect your agents so they can plan together");
  assert.equal(HOW_TO_STEPS.length, 5);
});

test("sitemap lists the existing public URLs and the new AEO pages", () => {
  const urls = sitemapEntries().map((entry) => entry.url);
  for (const path of [
    "/",
    "/agents",
    "/docs",
    "/agents/tasks",
    "/support",
    "/privacy",
    "/how-to-connect-agents",
    "/connect-chatgpt-and-claude",
    "/faq",
  ]) {
    assert.ok(
      urls.includes(path === "/" ? SITE_URL : `${SITE_URL}${path}`),
      `missing ${path}`,
    );
  }
  assert.ok(SITEMAP_URL.endsWith("/sitemap.xml"));
});

test("page metadata sets a canonical and matching social titles", () => {
  const metadata = publicPageMetadata(PUBLIC_PAGE_SEO.howTo);
  assert.equal(metadata.title, PUBLIC_PAGE_SEO.howTo.title);
  assert.equal(metadata.description, PUBLIC_PAGE_SEO.howTo.description);
  assert.equal(
    metadata.alternates?.canonical,
    `${SITE_URL}/how-to-connect-agents`,
  );
  assert.equal(metadata.openGraph?.title, PUBLIC_PAGE_SEO.howTo.title);
  assert.equal(metadata.twitter?.title, PUBLIC_PAGE_SEO.howTo.title);
  const ogImages = metadata.openGraph?.images;
  assert.ok(Array.isArray(ogImages) && ogImages.length > 0);
  assert.equal(
    (ogImages[0] as { url?: string }).url,
    "/og-agent-choice-v2.png",
  );
});

test("JSON-LD covers HowTo, FAQ, Organization, and WebApplication", () => {
  const howTo = howToJsonLd();
  assert.equal(howTo["@type"], "HowTo");
  assert.equal(howTo.step.length, 5);
  assert.equal(howTo.step[0]?.["@type"], "HowToStep");

  const faq = faqPageJsonLd(CONNECT_FAQS);
  assert.equal(faq["@type"], "FAQPage");
  assert.equal(faq.mainEntity.length, CONNECT_FAQS.length);
  assert.match(faq.mainEntity[0]?.name ?? "", /ChatGPT/);

  const siteFaq = faqPageJsonLd(SITE_FAQS);
  assert.ok(siteFaq.mainEntity.length > CONNECT_FAQS.length);
  assert.ok(
    siteFaq.mainEntity.some((item) => item.name.includes("MCP URL")),
  );
  assert.ok(
    siteFaq.mainEntity.some((item) =>
      item.acceptedAnswer.text.includes("privacy@honeymatcha.io"),
    ),
  );

  const org = organizationJsonLd();
  assert.equal(org["@type"], "Organization");
  assert.equal(org.name, "HoneyMatcha");

  const app = webApplicationJsonLd();
  assert.equal(app["@type"], "WebApplication");
  assert.equal(app.offers.price, "0");
  assert.match(app.description, /Free in beta/);
});

test("llms.txt leads with the human answer before pairing curl", () => {
  const text = agentLlmsText("https://honeymatcha.io");
  const howToAt = text.indexOf("how-to-connect-agents");
  const pairingAt = text.indexOf("pairings/start");
  assert.ok(howToAt >= 0, "missing human how-to URL");
  assert.ok(pairingAt > howToAt, "pairing instructions must follow the human pitch");
  assert.match(
    text,
    /HoneyMatcha is how two people's agents plan together/,
  );
  assert.match(text, /Connect an assistant: https:\/\/honeymatcha\.io\/agents/);
  assert.match(text, /MCP: https:\/\/honeymatcha\.io\/api\/mcp/);
});
