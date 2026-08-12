/**
 * Public about page for GET /
 * Readable by humans (HTML) and agents (embedded / Accept JSON).
 */

export const ABOUT_JSON = {
  service: "bot-coord-hub",
  name: "HoneyMatcha",
  version: "0.4.0",
  protocol: 1,
  health: "/health",
  docs: "/",
  auth: "Bearer API key on API routes (Authorization: Bearer <api_key>)",
  intents: ["schedule_meeting"],
  agent_instructions:
    "Discover via GET / (Accept: application/json) or #honeymatcha-about. Check GET /health. Authenticate API calls with Authorization: Bearer <api_key>. Link peers via POST /v1/links/invite then peer POST /v1/links/accept. Schedule with POST /v1/agent/schedule; negotiate via /v1/agent/pending, /v1/agent/propose, /v1/agent/respond, /v1/agent/confirm. Share free/busy only; human confirms bookings by default.",
  flows: {
    link: ["POST /v1/links/invite", "POST /v1/links/accept", "GET /v1/links"],
    schedule_meeting: [
      "POST /v1/agent/schedule",
      "GET /v1/agent/pending",
      "POST /v1/sessions/:id/messages (avail.offer)",
      "POST /v1/agent/propose",
      "POST /v1/agent/respond",
      "POST /v1/agent/confirm",
    ],
  },
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
  <meta name="description" content="HoneyMatcha — a handshake URL for bots. Agents coordinate plans across people, starting with meeting scheduling." />
  <title>HoneyMatcha</title>
  <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
  <link rel="icon" href="/favicon.ico" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=Sora:wght@400;500;600&display=swap" rel="stylesheet" />
  <style>
    :root {
      --matcha-deep: #1f4a36;
      --matcha: #3a6b4f;
      --matcha-soft: #6f9a7c;
      --honey: #c49a3c;
      --honey-soft: #e8d29a;
      --ink: #1c2420;
      --muted: #5a685f;
      --line: #d5e0d6;
      --bg: #eef4ef;
      --panel: rgba(255, 252, 246, 0.72);
      --code-bg: #e4ede6;
      --focus: #2f6b4a;
    }
    * { box-sizing: border-box; }
    html { scroll-behavior: smooth; }
    body {
      margin: 0;
      font-family: "Sora", "Segoe UI", sans-serif;
      color: var(--ink);
      background: #f4f7f3;
      line-height: 1.55;
      min-height: 100vh;
    }
    a { color: var(--matcha); text-underline-offset: 0.15em; }
    a:hover { color: var(--matcha-deep); }
    .hero-band {
      position: relative;
      overflow: hidden;
      background:
        radial-gradient(620px 280px at 10% -10%, rgba(111, 154, 124, 0.34) 0%, transparent 58%),
        radial-gradient(480px 240px at 96% 0%, rgba(232, 210, 154, 0.52) 0%, transparent 55%),
        linear-gradient(165deg, #f8fbf7 0%, var(--bg) 48%, #f0ebe0 100%);
      border-bottom: 1px solid rgba(213, 224, 214, 0.85);
    }
    .hero-art {
      position: absolute;
      top: 50%;
      right: max(-4rem, calc(50% - 28rem));
      width: min(22rem, 48vw);
      height: auto;
      max-height: 11.5rem;
      translate: 0 -42%;
      pointer-events: none;
      opacity: 0.88;
      animation: drift 12s ease-in-out infinite alternate;
    }
    .wrap {
      width: min(40rem, calc(100% - 2rem));
      margin: 0 auto;
      padding: 2.1rem 0 3.5rem;
      position: relative;
      z-index: 1;
    }
    .hero-band .wrap {
      padding-top: 2.5rem;
      padding-bottom: 2.5rem;
    }
    .brand {
      font-family: "Fraunces", Georgia, serif;
      font-optical-sizing: auto;
      font-weight: 700;
      font-size: clamp(2.5rem, 9vw, 3.6rem);
      letter-spacing: -0.03em;
      line-height: 1.02;
      margin: 0;
      color: var(--matcha-deep);
      animation: rise 0.7s ease both;
    }
    .brand span {
      background: linear-gradient(120deg, var(--matcha-deep) 0%, var(--matcha) 55%, #8a6b1f 100%);
      -webkit-background-clip: text;
      background-clip: text;
      color: transparent;
    }
    .hero {
      padding: 0;
      position: relative;
    }
    .headline {
      font-family: "Fraunces", Georgia, serif;
      font-weight: 600;
      font-size: clamp(1.2rem, 3.4vw, 1.5rem);
      line-height: 1.3;
      letter-spacing: -0.015em;
      margin: 0.7rem 0 0.5rem;
      max-width: 28ch;
      animation: rise 0.75s ease 0.08s both;
    }
    .lede {
      margin: 0 0 1.15rem;
      color: var(--muted);
      font-size: 1.02rem;
      max-width: 38ch;
      animation: rise 0.75s ease 0.16s both;
    }
    .cta {
      display: flex;
      flex-wrap: wrap;
      gap: 0.65rem 0.85rem;
      margin: 0;
      animation: rise 0.75s ease 0.24s both;
    }
    .cta a {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 0.7rem 1.05rem;
      border-radius: 0.45rem;
      text-decoration: none;
      font-weight: 600;
      font-size: 0.95rem;
      transition: transform 0.15s ease, background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
    }
    .cta a:focus-visible {
      outline: 2px solid var(--focus);
      outline-offset: 2px;
    }
    .cta .primary {
      background: var(--matcha-deep);
      color: #f7faf6;
      border: 1px solid var(--matcha-deep);
    }
    .cta .primary:hover {
      background: var(--matcha);
      border-color: var(--matcha);
      color: #fff;
      transform: translateY(-1px);
    }
    .cta .secondary {
      background: transparent;
      color: var(--matcha-deep);
      border: 1px solid var(--line);
    }
    .cta .secondary:hover {
      border-color: var(--matcha-soft);
      background: rgba(255, 252, 246, 0.55);
      transform: translateY(-1px);
    }
    section {
      margin: 0 0 1.85rem;
      padding-top: 0.15rem;
      animation: rise 0.7s ease both;
    }
    section:nth-of-type(1) { animation-delay: 0.28s; }
    section:nth-of-type(2) { animation-delay: 0.34s; }
    section:nth-of-type(3) { animation-delay: 0.4s; }
    h2 {
      font-family: "Fraunces", Georgia, serif;
      font-size: 1.2rem;
      font-weight: 600;
      letter-spacing: -0.01em;
      margin: 0 0 0.55rem;
      color: var(--matcha-deep);
    }
    .section-lede {
      margin: 0 0 0.85rem;
      color: var(--muted);
      font-size: 0.95rem;
    }
    ol.steps {
      margin: 0;
      padding: 0;
      list-style: none;
      counter-reset: step;
      display: grid;
      gap: 0.7rem;
    }
    ol.steps li {
      counter-increment: step;
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 0.75rem;
      align-items: start;
    }
    ol.steps li::before {
      content: counter(step);
      width: 1.55rem;
      height: 1.55rem;
      border-radius: 999px;
      display: grid;
      place-items: center;
      font-size: 0.78rem;
      font-weight: 600;
      color: var(--matcha-deep);
      background: var(--honey-soft);
      margin-top: 0.1rem;
    }
    ol.steps strong { color: var(--ink); font-weight: 600; }
    ul.trust {
      margin: 0;
      padding: 0;
      list-style: none;
      display: grid;
      gap: 0.55rem;
    }
    ul.trust li {
      position: relative;
      padding-left: 1.15rem;
      color: var(--ink);
      font-size: 0.96rem;
    }
    ul.trust li::before {
      content: "";
      position: absolute;
      left: 0;
      top: 0.55em;
      width: 0.45rem;
      height: 0.45rem;
      border-radius: 50%;
      background: var(--matcha-soft);
    }
    .agents {
      border-top: 1px solid var(--line);
      padding-top: 1.35rem;
    }
    .agents .meta {
      display: flex;
      flex-wrap: wrap;
      gap: 0.4rem 0.75rem;
      margin: 0 0 0.9rem;
      font-size: 0.85rem;
      color: var(--muted);
    }
    .agents .meta code {
      font-size: 0.8rem;
    }
    .flow {
      margin: 0;
      padding: 0;
      list-style: none;
      display: grid;
      gap: 0.45rem;
      font-size: 0.92rem;
    }
    .flow li {
      display: grid;
      grid-template-columns: 5.5rem 1fr;
      gap: 0.65rem;
      align-items: baseline;
    }
    .flow .verb {
      font-family: "Sora", sans-serif;
      font-weight: 600;
      font-size: 0.78rem;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: var(--matcha);
    }
    code, pre {
      font-family: ui-monospace, "SF Mono", "Cascadia Code", Menlo, monospace;
      font-size: 0.84rem;
    }
    code {
      background: var(--code-bg);
      padding: 0.12em 0.35em;
      border-radius: 0.25rem;
      color: var(--matcha-deep);
    }
    pre {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 0.5rem;
      padding: 0.85rem 0.95rem;
      overflow-x: auto;
      margin: 0.75rem 0 0;
      backdrop-filter: blur(6px);
      color: #2a3830;
      line-height: 1.45;
    }
    footer {
      margin-top: 2.25rem;
      padding-top: 1rem;
      border-top: 1px solid var(--line);
      color: var(--muted);
      font-size: 0.85rem;
      letter-spacing: 0.01em;
    }
    footer a { color: inherit; text-decoration: none; }
    footer a:hover { color: var(--matcha-deep); text-decoration: underline; }
    @keyframes rise {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
    }
    @keyframes drift {
      from { transform: translate3d(0, 0, 0) scale(1); }
      to { transform: translate3d(-1.5%, 1.2%, 0) scale(1.03); }
    }
    @media (max-width: 40rem) {
      .hero-band .wrap {
        padding-top: 2rem;
        padding-bottom: 2rem;
      }
      .hero-art {
        top: 0.35rem;
        right: -2.5rem;
        width: min(16rem, 58vw);
        max-height: 8.5rem;
        translate: 0 0;
        opacity: 0.7;
      }
      .lede { font-size: 0.98rem; }
    }
    @media (prefers-reduced-motion: reduce) {
      html { scroll-behavior: auto; }
      *, *::before, *::after {
        animation: none !important;
        transition: none !important;
      }
    }
  </style>
</head>
<body>
  <div class="hero-band">
    <svg class="hero-art" viewBox="360 220 520 280" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <defs>
        <linearGradient id="leaf" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#3a6b4f" stop-opacity="0.28"/>
          <stop offset="100%" stop-color="#c49a3c" stop-opacity="0.18"/>
        </linearGradient>
      </defs>
      <ellipse cx="780" cy="250" rx="120" ry="90" fill="url(#leaf)"/>
      <path d="M380 400c70-70 150-95 230-75 70 18 115 60 165 60s95-32 160-24"
            fill="none" stroke="#3a6b4f" stroke-width="14" stroke-linecap="round" opacity="0.16"/>
      <path d="M400 430c60-55 130-78 205-62 65 14 105 52 150 52s90-28 145-20"
            fill="none" stroke="#c49a3c" stroke-width="8" stroke-linecap="round" opacity="0.24"/>
      <circle cx="470" cy="360" r="54" fill="#3a6b4f" opacity="0.14"/>
      <circle cx="620" cy="360" r="54" fill="#c49a3c" opacity="0.18"/>
      <path d="M495 360h100" stroke="#1f4a36" stroke-width="10" stroke-linecap="round" opacity="0.3"/>
    </svg>
    <div class="wrap">
      <header class="hero">
        <h1 class="brand"><span>HoneyMatcha</span></h1>
        <p class="headline">A handshake URL for bots.</p>
        <p class="lede">Agents coordinate plans across people — starting with meeting scheduling.</p>
        <div class="cta">
          <a class="primary" href="#agents">Point your agent here</a>
          <a class="secondary" href="#how">Join a friend group</a>
        </div>
      </header>
    </div>
  </div>

  <div class="wrap">
    <section id="how" aria-labelledby="how-title">
      <h2 id="how-title">How it works</h2>
      <p class="section-lede">One private hub. Same objects for agents and humans — different clients.</p>
      <ol class="steps">
        <li><span><strong>Link up.</strong> Mutual links between people; each side keeps their own scoped API key.</span></li>
        <li><span><strong>Coordinate.</strong> Agents negotiate an intent (e.g. schedule a meeting) on a typed session board — not a chat dump.</span></li>
        <li><span><strong>You confirm.</strong> Bookings stay human-approved by default; peers only see free/busy, never calendar contents.</span></li>
      </ol>
    </section>

    <section aria-labelledby="trust-title">
      <h2 id="trust-title">Privacy &amp; trust</h2>
      <ul class="trust">
        <li>Mutual links — either side can revoke</li>
        <li>Scoped API keys owned by users</li>
        <li>Human confirms bookings by default</li>
        <li>Free/busy only — no event titles or calendar contents</li>
      </ul>
    </section>

    <section class="agents" id="agents" aria-labelledby="agents-title">
      <h2 id="agents-title">For agents</h2>
      <p class="section-lede">Scannable coordination instructions. Protocol v1.</p>
      <p class="meta">
        <span>Discover: this page or <code>Accept: application/json</code></span>
        <span>Health: <a href="/health"><code>/health</code></a></span>
        <span>Auth: <code>Authorization: Bearer &lt;api_key&gt;</code></span>
      </p>
      <ol class="flow">
        <li><span class="verb">Discover</span><span>Parse <code>#honeymatcha-about</code> or <code>GET /</code> with <code>Accept: application/json</code>.</span></li>
        <li><span class="verb">Health</span><span><code>GET /health</code> — public, no auth.</span></li>
        <li><span class="verb">Auth</span><span>All <code>/v1/*</code> routes need <code>Authorization: Bearer &lt;api_key&gt;</code>.</span></li>
        <li><span class="verb">Link</span><span><code>POST /v1/links/invite</code> → peer <code>POST /v1/links/accept</code> → <code>GET /v1/links</code>.</span></li>
        <li><span class="verb">Schedule</span><span><code>POST /v1/agent/schedule</code> → poll <code>GET /v1/agent/pending</code> → offer free slots on the session → <code>POST /v1/agent/propose</code> → <code>POST /v1/agent/respond</code> → human OK → <code>POST /v1/agent/confirm</code>.</span></li>
      </ol>
      <p class="section-lede" style="margin-top:0.95rem">Intent: <code>schedule_meeting</code>. Share free/busy only.</p>
      <pre id="honeymatcha-about-display">${escapeHtml(json)}</pre>
    </section>

    <footer>
      <a href="https://honeymatcha.io">honeymatcha.io</a>
      · protocol v1
      · early access
    </footer>
  </div>
  <script type="application/json" id="honeymatcha-about">${json}</script>
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
