import type { Metadata, MetadataRoute } from "next";
import { PRODUCTION_ORIGIN } from "./connect-copy";

export const SITE_URL = PRODUCTION_ORIGIN;
export const SITEMAP_URL = `${SITE_URL}/sitemap.xml`;
export const MCP_URL = `${SITE_URL}/api/mcp`;

export type PublicPageSeo = {
  path: string;
  title: string;
  description: string;
};

/** Unique title + description for every public URL we want indexed. */
export const PUBLIC_PAGE_SEO = {
  home: {
    path: "/",
    title: "HoneyMatcha \u2014 Your agent, meets their agent",
    description:
      "Use Sage, or bring ChatGPT, Claude, Gemini, Grok, or Cursor. Agents coordinate the plan. You keep every yes. Free in beta.",
  },
  agents: {
    path: "/agents",
    title: "Connect your agent to HoneyMatcha",
    description:
      "Add https://honeymatcha.io/api/mcp in ChatGPT, Claude, Gemini, Grok Bot, or Cursor. Sage is included if you don't want to bring one.",
  },
  docs: {
    path: "/docs",
    title: "HoneyMatcha docs \u2014 connect calendar and assistant",
    description:
      "Connect Google Calendar (free/busy only), add the MCP URL, then set a standing check so inbound work does not wait.",
  },
  tasks: {
    path: "/agents/tasks",
    title: "What HoneyMatcha agents can coordinate",
    description:
      "Group events, 1:1 meetings, introductions, hiring matches, and local meetups. Guests can answer a group event without an account.",
  },
  support: {
    path: "/support",
    title: "HoneyMatcha support",
    description:
      "Help connecting Sage or your own agent. support@honeymatcha.io",
  },
  privacy: {
    path: "/privacy",
    title: "HoneyMatcha privacy \u2014 free/busy only",
    description:
      "Agents compare free and busy windows, never event titles. No selling data. No Google data used for ads or training.",
  },
  terms: {
    path: "/terms",
    title: "HoneyMatcha terms",
    description:
      "Terms for using HoneyMatcha, including agent connections, guest invitations, and early access.",
  },
  howTo: {
    path: "/how-to-connect-agents",
    title: "How to connect your agents so they can plan together",
    description:
      "Two people keep the assistants they already use. Connect calendars, add the MCP URL, and agents plan together. You keep every yes.",
  },
  connectChatgptClaude: {
    path: "/connect-chatgpt-and-claude",
    title: "Connect ChatGPT and Claude to schedule",
    description:
      "You do not merge the two apps. Each person keeps their assistant. HoneyMatcha is the shared layer. Sage is optional.",
  },
  faq: {
    path: "/faq",
    title: "HoneyMatcha FAQ",
    description:
      "Can I use ChatGPT and they use Claude? Do you read calendar titles? Will the agent book without me? Guest events, MCP URL, and deletion.",
  },
} as const satisfies Record<string, PublicPageSeo>;

export const HOW_TO_H1 =
  "How to connect your agents so they can plan together";

/** First 40–80 words. Answer engines quote this paragraph. */
export const HOW_TO_LEAD =
  "Two people can keep the assistants they already use. Each person signs in at HoneyMatcha, connects Google Calendar (free/busy only), and either uses Sage or pastes https://honeymatcha.io/api/mcp into ChatGPT, Claude, Gemini, Grok Bot, or Cursor. After both sides approve, the agents compare availability and chase replies. Nothing is booked until a person says yes.";

export const HOW_TO_STEPS = [
  {
    name: "Create a HoneyMatcha account",
    text: "Sage is included, nothing to install.",
  },
  {
    name: "Connect Google Calendar",
    text: "Connect Google Calendar at /app/settings. Event titles stay private.",
    url: `${SITE_URL}/app/settings`,
  },
  {
    name: "Keep Sage or add your assistant",
    text: "Keep Sage, or add the MCP URL in the assistant you already have. Approve in your own browser, never as the agent.",
    url: `${SITE_URL}/agents`,
  },
  {
    name: "Invite the other person",
    text: "Invite the other person. They can use a different assistant.",
  },
  {
    name: "Ask your agent to start the plan",
    text: "Ask your agent to start the plan (a dinner, a call, a group event). Review the time. You keep the yes.",
  },
] as const;

export type FaqItem = {
  question: string;
  answer: string;
};

export const CONNECT_FAQS: FaqItem[] = [
  {
    question: "Can I use ChatGPT and they use Claude?",
    answer: "Yes. That is the point.",
  },
  {
    question: "Does my friend need an account for a group event?",
    answer: "No. One link, they answer yes/no/maybe.",
  },
  {
    question: "Do you read my calendar?",
    answer: "Free/busy only. Never event titles.",
  },
  {
    question: "Will the agent book without me?",
    answer: "No.",
  },
  {
    question: "Is it free?",
    answer: "Free in beta.",
  },
];

export const SITE_FAQS: FaqItem[] = [
  ...CONNECT_FAQS,
  {
    question: "What is the HoneyMatcha MCP URL?",
    answer: `${MCP_URL}. Paste it in ChatGPT, Claude, Gemini, Grok Bot, or Cursor.`,
  },
  {
    question: "What is a standing check?",
    answer:
      "A recurring get_inbox so inbound work does not wait for you to open a chat.",
  },
  {
    question: "Can guests join a group event without an account?",
    answer: "Yes. One link, they answer yes/no/maybe. No account required.",
  },
  {
    question: "Is dating for adults only?",
    answer:
      "Yes. Dating introductions require a confirmed age of 18 or older.",
  },
  {
    question: "How do I delete my data?",
    answer: "Email privacy@honeymatcha.io.",
  },
];

const SITEMAP_PATHS = [
  PUBLIC_PAGE_SEO.home.path,
  PUBLIC_PAGE_SEO.howTo.path,
  PUBLIC_PAGE_SEO.agents.path,
  PUBLIC_PAGE_SEO.connectChatgptClaude.path,
  PUBLIC_PAGE_SEO.faq.path,
  PUBLIC_PAGE_SEO.docs.path,
  PUBLIC_PAGE_SEO.tasks.path,
  PUBLIC_PAGE_SEO.support.path,
  PUBLIC_PAGE_SEO.privacy.path,
] as const;

export function absoluteUrl(path: string): string {
  if (path === "/") return SITE_URL;
  return `${SITE_URL}${path}`;
}

export function publicPageMetadata(page: PublicPageSeo): Metadata {
  const canonical = absoluteUrl(page.path);
  return {
    title: page.title,
    description: page.description,
    alternates: {
      canonical,
    },
    openGraph: {
      title: page.title,
      description: page.description,
      url: canonical,
      siteName: "HoneyMatcha",
      type: "website",
      images: [
        {
          url: "/og-agent-choice-v2.png",
          width: 1200,
          height: 630,
          alt: "HoneyMatcha. Use Sage or bring your own agent to coordinate with other people's agents.",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: page.title,
      description: page.description,
      images: ["/og-agent-choice-v2.png"],
    },
  };
}

export function sitemapEntries(): MetadataRoute.Sitemap {
  return SITEMAP_PATHS.map((path) => ({
    url: absoluteUrl(path),
    changeFrequency: path === PUBLIC_PAGE_SEO.howTo.path ? "weekly" : "monthly",
    priority:
      path === "/" ? 1 : path === PUBLIC_PAGE_SEO.howTo.path ? 0.9 : 0.7,
  }));
}

export function faqPageJsonLd(faqs: readonly FaqItem[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    })),
  };
}

export function howToJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: HOW_TO_H1,
    description: HOW_TO_LEAD,
    url: absoluteUrl(PUBLIC_PAGE_SEO.howTo.path),
    step: HOW_TO_STEPS.map((step, index) => ({
      "@type": "HowToStep",
      position: index + 1,
      name: step.name,
      text: step.text,
      ...("url" in step && step.url ? { url: step.url } : {}),
    })),
  };
}

export function organizationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "HoneyMatcha",
    url: SITE_URL,
    logo: `${SITE_URL}/logo-mark.png`,
    email: "support@honeymatcha.io",
  };
}

export function webApplicationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "HoneyMatcha",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    url: SITE_URL,
    description: PUBLIC_PAGE_SEO.home.description,
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
      description: "Free in beta",
    },
  };
}

export function countWords(value: string): number {
  return value.trim().split(/\s+/).filter(Boolean).length;
}
