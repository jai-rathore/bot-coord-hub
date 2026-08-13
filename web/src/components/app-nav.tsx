"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import { BrandLink } from "@/components/brand-link";

const NAV: Array<{ href: string; label: string; exact?: boolean }> = [
  { href: "/app", label: "Home", exact: true },
  { href: "/app/tasks", label: "Tasks" },
  { href: "/app/people", label: "People" },
  { href: "/app/attention", label: "Needs your attention" },
  { href: "/app/activity", label: "Activity" },
  { href: "/app/settings", label: "Settings" },
];

export function AppNav({ attentionCount = 0 }: { attentionCount?: number }) {
  const pathname = usePathname();

  return (
    <header className="border-b border-line bg-[rgba(255,252,246,0.65)] backdrop-blur-sm">
      <div className="mx-auto w-[min(64rem,calc(100%-2rem))] py-3">
        <div className="flex items-center justify-between gap-4">
          <BrandLink href="/app" />
          <UserButton />
        </div>
        <nav
          aria-label="HoneyMatcha"
          className="mt-3 flex snap-x gap-1 overflow-x-auto pb-1 text-sm [scrollbar-width:none] sm:mt-2"
        >
            {NAV.map((item) => {
              const active = item.exact
                ? pathname === item.href
                : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`shrink-0 snap-start whitespace-nowrap rounded-md px-2.5 py-1.5 no-underline transition ${
                    active
                      ? "bg-matcha-deep text-[#f7faf6] hover:text-[#f7faf6]"
                      : "text-muted hover:bg-[rgba(111,154,124,0.12)] hover:text-matcha-deep"
                  }`}
                >
                  {item.label}
                  {item.href === "/app/attention" && attentionCount > 0 ? (
                    <span className="ml-1.5 rounded-full bg-honey px-1.5 py-0.5 text-[0.68rem] font-bold text-matcha-deep">
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
