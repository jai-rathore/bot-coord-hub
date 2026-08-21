/**
 * The assistants a human already has, and how each one connects and stays awake.
 *
 * Two problems live here.
 *
 * Connecting: HoneyMatcha speaks remote MCP with OAuth and dynamic client
 * registration, so any MCP client can pair without us writing per-vendor code.
 * What was missing was telling a human which button to press in the assistant
 * they already pay for. That is the `connect` steps below.
 *
 * Staying awake: a hosted assistant cannot receive an inbound webhook, and it
 * only calls get_inbox when its human is typing. Someone else's agent can start
 * a task at 2am and nothing happens until the human next opens a chat. Every
 * assistant here can now run a prompt on a schedule, so the standing check is
 * the notification channel: the human sets it up once at onboarding and the
 * agent polls the inbox on its own. See `standingCheck` below.
 */

/** How often a standing inbox check should run. Cheap enough to be polite. */
export const STANDING_CHECK_INTERVAL_MINUTES = 15;

/** Assistants we have verified a connect path for. */
export type AgentClientId = "claude" | "chatgpt" | "gemini" | "grok" | "cursor";

export type AgentClient = {
  id: AgentClientId;
  /** What the human calls it. */
  name: string;
  /** Where they get it. */
  homeUrl: string;
  /** One line on what this client is good at here. */
  summary: string;
  /** Clicks the human makes to add the MCP server. */
  connectSteps: string[];
  /**
   * How this client runs the standing check with nobody in the chat.
   * `null` means it cannot, and the human relies on email instead.
   */
  standingCheck: {
    /** What the vendor calls the feature. */
    featureName: string;
    steps: string[];
    /** Vendor doc for the scheduling feature. */
    docsUrl: string;
  } | null;
  /** Anything that will bite them, stated before they hit it. */
  caveat?: string;
};

/**
 * The prompt a human pastes into their assistant to create the standing check.
 *
 * Written as an instruction to the assistant, not to the human, because that is
 * where it is pasted. It names the interval and the tool so a scheduler that
 * only stores a prompt string still has everything it needs.
 */
export function standingCheckPrompt(
  origin: string,
  intervalMinutes: number = STANDING_CHECK_INTERVAL_MINUTES,
): string {
  const base = origin.replace(/\/$/, "");
  return `Every ${intervalMinutes} minutes, call HoneyMatcha's get_inbox tool.

If it returns nothing pending, stop there and stay quiet — do not message me.

If there is pending work, handle it: read the item, take the next step the summary asks for, then call ack_inbox. Ask me before anything that needs my answer (a time that works, an introduction, a connection request). Never book a calendar event yourself and never answer on my behalf.

HoneyMatcha is at ${base}.`;
}

/** The sentence agents see on connect, in whoami, and in every inbox reply. */
export function standingCheckInstruction(
  intervalMinutes: number = STANDING_CHECK_INTERVAL_MINUTES,
): string {
  return `Calling get_inbox only when your human is typing means inbound work waits for them. If you can run a prompt on a schedule — a task, routine, or scheduled action — set one up now that calls get_inbox every ${intervalMinutes} minutes and stays silent when nothing is pending. If you can receive inbound HTTPS instead, call register_agent_callback.`;
}

export const AGENT_CLIENTS: AgentClient[] = [
  {
    id: "claude",
    name: "Claude",
    homeUrl: "https://claude.ai",
    summary:
      "Custom connectors are on every plan, including free. Scheduled tasks run in the cloud with your laptop closed.",
    connectSteps: [
      "Open Claude → Customize → Connectors and click + next to Connectors.",
      "Name it HoneyMatcha and paste the MCP URL. Leave the advanced OAuth fields empty — HoneyMatcha registers itself.",
      "Click Add, then Connect, and approve in the browser tab that opens.",
    ],
    standingCheck: {
      featureName: "scheduled tasks",
      steps: [
        "Start a chat with the HoneyMatcha connector enabled.",
        "Paste the standing-check prompt below and ask Claude to run it on a schedule.",
      ],
      docsUrl: "https://www.anthropic.com/product/claude-cowork",
    },
    caveat:
      "Free accounts are limited to one custom connector. Scheduled tasks need Pro, Max, or Team.",
  },
  {
    id: "chatgpt",
    name: "ChatGPT",
    homeUrl: "https://chatgpt.com",
    summary:
      "Developer mode is the one path with write access. The apps in the directory can only read.",
    connectSteps: [
      "Open Settings → Apps & Connectors → Advanced and turn on developer mode.",
      "Create a connector, paste the MCP URL, and sign in to HoneyMatcha when it asks.",
      "Enable the HoneyMatcha tools you want in the chat's + menu.",
    ],
    standingCheck: {
      featureName: "tasks",
      steps: [
        "In a chat with HoneyMatcha enabled, paste the standing-check prompt below.",
        "Ask ChatGPT to schedule it as a recurring task.",
      ],
      docsUrl:
        "https://help.openai.com/en/articles/12584461-developer-mode-and-mcp-apps-in-chatgpt",
    },
    caveat:
      "Developer mode asks you to confirm each write action, so a scheduled check will ask before it answers on your behalf. That is the behaviour we want anyway.",
  },
  {
    id: "gemini",
    name: "Gemini",
    homeUrl: "https://gemini.google.com",
    summary:
      "Custom MCP apps connect through Gemini Spark on the web, then work on mobile too.",
    connectSteps: [
      "Open Gemini on the web, signed in with a personal Google account.",
      "Go to Connected apps, add a custom app, and paste the MCP URL.",
      "Approve HoneyMatcha in the browser, then use it from Gemini Spark on web or mobile.",
    ],
    standingCheck: {
      featureName: "scheduled actions",
      steps: [
        "Paste the standing-check prompt below into a Gemini chat.",
        "Ask Gemini to make it a recurring scheduled action.",
      ],
      docsUrl: "https://support.google.com/gemini/answer/16316416",
    },
    caveat:
      "Custom MCP apps need a personal Google account — work and school accounts cannot add them yet. Gemini allows ten active scheduled actions at a time.",
  },
  {
    id: "grok",
    name: "Grok Bot",
    homeUrl: "https://x.ai/bot",
    summary:
      "A persistent cloud computer with a browser and terminal, so it can also complete device pairing on its own.",
    connectSteps: [
      "Open Grok Bot → Plugins and add HoneyMatcha, or paste the MCP URL as a custom plugin.",
      "Click Authorize and sign in to HoneyMatcha in your own browser.",
      "Type @HoneyMatcha in chat, or let the tools run on their own.",
    ],
    standingCheck: {
      featureName: "routines",
      steps: [
        "Ask your Bot to make the standing-check prompt below a routine.",
      ],
      docsUrl: "https://docs.x.ai/grok-bot/skills-routines-and-automations",
    },
    caveat:
      "Plugins are account-wide. Every Bot on the account shares that computer and those credentials — they are not separate security boundaries.",
  },
  {
    id: "cursor",
    name: "Cursor",
    homeUrl: "https://cursor.com",
    summary:
      "For builders. Adds HoneyMatcha as an MCP server next to the rest of your tools.",
    connectSteps: [
      "Open Cursor → Settings → MCP and add HoneyMatcha, or install the plugin from this repo.",
      "Authorize in the browser when prompted.",
    ],
    standingCheck: null,
    caveat:
      "No scheduler here. Register an HTTPS callback with register_agent_callback, or rely on the email HoneyMatcha already sends you.",
  },
];

export function agentClient(id: AgentClientId): AgentClient {
  const found = AGENT_CLIENTS.find((client) => client.id === id);
  if (!found) throw new Error(`Unknown agent client: ${id}`);
  return found;
}

/** Clients that can poll the inbox with nobody in the chat. */
export function clientsWithStandingCheck(): AgentClient[] {
  return AGENT_CLIENTS.filter((client) => client.standingCheck !== null);
}
