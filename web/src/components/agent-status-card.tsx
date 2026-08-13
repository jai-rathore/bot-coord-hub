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
      label: "Your agent",
      value: status.agent.connected
        ? `${status.agent.name ?? "Agent"} connected · last active ${relativeTime(status.agent.lastUsedAt)}`
        : status.agent.configured
          ? "Connection created · waiting for your agent"
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
          <p className="text-sm font-semibold uppercase tracking-[0.14em] text-matcha">
            At a glance
          </p>
          <h2
            id="status-title"
            className="mt-1 font-[family-name:var(--font-fraunces)] text-2xl font-semibold text-matcha-deep"
          >
            Ready when you are
          </h2>
        </div>
      </div>
      <div className="mt-4 overflow-hidden rounded-2xl border border-line bg-white/75 shadow-[0_16px_40px_rgba(31,74,54,0.06)]">
        {rows.map((row) => (
          <div
            key={row.label}
            className="grid gap-2 border-b border-line px-4 py-4 last:border-b-0 sm:grid-cols-[10rem_1fr_auto] sm:items-center"
          >
            <p className="font-medium text-ink">{row.label}</p>
            <p className="flex items-center gap-2 text-sm text-muted">
              <span
                aria-hidden="true"
                className={`h-2 w-2 rounded-full ${
                  row.ok ? "bg-matcha" : "bg-honey"
                }`}
              />
              {row.value}
            </p>
            <Link
              href={row.href}
              className="text-sm font-semibold text-matcha-deep no-underline hover:underline"
            >
              {row.action}
            </Link>
          </div>
        ))}
      </div>
    </section>
  );
}
