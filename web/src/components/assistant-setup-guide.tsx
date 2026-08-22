"use client";

import { useId, useState } from "react";
import { CopyBlock } from "@/components/copy-block";
import {
  AGENT_CLIENTS,
  standingCheckPrompt,
  type AgentClientId,
} from "@/lib/agent-clients";
import { MCP_URL, PRODUCTION_ORIGIN } from "@/lib/connect-copy";

const CLIENT_MARKS: Record<AgentClientId, string> = {
  chatgpt: "◎",
  claude: "C",
  gemini: "✦",
  grok: "G",
  cursor: "⌁",
};

export function AssistantSetupGuide({
  id = "connect-assistant",
  className = "",
}: {
  id?: string;
  className?: string;
}) {
  const [selectedId, setSelectedId] = useState<AgentClientId>("chatgpt");
  const tabId = useId();
  const selected =
    AGENT_CLIENTS.find((client) => client.id === selectedId) ??
    AGENT_CLIENTS[0];

  return (
    <section
      id={id}
      aria-labelledby={`${tabId}-title`}
      className={`scroll-mt-28 overflow-hidden rounded-[1.75rem] border border-matcha-soft/35 bg-[linear-gradient(145deg,rgba(255,255,252,0.96),rgba(235,243,237,0.94)_58%,rgba(249,241,218,0.88))] p-5 shadow-[0_22px_70px_rgba(23,63,46,0.1)] sm:p-7 ${className}`}
    >
      <div className="max-w-3xl">
        <p className="section-kicker">Assistant setup</p>
        <h2
          id={`${tabId}-title`}
          className="mt-2 font-[family-name:var(--font-fraunces)] text-2xl font-semibold tracking-[-0.035em] text-matcha-deep sm:text-3xl"
        >
          Same HoneyMatcha. Different menu.
        </h2>
        <p className="mt-2 text-sm leading-6 text-muted sm:text-base">
          Choose the assistant you use. The URL and permissions stay the same;
          only the buttons you press are different.
        </p>
      </div>

      <div
        role="group"
        aria-label="Choose your assistant"
        className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-5"
      >
        {AGENT_CLIENTS.map((client) => {
          const active = client.id === selected.id;
          return (
            <button
              key={client.id}
              type="button"
              aria-pressed={active}
              onClick={() => setSelectedId(client.id)}
              className={`flex min-h-12 cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm font-semibold transition ${
                active
                  ? "border-matcha-deep bg-matcha-deep text-white shadow-[0_8px_24px_rgba(23,63,46,0.2)]"
                  : "border-white/90 bg-white/72 text-muted hover:border-matcha-soft/60 hover:bg-white hover:text-matcha-deep"
              }`}
            >
              <span
                aria-hidden="true"
                className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg text-xs ${
                  active
                    ? "bg-white/12 text-honey-soft"
                    : "bg-matcha-soft/10 text-matcha-deep"
                }`}
              >
                {CLIENT_MARKS[client.id]}
              </span>
              <span className="truncate">{client.name}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.08fr_0.92fr]">
        <div className="rounded-2xl border border-white bg-white/76 p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold tracking-[0.12em] text-honey uppercase">
                Connect {selected.name}
              </p>
              <p className="mt-1 max-w-xl text-sm leading-6 text-muted">
                {selected.summary}
              </p>
            </div>
            <a
              href={selected.homeUrl}
              className="button-secondary min-h-10 shrink-0 px-3 py-1.5 text-xs"
            >
              Open {selected.name} <span aria-hidden="true">↗</span>
            </a>
          </div>

          <ol className="mt-5 grid list-none gap-3 p-0">
            {selected.connectSteps.map((step, index) => (
              <li key={step} className="grid grid-cols-[auto_1fr] gap-3">
                <span className="mt-0.5 grid h-6 w-6 place-items-center rounded-full bg-honey-soft/55 text-[0.68rem] font-bold text-matcha-deep">
                  {index + 1}
                </span>
                <span className="text-sm leading-6 text-ink">{step}</span>
              </li>
            ))}
          </ol>

          <div className="mt-5">
            <p className="mb-2 text-xs font-semibold tracking-[0.1em] text-muted uppercase">
              MCP URL
            </p>
            <CopyBlock text={MCP_URL} label="Copy URL" />
          </div>

          {selected.caveat ? (
            <p className="mt-4 rounded-xl border border-honey/20 bg-honey-soft/18 px-3 py-2.5 text-xs leading-5 text-muted">
              <strong className="text-ink">Worth knowing.</strong>{" "}
              {selected.caveat}
            </p>
          ) : null}

          {selected.connectDocsUrl ? (
            <p className="mt-4 text-xs text-muted">
              <a href={selected.connectDocsUrl}>
                Read {selected.name}&rsquo;s official connection guide
              </a>
              .
            </p>
          ) : null}
        </div>

        <div className="relative overflow-hidden rounded-2xl border border-matcha-deep bg-matcha-deep p-4 text-white shadow-[0_16px_40px_rgba(23,63,46,0.18)] sm:p-5">
          <div
            className="absolute -top-16 -right-12 h-44 w-44 rounded-full bg-[radial-gradient(circle,rgba(240,220,168,0.2),transparent_68%)]"
            aria-hidden="true"
          />
          <div className="relative">
            <p className="flex items-center gap-2 text-xs font-bold tracking-[0.12em] text-honey-soft uppercase">
              <span className="live-dot animate-pulse-live" />
              After connecting
            </p>
            <h3 className="mt-2 font-[family-name:var(--font-fraunces)] text-xl font-semibold tracking-[-0.025em]">
              Keep HoneyMatcha checking.
            </h3>
            {selected.standingCheck ? (
              <>
                <p className="mt-2 text-sm leading-6 text-[#dce8df]">
                  {selected.name} calls this{" "}
                  <strong className="text-white">
                    {selected.standingCheck.featureName}
                  </strong>
                  . Set it once so incoming coordination does not wait for you
                  to open a chat.
                </p>
                <ol className="mt-4 grid list-decimal gap-1.5 pl-5 text-xs leading-5 text-[#dce8df]">
                  {selected.standingCheck.steps.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
                <div className="mt-4">
                  <CopyBlock
                    text={standingCheckPrompt(PRODUCTION_ORIGIN)}
                    label="Copy prompt"
                  />
                </div>
                <p className="mt-3 text-xs leading-5 text-[#c7d9cc]">
                  The prompt stays silent when nothing is pending and never
                  answers or books on your behalf.
                </p>
              </>
            ) : (
              <p className="mt-2 text-sm leading-6 text-[#dce8df]">
                {selected.caveat} HoneyMatcha will still email you when work
                needs attention.
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
