"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import { BrandLink } from "@/components/brand-link";

const NAV: Array<{ href: string; label: string; exact?: boolean }> = [
  { href: "/app", label: "Home", exact: true },
  { href: "/app/tasks", label: "Tasks" },
  { href: "/app/events", label: "Events" },
  { href: "/app/discovery", label: "Discovery" },
  { href: "/app/people", label: "People" },
  { href: "/app/attention", label: "Needs your attention" },
  { href: "/app/activity", label: "Activity" },
  { href: "/app/settings", label: "Settings" },
];

function NavIcon({ href }: { href: string }) {
  const paths: Record<string, React.ReactNode> = {
    "/app": <path d="M4 11.5 12 5l8 6.5V20h-5v-5H9v5H4v-8.5Z" />,
    "/app/tasks": (
      <>
        <rect x="5" y="4" width="14" height="16" rx="2" />
        <path d="M9 9h6M9 13h6M9 17h4" />
      </>
    ),
    "/app/events": (
      <>
        <rect x="4" y="5" width="16" height="15" rx="2" />
        <path d="M8 3v4M16 3v4M4 10h16M9 14h2M9 17h6" />
      </>
    ),
    "/app/discovery": (
      <>
        <circle cx="11" cy="11" r="6" />
        <path d="m16 16 4 4M11 8v6M8 11h6" />
      </>
    ),
    "/app/people": (
      <>
        <circle cx="9" cy="9" r="3" />
        <circle cx="17" cy="10" r="2" />
        <path d="M3.5 20c.4-4 2.2-6 5.5-6s5.1 2 5.5 6M15 15c3.1 0 4.8 1.7 5 5" />
      </>
    ),
    "/app/attention": (
      <>
        <path d="M12 3 2.8 19h18.4L12 3Z" />
        <path d="M12 9v4m0 3h.01" />
      </>
    ),
    "/app/activity": (
      <>
        <path d="M4 19V9m5 10V5m5 14v-7m5 7V3" />
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

export function AppNav({
  attentionCount = 0,
  discoveryEnabled = false,
}: {
  attentionCount?: number;
  discoveryEnabled?: boolean;
}) {
  const pathname = usePathname();
  const visibleNav = discoveryEnabled
    ? NAV
    : NAV.filter((item) => item.href !== "/app/discovery");

  return (
    <header className="sticky top-0 z-40 border-b border-line/80 bg-[rgba(247,249,246,0.82)] px-4 backdrop-blur-xl sm:px-6">
      <div className="mx-auto w-full max-w-[72rem] py-3">
        <div className="flex items-center justify-between gap-4">
          <BrandLink href="/app" />
          <div className="flex items-center gap-3">
            <span className="hidden items-center gap-2 rounded-full border border-line bg-white/65 px-3 py-1.5 text-[0.68rem] font-semibold text-muted sm:flex">
              <span className="live-dot animate-pulse-live bg-matcha" />
              Agent workspace
            </span>
            <UserButton />
          </div>
        </div>
        <nav
          aria-label="HoneyMatcha"
          className="mt-3 flex snap-x gap-1 overflow-x-auto pb-1 text-sm [scrollbar-width:none]"
        >
          {visibleNav.map((item) => {
            const active = item.exact
              ? pathname === item.href
              : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex shrink-0 snap-start items-center gap-1.5 whitespace-nowrap rounded-xl px-3 py-2 no-underline transition ${
                  active
                    ? "bg-matcha-deep text-white shadow-[0_6px_16px_rgba(23,63,46,0.16)] hover:text-white"
                    : "text-muted hover:bg-white/75 hover:text-matcha-deep"
                }`}
              >
                <NavIcon href={item.href} />
                {item.label}
                {item.href === "/app/attention" && attentionCount > 0 ? (
                  <span className="ml-0.5 rounded-full bg-honey px-1.5 py-0.5 text-[0.65rem] font-bold text-matcha-deep">
                    {attentionCount}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
