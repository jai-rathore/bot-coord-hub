"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import { BrandLink } from "@/components/brand-link";
import { MobileTabBar } from "@/components/mobile-tab-bar";
import { NavIcon, type NavGlyph } from "@/components/nav-icon";
import { NavPending } from "@/components/nav-pending";

type NavItem = { href: string; label: string; hint: string; exact?: boolean };

function NavLink({
  item,
  icon,
  active,
  badge,
}: {
  item: NavItem;
  icon: NavGlyph;
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
      <NavPending />
    </Link>
  );
}

/**
 * Two navs for two hands.
 *
 * A desktop has room to show every destination at once, so it still gets the
 * rail. A phone does not, and the rail's answer put destinations both out of
 * reach and out of sight. There it
 * becomes a fixed tab bar at the bottom instead; see mobile-tab-bar.tsx for how
 * the slots are chosen. The header keeps only what is about *you* rather than
 * about where you are going: the brand, the agent's pulse, and your account.
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

  const items: Array<{ item: NavItem; icon: NavGlyph; badge?: number }> = [
    { item: { href: "/", label: "Home", hint: "Your home", exact: true }, icon: "home" },
    {
      item: { href: "/app/events", label: "Plans", hint: "Plans with a group" },
      icon: "events",
      badge: eventsUnreadCount,
    },
    {
      item: { href: "/app/people", label: "Connections", hint: "People and agents you know" },
      icon: "people",
    },
    {
      item: {
        href: "/app/recruiting",
        label: "Recruiting",
        hint: "Align role and candidate expectations",
      },
      icon: "briefcase",
    },
  ];

  if (discoveryEnabled) {
    items.push({
      item: { href: "/app/discovery", label: "Discover", hint: "Find the right people" },
      icon: "discovery",
    });
  }
  if (handle) {
    items.push({
      item: { href: "/app/code", label: "Share", hint: "Your meeting code and public page" },
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
  items.push({
    item: {
      href: "/app/agent",
      label: "Agents",
      hint: agentConnected
        ? "Choose an operator and review agent activity"
        : "Use Sage or connect another agent",
    },
    icon: "agent",
  });
  items.push({
    item: { href: "/app/settings", label: "Settings", hint: "Calendar and account" },
    icon: "settings",
  });

  return (
    <>
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

          <div className="mt-3 -mx-1 hidden overflow-x-auto px-1 pb-1 [scrollbar-width:none] sm:block [&::-webkit-scrollbar]:hidden">
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

      <MobileTabBar
        attentionCount={attentionCount}
        eventsUnreadCount={eventsUnreadCount}
        discoveryEnabled={discoveryEnabled}
        agentConnected={agentConnected}
        handle={handle}
      />
    </>
  );
}
