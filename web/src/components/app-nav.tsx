"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import { BrandLink } from "@/components/brand-link";

type NavItem = { href: string; label: string; hint: string; exact?: boolean };

function NavIcon({ kind }: { kind: string }) {
  const paths: Record<string, React.ReactNode> = {
    home: <path d="M4 11.5 12 5l8 6.5V20h-5v-5H9v5H4v-8.5Z" />,
    events: (
      <>
        <rect x="4" y="5" width="16" height="15" rx="2" />
        <path d="M8 3v4M16 3v4M4 10h16M9 14h2M9 17h6" />
      </>
    ),
    people: (
      <>
        <circle cx="9" cy="9" r="3" />
        <circle cx="17" cy="10" r="2" />
        <path d="M3.5 20c.4-4 2.2-6 5.5-6s5.1 2 5.5 6M15 15c3.1 0 4.8 1.7 5 5" />
      </>
    ),
    discovery: (
      <>
        <circle cx="11" cy="11" r="6" />
        <path d="m16 16 4 4M11 8v6M8 11h6" />
      </>
    ),
    code: (
      <>
        <rect x="4" y="4" width="6" height="6" rx="1" />
        <rect x="14" y="4" width="6" height="6" rx="1" />
        <rect x="4" y="14" width="6" height="6" rx="1" />
        <path d="M14 14h3v3M20 20h-3M20 14v3" />
      </>
    ),
    approvals: (
      <>
        <path d="M12 3 2.8 19h18.4L12 3Z" />
        <path d="M12 9v4m0 3h.01" />
      </>
    ),
    agent: (
      <>
        <rect x="4" y="8" width="16" height="11" rx="3" />
        <path d="M12 4v4M8.5 13h.01M15.5 13h.01M9 16.5h6" />
      </>
    ),
    settings: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M12 4.5v-1M12 20.5v-1M19 12h1M4 12H3M17 7l.7-.7M6.3 17.7l-.7.7M17 17l.7.7M6.3 6.3l-.7-.7" />
      </>
    ),
  };

  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[kind]}
    </svg>
  );
}

function NavLink({
  item,
  icon,
  active,
  badge,
}: {
  item: NavItem;
  icon: string;
  active: boolean;
  badge?: number;
}) {
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      title={item.hint}
      className={`flex min-h-11 shrink-0 snap-start items-center gap-1.5 rounded-xl px-3 py-2 text-sm whitespace-nowrap no-underline transition ${
        active
          ? "bg-matcha-deep text-white shadow-[0_6px_16px_rgba(23,63,46,0.16)] hover:text-white"
          : "text-muted hover:bg-white/75 hover:text-matcha-deep"
      }`}
    >
      <NavIcon kind={icon} />
      {item.label}
      {badge ? (
        <span
          className={`ml-0.5 rounded-full px-1.5 py-0.5 text-[0.65rem] font-bold ${
            active ? "bg-white text-matcha-deep" : "bg-honey text-matcha-deep"
          }`}
        >
          {badge}
        </span>
      ) : null}
    </Link>
  );
}

/**
 * One rail of destinations, ordered by how often a phone thumb reaches for
 * them. Everything agent-shaped — status, credentials, capabilities, the
 * activity log — hides behind a single "Agent" entry that only appears once an
 * agent is actually connected. Someone using HoneyMatcha by hand should never
 * have to walk past machinery they will never switch on.
 */
export function AppNav({
  attentionCount = 0,
  eventsUnreadCount = 0,
  discoveryEnabled = false,
  agentConnected = false,
  handle = null,
}: {
  attentionCount?: number;
  eventsUnreadCount?: number;
  discoveryEnabled?: boolean;
  agentConnected?: boolean;
  handle?: string | null;
}) {
  const pathname = usePathname();
  const isActive = (item: NavItem) =>
    item.exact ? pathname === item.href : pathname.startsWith(item.href);

  const items: Array<{ item: NavItem; icon: string; badge?: number }> = [
    { item: { href: "/", label: "Home", hint: "Your home", exact: true }, icon: "home" },
    {
      item: { href: "/app/events", label: "Events", hint: "Plan with a group" },
      icon: "events",
      badge: eventsUnreadCount,
    },
    {
      item: { href: "/app/people", label: "People", hint: "Your connections" },
      icon: "people",
    },
  ];

  if (discoveryEnabled) {
    items.push({
      item: { href: "/app/discovery", label: "Discovery", hint: "Meet someone new" },
      icon: "discovery",
    });
  }
  if (handle) {
    items.push({
      item: { href: `/${handle}`, label: "My code", hint: "Your QR code and public page" },
      icon: "code",
    });
  }
  if (attentionCount > 0 || agentConnected) {
    items.push({
      item: { href: "/app/attention", label: "Approvals", hint: "Waiting on you" },
      icon: "approvals",
      badge: attentionCount,
    });
  }
  if (agentConnected) {
    items.push({
      item: { href: "/app/agent", label: "Agent", hint: "Agent setup and activity" },
      icon: "agent",
    });
  }
  items.push({
    item: { href: "/app/settings", label: "Settings", hint: "Calendar and account" },
    icon: "settings",
  });

  return (
    <header className="sticky top-0 z-40 border-b border-line/80 bg-[rgba(247,249,246,0.86)] px-4 backdrop-blur-xl sm:px-6">
      <div className="mx-auto w-full max-w-[72rem] py-3">
        <div className="flex items-center justify-between gap-3">
          <BrandLink href="/" />
          <div className="flex items-center gap-2 sm:gap-3">
            {agentConnected ? (
              <Link
                href="/app/agent"
                className="hidden items-center gap-2 rounded-full border border-line bg-white/70 px-3 py-1.5 text-[0.68rem] font-semibold text-muted no-underline transition hover:border-matcha-soft/60 hover:bg-white hover:text-matcha-deep sm:flex"
              >
                <span className="live-dot animate-pulse-live bg-matcha" />
                Agent connected
              </Link>
            ) : null}
            <UserButton />
          </div>
        </div>

        <div className="mt-3 -mx-1 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <nav
            aria-label="HoneyMatcha"
            className="flex w-max snap-x items-center gap-1"
          >
            {items.map(({ item, icon, badge }) => (
              <NavLink
                key={item.href}
                item={item}
                icon={icon}
                active={isActive(item)}
                badge={badge}
              />
            ))}
          </nav>
        </div>
      </div>
    </header>
  );
}
