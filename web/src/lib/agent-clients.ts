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
  /** Vendor documentation for the connection flow, when published. */
  connectDocsUrl?: string;
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

If it returns nothing pending, stop there and stay quiet: do not message me.

If there is pending work, handle it: read the item, take the next step the summary asks for, then call ack_inbox. Ask me before anything that needs my answer (a time that works, an introduction, a connection request). Never book a calendar event yourself and never answer on my behalf.

HoneyMatcha is at ${base}.`;
}

/** The sentence agents see on connect, in whoami, and in every inbox reply. */
export function standingCheckInstruction(
  intervalMinutes: number = STANDING_CHECK_INTERVAL_MINUTES,
): string {
  return `Calling get_inbox only when your human is typing means inbound work waits for them. If you can run a prompt on a schedule: a task, routine, or scheduled action: set one up now that calls get_inbox every ${intervalMinutes} minutes and stays silent when nothing is pending. If you can receive inbound HTTPS instead, call register_agent_callback.`;
}

export const AGENT_CLIENTS: AgentClient[] = [
  {
    id: "claude",
    name: "Claude",
    homeUrl:
      "https://claude.ai/customize/connectors?modal=add-custom-connector&connectorName=HoneyMatcha&connectorUrl=https%3A%2F%2Fhoneymatcha.io%2Fapi%2Fmcp",
    summary:
      "Add HoneyMatcha as a remote MCP connector on Claude web, desktop, or mobile. Paid Cowork plans can keep it checking on a schedule.",
    connectSteps: [
      "Open Claude → Customize → Connectors → Add custom connector.",
      "Name it HoneyMatcha and paste the MCP URL. Leave the optional OAuth client fields empty: HoneyMatcha registers Claude securely.",
      "Click Add, then Connect, and approve in the browser tab that opens.",
    ],
    connectDocsUrl: "https://claude.com/docs/connectors/custom/remote-mcp",
    standingCheck: {
      featureName: "Cowork scheduled tasks",
      steps: [
        "Open Scheduled in Cowork, choose New task, and create it with Claude or set it up manually.",
        "Paste the standing-check prompt below and make sure the HoneyMatcha connector is enabled for the task.",
      ],
      docsUrl:
        "https://support.claude.com/en/articles/13854387-schedule-recurring-tasks-in-claude-cowork",
    },
    caveat:
      "Team and Enterprise owners add the organization connector before members connect. Cowork scheduled tasks require a paid plan.",
  },
  {
    id: "chatgpt",
    name: "ChatGPT",
    homeUrl: "https://chatgpt.com/plugins",
    summary:
      "Connect the MCP server in developer mode today; after review, HoneyMatcha can appear in the shared ChatGPT and Codex Plugins Directory.",
    connectSteps: [
      "Open Settings → Security and login and turn on Developer mode.",
      "Open ChatGPT Plugins, select +, name it HoneyMatcha, and paste the MCP URL under Connection.",
      "Create the connection, sign in to HoneyMatcha, review its tools, then enable it from the chat tools menu.",
    ],
    connectDocsUrl:
      "https://developers.openai.com/plugins/deploy/connect-chatgpt",
    standingCheck: {
      featureName: "tasks",
      steps: [
        "In a chat with HoneyMatcha enabled, paste the standing-check prompt below.",
        "Ask ChatGPT to schedule it as a recurring task.",
      ],
      docsUrl:
        "https://developers.openai.com/plugins/deploy/connect-chatgpt",
    },
    caveat:
      "Developer mode availability depends on account and workspace policy. ChatGPT confirms write actions using HoneyMatcha's per-tool safety metadata.",
  },
  {
    id: "gemini",
    name: "Gemini",
    homeUrl: "https://gemini.google.com",
    summary:
      "Custom MCP apps connect through Gemini Spark on the web, then work in Spark on mobile too.",
    connectSteps: [
      "Open Gemini on the web with an eligible personal Google Account, then switch to Spark.",
      "Open Settings & help → Connected Apps (sometimes under Personal Intelligence). Under Custom apps for Spark, add a custom app and paste the MCP URL.",
      "Click Next, approve HoneyMatcha in the browser, then type @ and select HoneyMatcha in a Spark task on web or mobile.",
    ],
    connectDocsUrl: "https://support.google.com/gemini/answer/17209137",
    standingCheck: {
      featureName: "Spark schedules",
      steps: [
        "Create a Spark task with HoneyMatcha enabled and paste the standing-check prompt below.",
        "Tell Spark to run it on the requested recurring schedule.",
      ],
      docsUrl: "https://support.google.com/gemini/answer/17094507",
    },
    caveat:
      "Google currently gates custom MCP apps to eligible Gemini Spark users: age 18+, a qualifying plan, a personal Google Account (not work or school), Keep Activity on, and, per Google's custom-app guide, US and English availability.",
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
      "Plugins are account-wide. Every Bot on the account shares that computer and those credentials: they are not separate security boundaries.",
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
