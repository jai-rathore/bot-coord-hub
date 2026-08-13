"use client";

import { CopyBlock } from "@/components/copy-block";
import { ConnectCalendar } from "@/components/connect-calendar";
import type { CalendarConnectionSummary } from "@/components/connect-calendar";
import { ASK_AGENT_PROMPT } from "@/lib/connect-copy";

type AgentStatus = {
  connected: boolean;
  configured: boolean;
  name: string | null;
};

export function SetupGuide({
  calendar,
  agent,
}: {
  calendar: CalendarConnectionSummary;
  agent: AgentStatus;
}) {
  const calendarDone = calendar.connected;
  const agentDone = agent.connected;
  if (calendarDone && agentDone) return null;

  return (
    <section
      aria-labelledby="setup-title"
      className="rounded-2xl border border-honey bg-[rgba(232,210,154,0.28)] p-5 sm:p-6"
    >
      <p className="text-sm font-semibold uppercase tracking-[0.14em] text-matcha">
        Setup
      </p>
      <h2
        id="setup-title"
        className="mt-1 font-[family-name:var(--font-fraunces)] text-2xl font-semibold text-matcha-deep"
      >
        Two things, then your agent can work
      </h2>
      <p className="mt-2 max-w-xl text-sm text-muted">
        HoneyMatcha is where your personal agent coordinates with other people.
        You connect a calendar and approve the agent once. After that, you talk
        to your agent — not this website — unless something needs your say.
      </p>

      <ol className="mt-6 grid list-none gap-6 p-0">
        <li>
          <p className="font-semibold text-ink">
            1. Connect Google Calendar{" "}
            {calendarDone ? (
              <span className="font-normal text-matcha">· done</span>
            ) : null}
          </p>
          {calendarDone ? (
            <p className="mt-1 text-sm text-muted">
              Free/busy only. Event titles stay private.
            </p>
          ) : (
            <ConnectCalendar initial={calendar} />
          )}
        </li>
        <li>
          <p className="font-semibold text-ink">
            2. Connect your agent{" "}
            {agentDone ? (
              <span className="font-normal text-matcha">· done</span>
            ) : null}
          </p>
          {agentDone ? (
            <p className="mt-1 text-sm text-muted">
              {agent.name ?? "Your agent"} is connected. Ask it to coordinate
              from here.
            </p>
          ) : (
            <>
              <p className="mt-1 text-sm text-muted">
                In Grok, Claude, or whatever you already use, paste this. Approve
                the link it shows you.
              </p>
              <div className="mt-3">
                <CopyBlock text={ASK_AGENT_PROMPT} />
              </div>
            </>
          )}
        </li>
      </ol>
    </section>
  );
}
