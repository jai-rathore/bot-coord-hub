import Link from "next/link";

type HomeStatus = {
  agent: {
    connected: boolean;
    configured: boolean;
    name: string | null;
    lastUsedAt: string | null;
  };
  calendarConnected: boolean;
  peopleCount: number;
  attentionCount: number;
};

function relativeTime(value: string | null) {
  if (!value) return null;
  const minutes = Math.max(
    1,
    Math.round((Date.now() - new Date(value).getTime()) / 60_000),
  );
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function AgentStatusCard({ status }: { status: HomeStatus }) {
  const rows = [
    {
      label: "Your Grok Bot",
      value: status.agent.connected
        ? `${status.agent.name ?? "Grok Bot"} connected · last active ${relativeTime(status.agent.lastUsedAt)}`
        : status.agent.configured
          ? "Connection created · waiting for your Bot"
          : "Not connected yet",
      ok: status.agent.connected,
      href: "/agents",
      action: status.agent.configured ? "Connection help" : "Connect",
    },
    {
      label: "Calendar",
      value: status.calendarConnected
        ? "Ready for real bookings"
        : "Not connected",
      ok: status.calendarConnected,
      href: "/app/settings",
      action: status.calendarConnected ? "Manage" : "Connect",
    },
    {
      label: "People",
      value:
        status.peopleCount > 0
          ? `${status.peopleCount} connected`
          : "No one added yet",
      ok: status.peopleCount > 0,
      href: "/app/people",
      action: status.peopleCount > 0 ? "View" : "Add someone",
    },
    {
      label: "Needs you",
      value:
        status.attentionCount > 0
          ? `${status.attentionCount} waiting`
          : "Nothing waiting",
      ok: status.attentionCount === 0,
      href: "/app/attention",
      action: "Open",
    },
  ];

  return (
    <section aria-labelledby="status-title">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="section-kicker">At a glance</p>
          <h2
            id="status-title"
            className="mt-1 font-[family-name:var(--font-fraunces)] text-2xl font-semibold tracking-[-0.03em] text-matcha-deep"
          >
            Ready when you are
          </h2>
        </div>
      </div>
      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {rows.map((row) => (
          <article
            key={row.label}
            className="surface-card surface-card-interactive flex min-h-44 flex-col p-5"
          >
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-ink">{row.label}</p>
              <span
                className={`rounded-full px-2 py-1 text-[0.62rem] font-bold tracking-[0.06em] uppercase ${
                  row.ok
                    ? "bg-matcha-soft/12 text-matcha"
                    : "bg-honey-soft/45 text-[#8a6013]"
                }`}
              >
                {row.ok ? "Ready" : "Action"}
              </span>
            </div>
            <p className="mt-5 flex items-start gap-2 text-sm leading-6 text-muted">
              <span
                aria-hidden="true"
                className={`mt-2 h-2 w-2 shrink-0 rounded-full ${
                  row.ok ? "bg-matcha" : "bg-honey"
                }`}
              />
              {row.value}
            </p>
            <Link
              href={row.href}
              className="mt-auto inline-flex items-center gap-1 pt-5 text-sm font-semibold text-matcha-deep no-underline hover:underline"
            >
              {row.action}
              <span aria-hidden="true">→</span>
            </Link>
          </article>
        ))}
      </div>
    </section>
  );
}
