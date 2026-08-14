"use client";

import { CopyBlock } from "@/components/copy-block";
import { ConnectCalendar } from "@/components/connect-calendar";
import type { CalendarConnectionSummary } from "@/components/connect-calendar";
import { ASK_AGENT_PROMPT, GROK_BOT_URL } from "@/lib/connect-copy";

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
      className="relative overflow-hidden rounded-[1.5rem] border border-honey/35 bg-[linear-gradient(145deg,rgba(255,252,243,0.95),rgba(240,220,168,0.24))] p-5 shadow-[0_18px_45px_rgba(148,104,20,0.08)] sm:p-7"
    >
      <div
        className="absolute -top-24 -right-20 h-56 w-56 rounded-full bg-honey-soft/25 blur-2xl"
        aria-hidden="true"
      />
      <p className="section-kicker relative">
        Setup
      </p>
      <h2
        id="setup-title"
        className="relative mt-1 font-[family-name:var(--font-fraunces)] text-2xl font-semibold tracking-[-0.03em] text-matcha-deep sm:text-3xl"
      >
        Two things, then your Grok Bot can work
      </h2>
      <p className="relative mt-2 max-w-2xl text-sm leading-6 text-muted">
        HoneyMatcha is where your Grok Bot coordinates with other people. You
        connect a calendar and approve the Bot once. After that, you talk to
        your Bot — not this website — unless something needs your say.
      </p>

      <ol className="relative mt-6 grid list-none gap-4 p-0 lg:grid-cols-2">
        <li className="rounded-2xl border border-white bg-white/65 p-4 shadow-[0_6px_18px_rgba(23,63,46,0.04)] sm:p-5">
          <div className="flex items-center gap-3">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-matcha-deep text-xs font-bold text-white">
              1
            </span>
            <p className="font-semibold text-ink">
              Connect Google Calendar{" "}
            {calendarDone ? (
              <span className="font-normal text-matcha">· done</span>
            ) : null}
            </p>
          </div>
          {calendarDone ? (
            <p className="mt-3 text-sm text-muted">
              Free/busy only. Event titles stay private.
            </p>
          ) : (
            <ConnectCalendar initial={calendar} />
          )}
        </li>
        <li className="rounded-2xl border border-white bg-white/65 p-4 shadow-[0_6px_18px_rgba(23,63,46,0.04)] sm:p-5">
          <div className="flex items-center gap-3">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-honey text-xs font-bold text-white">
              2
            </span>
            <p className="font-semibold text-ink">
              Connect your Grok Bot{" "}
            {agentDone ? (
              <span className="font-normal text-matcha">· done</span>
            ) : null}
            </p>
          </div>
          {agentDone ? (
            <p className="mt-3 text-sm text-muted">
              {agent.name ?? "Your Grok Bot"} is connected. Ask it to coordinate
              from here.
            </p>
          ) : (
            <>
              <p className="mt-3 text-sm leading-6 text-muted">
                Open <a href={GROK_BOT_URL}>Grok Bot at x.ai/bot</a>, paste this
                into your Bot&apos;s conversation, and approve the verification
                link it returns.
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
