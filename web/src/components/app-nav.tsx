"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import { BrandLink } from "@/components/brand-link";

type NavItem = { href: string; label: string; hint: string; exact?: boolean };

/** What you start. These are destinations people come here to act in. */
const PRIMARY: NavItem[] = [
  { href: "/app", label: "Home", hint: "Overview", exact: true },
  { href: "/app/events", label: "Events", hint: "Plan with a group" },
  { href: "/app/people", label: "People", hint: "Your connections" },
  { href: "/app/discovery", label: "Discovery", hint: "Meet someone new" },
];

/** What you review. Records, decisions, and setup. */
const SECONDARY: NavItem[] = [
  { href: "/app/attention", label: "Approvals", hint: "Waiting on you" },
  { href: "/app/activity", label: "Activity", hint: "What's happening" },
  { href: "/app/tasks", label: "Capabilities", hint: "What agents can do" },
  { href: "/app/settings", label: "Settings", hint: "Calendar and account" },
];

function NavIcon({ href }: { href: string }) {
  const paths: Record<string, React.ReactNode> = {
    "/app": <path d="M4 11.5 12 5l8 6.5V20h-5v-5H9v5H4v-8.5Z" />,
    "/app/events": (
      <>
        <rect x="4" y="5" width="16" height="15" rx="2" />
        <path d="M8 3v4M16 3v4M4 10h16M9 14h2M9 17h6" />
      </>
    ),
    "/app/people": (
      <>
        <circle cx="9" cy="9" r="3" />
        <circle cx="17" cy="10" r="2" />
        <path d="M3.5 20c.4-4 2.2-6 5.5-6s5.1 2 5.5 6M15 15c3.1 0 4.8 1.7 5 5" />
      </>
    ),
    "/app/discovery": (
      <>
        <circle cx="11" cy="11" r="6" />
        <path d="m16 16 4 4M11 8v6M8 11h6" />
      </>
    ),
    "/app/attention": (
      <>
        <path d="M12 3 2.8 19h18.4L12 3Z" />
        <path d="M12 9v4m0 3h.01" />
      </>
    ),
    "/app/activity": <path d="M4 19V9m5 10V5m5 14v-7m5 7V3" />,
    "/app/tasks": (
      <>
        <rect x="5" y="4" width="14" height="16" rx="2" />
        <path d="M9 9h6M9 13h6M9 17h4" />
      </>
    ),
    "/app/settings": (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19 13.5v-3l-2-.7-.7-1.6.9-1.9-2.1-2.1-1.9.9-1.7-.7-.6-2H8l-.7 2-1.6.7-1.9-.9-2.1 2.1.9 1.9-.7 1.7-2 .6v3l2 .7.7 1.6-.9 1.9 2.1 2.1 1.9-.9 1.6.7.7 2h3l.7-2 1.6-.7 1.9.9 2.1-2.1-.9-1.9.7-1.6 1.9-.7Z" />
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
      {paths[href]}
    </svg>
  );
}

function NavLink({
  item,
  active,
  badge,
}: {
  item: NavItem;
  active: boolean;
  badge?: number;
}) {
  return (
    <Link
      href={item.href}
      title={item.hint}
      aria-current={active ? "page" : undefined}
      className={`flex shrink-0 snap-start items-center gap-1.5 whitespace-nowrap rounded-xl px-3 py-2 text-sm no-underline transition ${
        active
          ? "bg-matcha-deep text-white shadow-[0_6px_16px_rgba(23,63,46,0.16)] hover:text-white"
          : "text-muted hover:bg-white/75 hover:text-matcha-deep"
      }`}
    >
      <NavIcon href={item.href} />
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

export function AppNav({
  attentionCount = 0,
  discoveryEnabled = false,
  agentConnected = false,
}: {
  attentionCount?: number;
  discoveryEnabled?: boolean;
  agentConnected?: boolean;
}) {
  const pathname = usePathname();
  const isActive = (item: NavItem) =>
    item.exact ? pathname === item.href : pathname.startsWith(item.href);

  const primary = discoveryEnabled
    ? PRIMARY
    : PRIMARY.filter((item) => item.href !== "/app/discovery");

  return (
    <header className="sticky top-0 z-40 border-b border-line/80 bg-[rgba(247,249,246,0.86)] px-4 backdrop-blur-xl sm:px-6">
      <div className="mx-auto w-full max-w-[72rem] py-3">
        <div className="flex items-center justify-between gap-3">
          <BrandLink href="/app" />
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Was a decorative span that read as a dead button. It is now a
                real link that reports agent status and goes somewhere useful. */}
            <Link
              href="/app/keys"
              className="hidden items-center gap-2 rounded-full border border-line bg-white/70 px-3 py-1.5 text-[0.68rem] font-semibold text-muted no-underline transition hover:border-matcha-soft/60 hover:bg-white hover:text-matcha-deep sm:flex"
            >
              <span
                className={`live-dot ${
                  agentConnected
                    ? "animate-pulse-live bg-matcha"
                    : "bg-muted/50"
                }`}
              />
              {agentConnected ? "Agent connected" : "Connect an agent"}
            </Link>
            <UserButton />
          </div>
        </div>

        <div className="mt-3 -mx-1 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <nav
            aria-label="HoneyMatcha"
            className="flex w-max snap-x items-center gap-1"
          >
            {primary.map((item) => (
              <NavLink key={item.href} item={item} active={isActive(item)} />
            ))}

            <span
              aria-hidden="true"
              className="mx-1 h-5 w-px shrink-0 bg-line"
            />

            {SECONDARY.map((item) => (
              <NavLink
                key={item.href}
                item={item}
                active={isActive(item)}
                badge={item.href === "/app/attention" ? attentionCount : 0}
              />
            ))}
          </nav>
        </div>
      </div>
    </header>
  );
}
