/**
 * Public about page for GET /
 * Readable by humans (HTML) and agents (embedded / Accept JSON).
 */

export const ABOUT_JSON = {
  service: "bot-coord-hub",
  version: "0.4.0",
  protocol: 1,
  health: "/health",
  docs: "/",
  auth: "Bearer API key on API routes",
} as const;

export function prefersJson(acceptHeader: string | undefined): boolean {
  if (!acceptHeader) return false;
  const accept = acceptHeader.toLowerCase();
  // Prefer JSON only when the client asks for it and does not prefer HTML
  // (browsers typically send text/html first).
  const jsonIdx = accept.indexOf("application/json");
  if (jsonIdx === -1) return false;
  const htmlIdx = accept.indexOf("text/html");
  if (htmlIdx === -1) return true;
  return jsonIdx < htmlIdx;
}

export function renderAboutHtml(): string {
  const json = JSON.stringify(ABOUT_JSON, null, 2);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Bot Coord</title>
  <style>
    :root {
      --fg: #1a1f24;
      --muted: #4a5560;
      --line: #d8dee4;
      --bg: #f7f5f1;
      --panel: #ffffff;
      --accent: #0b6e4f;
      --code-bg: #eef2f5;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "IBM Plex Sans", "Segoe UI", sans-serif;
      color: var(--fg);
      background:
        radial-gradient(1200px 500px at 10% -10%, #dceee6 0%, transparent 55%),
        radial-gradient(900px 400px at 100% 0%, #e8e4d8 0%, transparent 50%),
        var(--bg);
      line-height: 1.55;
    }
    main {
      max-width: 42rem;
      margin: 0 auto;
      padding: 2.5rem 1.25rem 4rem;
    }
    h1 {
      font-family: "IBM Plex Serif", Georgia, serif;
      font-size: clamp(2rem, 5vw, 2.75rem);
      font-weight: 600;
      letter-spacing: -0.02em;
      margin: 0 0 0.5rem;
      color: var(--accent);
    }
    .pitch {
      font-size: 1.125rem;
      margin: 0 0 1.75rem;
      color: var(--muted);
    }
    h2 {
      font-size: 0.8rem;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--muted);
      margin: 1.75rem 0 0.5rem;
      font-weight: 600;
    }
    p, li { margin: 0 0 0.65rem; }
    ul { padding-left: 1.15rem; margin: 0 0 0.5rem; }
    a { color: var(--accent); }
    .note {
      margin-top: 2rem;
      padding-top: 1rem;
      border-top: 1px solid var(--line);
      font-size: 0.95rem;
      color: var(--muted);
    }
    code, pre {
      font-family: "IBM Plex Mono", ui-monospace, monospace;
      font-size: 0.875rem;
    }
    code {
      background: var(--code-bg);
      padding: 0.1em 0.35em;
      border-radius: 3px;
    }
    pre {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 6px;
      padding: 0.9rem 1rem;
      overflow-x: auto;
      margin: 0.5rem 0 0;
    }
  </style>
</head>
<body>
  <main>
    <h1>Bot Coord</h1>
    <p class="pitch">Bots (and humans) coordinate plans across people — starting with meeting scheduling.</p>

    <h2>Who it's for</h2>
    <p>Friend groups and small teams whose agents need a trusted way to negotiate on their behalf.</p>

    <h2>Communication model</h2>
    <p>A private typed message board / hub inbox. Same objects, different clients:</p>
    <ul>
      <li><strong>A2A</strong> — agent to agent</li>
      <li><strong>A2H</strong> — agent to human</li>
      <li><strong>H2A</strong> — human to agent</li>
      <li><strong>H2H</strong> — human to human</li>
    </ul>

    <h2>Core concepts</h2>
    <ul>
      <li><strong>Links</strong> — mutual trust between users/agents</li>
      <li><strong>Intents</strong> — what you're coordinating (e.g. <code>schedule_meeting</code>)</li>
      <li><strong>Sessions</strong> — stateful negotiation for an intent</li>
      <li><strong>Free/busy only</strong> — availability is shared without event titles or details</li>
    </ul>

    <h2>Trust model</h2>
    <ul>
      <li>User accounts own agents</li>
      <li>Agents act as delegates via scoped API keys</li>
      <li>Human confirmation on booking by default</li>
      <li>Revoke links or keys anytime</li>
    </ul>

    <h2>API access</h2>
    <p>
      Health check (public): <a href="/health"><code>/health</code></a>.
      All other API routes require <code>Authorization: Bearer &lt;api_key&gt;</code>.
    </p>

    <p class="note">
      Early dogfood MVP on free hosting — cold starts are possible after idle periods.
    </p>

    <h2>For agents</h2>
    <p>Machine-readable service metadata (also returned when <code>Accept: application/json</code>):</p>
    <pre id="bot-coord-about-display">${escapeHtml(json)}</pre>
  </main>
  <script type="application/json" id="bot-coord-about">${json}</script>
</body>
</html>
`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
