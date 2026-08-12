"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import { BrandLink } from "@/components/brand-link";

const NAV: Array<{ href: string; label: string; exact?: boolean }> = [
  { href: "/app", label: "Home", exact: true },
  { href: "/app/keys", label: "Keys" },
  { href: "/app/links", label: "Links" },
  { href: "/app/activity", label: "Activity" },
  { href: "/app/intents", label: "Intents" },
  { href: "/app/confirm", label: "Confirm" },
  { href: "/app/settings", label: "Settings" },
];

export function AppNav() {
  const pathname = usePathname();

  return (
    <header className="border-b border-line bg-[rgba(255,252,246,0.65)] backdrop-blur-sm">
      <div className="mx-auto flex w-[min(64rem,calc(100%-2rem))] flex-wrap items-center justify-between gap-3 py-3">
        <div className="flex items-center gap-4">
          <BrandLink />
          <nav className="flex flex-wrap gap-1 text-sm">
            {NAV.map((item) => {
              const active = item.exact
                ? pathname === item.href
                : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`rounded-md px-2.5 py-1.5 no-underline transition ${
                    active
                      ? "bg-matcha-deep text-[#f7faf6] hover:text-[#f7faf6]"
                      : "text-muted hover:bg-[rgba(111,154,124,0.12)] hover:text-matcha-deep"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
        <UserButton />
      </div>
    </header>
  );
}
